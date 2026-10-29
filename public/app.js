const $ = (id) => document.getElementById(id);
const state = { battery: null, location: null, lastText: "", look: null, step: 0 };

// ---------- screens ----------
function go(name) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === name));
  if (name === "fix") startCamera(); else stopCamera();
  if (name === "nearby") loadNearby();
  if (name === "share") prepareShare();
  if (name === "riders") drawRiders();
  if (name === "map") loadMap().catch(() => { $("mapSummary").textContent = "Couldn't load the map. Check your signal."; });
  window.scrollTo(0, 0);
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-go]");
  if (b) go(b.dataset.go);
});

// ---------- server calls ----------
async function postJSON(url, body) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json();
}
// entries: [name, value, filename?]
async function postForm(url, entries) {
  const fd = new FormData();
  for (const [k, v, filename] of entries) if (v != null) filename ? fd.append(k, v, filename) : fd.append(k, v);
  const r = await fetch(url, { method: "POST", body: fd });
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json();
}

fetch("/api/health").then((r) => r.json()).then((h) => { $("demoBadge").hidden = h.mode !== "canned"; }).catch(() => {});

// ---------- voice replies (on-device, free) ----------
const VOICE_KEY = "nightride.voice";
let voiceOn = (() => { try { return localStorage.getItem(VOICE_KEY) !== "off"; } catch { return true; } })();
function renderVoice() {
  $("voiceToggle").textContent = voiceOn ? "Voice on" : "Voice off";
  $("voiceToggle").setAttribute("aria-pressed", String(voiceOn));
}
$("voiceToggle").addEventListener("click", () => {
  voiceOn = !voiceOn;
  try { localStorage.setItem(VOICE_KEY, voiceOn ? "on" : "off"); } catch {}
  if (!voiceOn && "speechSynthesis" in window) speechSynthesis.cancel();
  renderVoice();
});
renderVoice();

function speak(text) {
  if (!voiceOn || !text || !("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.95;
  speechSynthesis.speak(u);
}

// ---------- battery + location ----------
async function watchBattery() {
  if (!navigator.getBattery) return;
  const b = await navigator.getBattery();
  const update = () => {
    state.battery = b.level;
    $("battery").textContent = `${Math.round(b.level * 100)}%`;
    $("lowBattery").hidden = !(b.level < 0.15 && !b.charging);
  };
  update();
  b.addEventListener("levelchange", update);
  b.addEventListener("chargingchange", update);
}
function watchLocation() {
  if (!navigator.geolocation) return;
  navigator.geolocation.watchPosition(
    (p) => {
      const first = !state.location;
      state.location = { lat: p.coords.latitude, lng: p.coords.longitude };
      $("locDot").classList.add("on");
      // Warm the server's places cache now; the free map lookup can take most of a minute.
      if (first) postJSON("/api/nearby", { location: state.location, lane: "ride" }).catch(() => {});
    },
    () => $("locDot").classList.remove("on"),
    { enableHighAccuracy: true, maximumAge: 30000 },
  );
}

// ---------- recording ----------
const AUDIO_TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"];
const VIDEO_TYPES = ["video/mp4", "video/webm;codecs=vp8", "video/webm"];
const pickMime = (list) => list.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || "";
const extFor = (mime) => (mime.includes("mp4") ? "mp4" : "webm");

// ---------- 1. hold to talk ----------
const talk = $("talk");
let mic = null, rec = null, chunks = [], startedAt = 0, holding = false;

talk.addEventListener("contextmenu", (e) => e.preventDefault());
talk.addEventListener("pointerdown", async (e) => {
  e.preventDefault();
  talk.setPointerCapture(e.pointerId);
  holding = true;
  if (!mic) {
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      holding = false;
      $("talkHint").textContent = "The mic is blocked. Type instead below.";
      return;
    }
  }
  // The permission prompt may have eaten the press; only record if still held.
  if (holding) beginRecording();
  else $("talkHint").textContent = "Mic ready. Hold the button while you talk.";
});
const release = () => {
  holding = false;
  if (rec && rec.state === "recording") rec.stop();
};
talk.addEventListener("pointerup", release);
talk.addEventListener("pointercancel", release);

function beginRecording() {
  const mimeType = pickMime(AUDIO_TYPES);
  rec = new MediaRecorder(mic, mimeType ? { mimeType } : undefined);
  chunks = [];
  startedAt = performance.now();
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.onstop = onTalkStop;
  rec.start();
  talk.classList.add("recording");
  $("talkHint").textContent = "Listening. Let go when you're done.";
}

async function onTalkStop() {
  talk.classList.remove("recording");
  if (performance.now() - startedAt < 400) {
    $("talkHint").textContent = "Hold the button while you talk.";
    return;
  }
  $("talkHint").textContent = "Hold the button and tell me what happened.";
  const type = rec.mimeType || "audio/webm";
  const blob = new Blob(chunks, { type });
  go("listen");
  $("transcript").textContent = "...";
  $("dispatchCard").hidden = true;
  try {
    const { text } = await postForm("/api/transcribe", [["audio", blob, `talk.${extFor(type)}`]]);
    if (!text) throw new Error("no speech");
    await handleText(text);
  } catch {
    $("transcript").textContent = "I couldn't hear that. Try again, or type it.";
  }
}

$("typeForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = $("typeText").value.trim();
  if (!text) return;
  $("typeText").value = "";
  go("listen");
  try { await handleText(text); } catch { $("transcript").textContent = "No signal. Try again."; }
});

// ---------- 2. dispatch ----------
const LANE_UI = {
  fix: { name: "FIX IT", go: "fix", label: "Open the camera" },
  ride: { name: "RIDE", go: "nearby", label: "Show me options" },
  safe: { name: "SAFE PLACE", go: "nearby", label: "Show me places" },
};

async function handleText(text) {
  state.lastText = text;
  $("transcript").textContent = `"${text}"`;
  $("dispatchCard").hidden = true;
  const d = await postJSON("/api/dispatch", { text, location: state.location, battery: state.battery });
  if (d.lane === "emergency") {
    $("emergencySay").textContent = d.say;
    $("emergency").hidden = false;
    speak(d.say);
    return;
  }
  state.lane = d.lane;
  const ui = LANE_UI[d.lane] || LANE_UI.ride;
  $("laneName").textContent = ui.name;
  $("laneSay").textContent = d.say;
  $("laneGo").textContent = ui.label;
  $("laneGo").onclick = () => go(ui.go);
  // A verified card that matches their words, one tap away.
  $("laneCard").hidden = !d.card;
  if (d.card) {
    $("laneCard").textContent = `What to do: ${d.card.title}`;
    $("laneCard").onclick = () => showGuide(d.card);
  }
  $("dispatchCard").hidden = false;
  speak(d.say);
}

// ---------- playbook card ----------
function sourceLinks(sources) {
  return sources.map((s) => {
    const a = document.createElement("a");
    a.href = s.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = s.org;
    return a;
  });
}

function showGuide(card) {
  go("guide");
  $("guideTag").textContent = `Verified playbook · ${card.confidence}`;
  $("guideTitle").textContent = card.title;
  $("guideSummary").textContent = card.summary;
  const li = (text) => Object.assign(document.createElement("li"), { textContent: text });
  $("guideSteps").replaceChildren(...card.steps.map(li));
  $("guideWarnings").replaceChildren(...card.warnings.map(li));
  $("guidePrevent").textContent = card.prevent ? `Next time: ${card.prevent}` : "";
  $("guideSources").replaceChildren(...card.sources.map((s) => {
    const item = document.createElement("li");
    const [a] = sourceLinks([s]);
    a.textContent = `${s.org}: ${s.title}`;
    item.append(a);
    return item;
  }));
  speak(card.summary);
}

$("closeEmergency").addEventListener("click", () => {
  $("emergency").hidden = true;
  go("home");
});

// ---------- 3. fix it: camera, clip, mask overlay ----------
let cam = null, anim = 0;

async function startCamera() {
  resetFix();
  if (cam) return;
  try {
    cam = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    $("camVideo").srcObject = cam;
    $("camMsg").textContent = "Point the camera at the problem.";
  } catch {
    $("camMsg").textContent = "The camera is blocked. Allow it in your browser settings.";
  }
}

function stopCamera() {
  cancelAnimationFrame(anim);
  anim = 0;
  if (!cam) return;
  cam.getTracks().forEach((t) => t.stop());
  cam = null;
  $("camVideo").srcObject = null;
}

function resetFix() {
  cancelAnimationFrame(anim);
  const c = $("overlay");
  c.getContext("2d").clearRect(0, 0, c.width, c.height);
  $("partTag").hidden = true;
  $("problem").textContent = "";
  $("stepSource").textContent = "";
  $("steps").hidden = true;
  $("scan").hidden = false;
}

function recordClip(stream, ms) {
  return new Promise((resolve, reject) => {
    const mimeType = pickMime(VIDEO_TYPES);
    const r = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const parts = [];
    r.ondataavailable = (e) => e.data.size && parts.push(e.data);
    r.onstop = () => resolve(new Blob(parts, { type: r.mimeType || "video/webm" }));
    r.onerror = (e) => reject(e.error);
    r.start();
    setTimeout(() => r.state === "recording" && r.stop(), ms);
  });
}

// A still for the vision model, scaled down so it uploads fast on one bar of signal.
function grabFrame(video, max = 768) {
  const s = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(video.videoWidth * s);
  c.height = Math.round(video.videoHeight * s);
  c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
  return new Promise((resolve) => c.toBlob(resolve, "image/jpeg", 0.82));
}

$("scan").addEventListener("click", async () => {
  if (!cam) return startCamera();
  const btn = $("scan");
  btn.disabled = true;
  btn.textContent = "Hold steady...";
  try {
    const frame = await grabFrame($("camVideo"));
    const clip = await recordClip(cam, 2500);
    btn.textContent = "Looking...";
    const filename = `clip.${extFor(clip.type)}`;
    const look = await postForm("/api/look", [["clip", clip, filename], ["frame", frame, "frame.jpg"], ["said", state.lastText]]);
    state.look = look;
    state.step = 0;
    $("problem").textContent = look.problem;
    // Say where the steps came from: a cited card, or the model on its own.
    if (look.card) {
      $("stepSource").replaceChildren("Verified playbook · Source: ", ...sourceLinks(look.card.sources).flatMap((a, i) => (i ? [", ", a] : [a])));
    } else {
      $("stepSource").textContent = "AI steps, not verified. Stop if anything feels unsafe.";
    }
    speak(look.problem);
    const masks = await postForm("/api/track", [["clip", clip, filename], ["part", look.part]]);
    playMasks(masks);
    showStep(false);
    btn.hidden = true;
  } catch {
    $("camMsg").textContent = "That didn't work. Try again.";
  } finally {
    btn.disabled = false;
    btn.textContent = "Show NIGHTRIDE the problem";
  }
});

// Draws the tracked part over the live video, mapped through object-fit: cover.
function playMasks({ part, fps, frames }) {
  const canvas = $("overlay"), video = $("camVideo"), ctx = canvas.getContext("2d");
  $("partTag").textContent = part;
  $("partTag").hidden = false;
  $("camMsg").textContent = "";
  const t0 = performance.now();
  cancelAnimationFrame(anim);

  const draw = (now) => {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const vw = video.videoWidth || w, vh = video.videoHeight || h;
    const s = Math.max(w / vw, h / vh), ox = (w - vw * s) / 2, oy = (h - vh * s) / 2;
    const frame = frames[Math.floor(((now - t0) / 1000) * fps) % frames.length];

    ctx.beginPath();
    for (const ring of frame.rings) {
      ring.forEach(([x, y], i) => {
        const px = ox + x * vw * s, py = oy + y * vh * s;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      });
      ctx.closePath();
    }
    ctx.fillStyle = "rgba(255, 176, 0, 0.28)";
    ctx.fill("evenodd");
    ctx.shadowColor = "#ffb000";
    ctx.shadowBlur = 16;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffb000";
    ctx.stroke();
    ctx.shadowBlur = 0;
    anim = requestAnimationFrame(draw);
  };
  anim = requestAnimationFrame(draw);
}

// say=false on the first step so it doesn't talk over the problem summary.
function showStep(say = true) {
  const { steps, prevent } = state.look;
  $("steps").hidden = false;
  let text;
  if (state.step >= steps.length) {
    $("stepCount").textContent = "Done";
    text = prevent ? `Nice work. Next time: ${prevent}` : "Nice work. Spin it once more and ride safe.";
    $("nextStep").textContent = "Home";
  } else {
    $("stepCount").textContent = `Step ${state.step + 1} of ${steps.length}`;
    text = steps[state.step];
    $("nextStep").textContent = "Next";
  }
  $("stepText").textContent = text;
  if (say) speak(text);
}
$("nextStep").addEventListener("click", () => {
  if (state.step >= state.look.steps.length) return go("home");
  state.step += 1;
  showStep();
});

// ---------- 4. get me somewhere ----------
function mapsUrl(query) {
  const l = state.location;
  return l
    ? `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${l.lat},${l.lng},15z`
    : `https://www.google.com/maps/search/${encodeURIComponent(`${query} near me`)}`;
}

function placeCard(p) {
  const a = document.createElement("a");
  a.className = "place";
  // Real places get bike directions; canned ones fall back to a map search.
  a.href = Number.isFinite(p.lat)
    ? `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=bicycling`
    : mapsUrl(p.query);
  a.target = "_blank";
  a.rel = "noopener";
  const name = document.createElement("strong");
  name.textContent = p.name;
  const open = document.createElement("span");
  open.className = "open";
  open.textContent = [p.open, p.kind, Number.isFinite(p.miles) ? `${p.miles} mi` : ""].filter(Boolean).join(" · ");
  const why = document.createElement("span");
  why.className = "why";
  why.textContent = p.why;
  a.append(name, open, why);
  return a;
}

let nearbyRetry = 0;
async function loadNearby(tries = 0) {
  const box = $("places");
  clearTimeout(nearbyRetry);
  if (!tries) box.textContent = "Looking for places open right now...";
  try {
    const { places, source } = await postJSON("/api/nearby", { location: state.location, lane: state.lane || "ride" });
    const cards = places.map(placeCard);
    if (source === "pending") {
      // General ideas now; the real list replaces them when the map lookup finishes.
      const note = document.createElement("p");
      note.className = "hint";
      note.textContent = "Still finding places open right now. Meanwhile:";
      cards.unshift(note);
      if (tries < 6 && $("nearby").classList.contains("active")) nearbyRetry = setTimeout(() => loadNearby(tries + 1), 8000);
    }
    box.replaceChildren(...cards);
  } catch {
    box.textContent = "Couldn't load places. Check your signal.";
  }
}

// ---------- 5. tell my people ----------
const PEOPLE_KEY = "nightride.people";
function loadPeople() {
  try { return JSON.parse(localStorage.getItem(PEOPLE_KEY)) || []; } catch { return []; }
}
function savePeople(people) {
  try { localStorage.setItem(PEOPLE_KEY, JSON.stringify(people)); } catch {}
}
function renderPeople() {
  const people = loadPeople();
  $("people").replaceChildren(...people.map((name, i) => {
    const li = document.createElement("li");
    li.textContent = name;
    const x = document.createElement("button");
    x.textContent = "Remove";
    x.addEventListener("click", () => {
      people.splice(i, 1);
      savePeople(people);
      renderPeople();
    });
    li.append(x);
    return li;
  }));
}
$("addPerson").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("personName").value.trim();
  if (!name) return;
  savePeople([...loadPeople(), name]);
  $("personName").value = "";
  renderPeople();
});

async function prepareShare() {
  renderPeople();
  $("shareStatus").textContent = "";
  try {
    const { message } = await postJSON("/api/share", { location: state.location, battery: state.battery, note: state.lastText });
    $("shareText").value = message;
  } catch {
    $("shareText").value = "NIGHTRIDE: I'm stuck out on my ride. Call me.";
  }
}

// Sends from the rider's own phone (share sheet or SMS app); no paid SMS service.
$("sendShare").addEventListener("click", async () => {
  const text = $("shareText").value;
  try {
    if (navigator.share) await navigator.share({ text });
    else window.location.href = `sms:?&body=${encodeURIComponent(text)}`;
    const time = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const names = loadPeople();
    $("shareStatus").textContent = names.length
      ? `Opened at ${time}. Send it to ${names.join(", ")}.`
      : `Opened at ${time}.`;
  } catch {
    // Rider closed the share sheet.
  }
});

// ---------- close calls: one tap while riding, details optional ----------
function currentLocation(timeout = 8000) {
  if (state.location) return Promise.resolve(state.location);
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("no geolocation"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout },
    );
  });
}

let ccId = null, ccTimer = 0;
const openCcSheet = () => { $("ccSheet").hidden = false; clearTimeout(ccTimer); ccTimer = setTimeout(closeCcSheet, 12000); };
const closeCcSheet = () => { $("ccSheet").hidden = true; clearTimeout(ccTimer); };

$("closeCall").addEventListener("click", async () => {
  const btn = $("closeCall");
  if (btn.disabled) return;
  btn.disabled = true;
  btn.textContent = "LOGGING...";
  try {
    const call = await postJSON("/api/closecall", await currentLocation());
    ccId = call.id;
    navigator.vibrate?.(80);
    btn.classList.add("done");
    btn.textContent = "LOGGED";
    speak("Close call logged.");
    openCcSheet();
  } catch (e) {
    btn.textContent = /429/.test(String(e.message)) ? "ALREADY LOGGED" : "TURN ON LOCATION";
  } finally {
    setTimeout(() => {
      btn.disabled = false;
      btn.classList.remove("done");
      btn.textContent = "CLOSE CALL";
    }, 4000);
  }
});

$("ccSheet").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-tag]");
  if (!b || !ccId) return;
  closeCcSheet();
  try { await postJSON(`/api/closecall/${ccId}/tag`, { tag: b.dataset.tag }); } catch {}
});
$("ccSkip").addEventListener("click", closeCcSheet);

let ccMap = null, ccLayer = null;
async function loadMap() {
  if (!window.L) {
    $("mapSummary").textContent = "The map needs a signal to load.";
    return;
  }
  const { calls } = await (await fetch("/api/closecalls")).json();
  if (!ccMap) {
    ccMap = L.map("ccMap", { zoomControl: false });
    // Free OpenStreetMap tiles, darkened in CSS for night eyes.
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(ccMap);
    ccLayer = L.layerGroup().addTo(ccMap);
  }
  ccLayer.clearLayers();

  // Reports on the same rounded spot stack into one bigger dot: that's a hotspot.
  const spots = new Map();
  for (const c of calls) {
    const k = `${c.lat},${c.lng}`;
    spots.set(k, [...(spots.get(k) || []), c]);
  }
  for (const [k, list] of spots) {
    const [lat, lng] = k.split(",").map(Number);
    L.circleMarker([lat, lng], {
      radius: 6 + Math.min(14, list.length * 3), color: "#ffb000", weight: 2, fillColor: "#ffb000", fillOpacity: 0.35,
    }).bindPopup(`${list.length} close call${list.length > 1 ? "s" : ""}`).addTo(ccLayer);
  }

  const center = state.location ? [state.location.lat, state.location.lng]
    : calls.length ? [calls.at(-1).lat, calls.at(-1).lng] : [34.5008, -117.1859];
  ccMap.setView(center, 13);
  setTimeout(() => ccMap.invalidateSize(), 50);
  const worst = Math.max(0, ...[...spots.values()].map((l) => l.length));
  $("mapSummary").textContent = calls.length
    ? `${calls.length} close call${calls.length > 1 ? "s" : ""} logged. Worst spot: ${worst} report${worst > 1 ? "s" : ""}.`
    : "No close calls yet. Tap CLOSE CALL on the home screen when a driver comes too close.";
}

// ---------- 6. night riders nearby (simulated for the demo) ----------
const SIM_RIDERS = [
  { name: "Dee", dx: 0.3, dy: -0.25, eta: 6 },
  { name: "Marco", dx: -0.45, dy: 0.35, eta: 11 },
  { name: "Jules", dx: 0.85, dy: 0.75, eta: 19 },
];
const MAP_MILES = 1.25;

function drawRiders() {
  const canvas = $("riderMap"), ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 8, perMile = r / MAP_MILES;

  ctx.strokeStyle = "#2a2a2a";
  ctx.fillStyle = "#8a8478";
  ctx.font = "12px system-ui";
  for (const miles of [0.5, 1]) {
    ctx.beginPath();
    ctx.arc(cx, cy, miles * perMile, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillText(`${miles} mi`, cx + 4, cy - miles * perMile - 4);
  }
  ctx.fillStyle = "#e8e2d6";
  for (const rider of SIM_RIDERS) {
    ctx.beginPath();
    ctx.arc(cx + rider.dx * perMile, cy + rider.dy * perMile, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#ffb000";
  ctx.beginPath();
  ctx.arc(cx, cy, 9, 0, Math.PI * 2);
  ctx.fill();

  const close = SIM_RIDERS.filter((rd) => Math.hypot(rd.dx, rd.dy) <= 1).length;
  $("riderCount").textContent = `${close} riders within 1 mile. Ask for help?`;
  $("riderReplies").replaceChildren();
  $("askRiders").disabled = false;
}

$("askRiders").addEventListener("click", () => {
  $("askRiders").disabled = true;
  SIM_RIDERS.forEach((rider, i) => {
    setTimeout(() => {
      const li = document.createElement("li");
      li.textContent = `${rider.name}: On my way, ${rider.eta} min.`;
      $("riderReplies").append(li);
    }, 1200 * (i + 1));
  });
});

watchBattery();
watchLocation();
