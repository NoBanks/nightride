const $ = (id) => document.getElementById(id);
const state = { battery: null, location: null, lastText: "", look: null, step: 0 };

// ---------- screens ----------
function go(name) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === name));
  if (name === "fix") startCamera(); else stopCamera();
  if (name === "nearby") loadNearby();
  if (name === "share") prepareShare();
  if (name === "riders") drawRiders();
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
async function postFile(url, field, blob, filename, extra = {}) {
  const fd = new FormData();
  fd.append(field, blob, filename);
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  const r = await fetch(url, { method: "POST", body: fd });
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json();
}

fetch("/api/health").then((r) => r.json()).then((h) => { $("demoBadge").hidden = h.mode !== "canned"; }).catch(() => {});

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
    (p) => { state.location = { lat: p.coords.latitude, lng: p.coords.longitude }; $("locDot").classList.add("on"); },
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
    const { text } = await postFile("/api/transcribe", "audio", blob, `talk.${extFor(type)}`);
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
    $("emergency").hidden = false;
    return;
  }
  const ui = LANE_UI[d.lane] || LANE_UI.ride;
  $("laneName").textContent = ui.name;
  $("laneSay").textContent = d.say;
  $("laneGo").textContent = ui.label;
  $("laneGo").onclick = () => go(ui.go);
  $("dispatchCard").hidden = false;
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

$("scan").addEventListener("click", async () => {
  if (!cam) return startCamera();
  const btn = $("scan");
  btn.disabled = true;
  btn.textContent = "Hold steady...";
  try {
    const clip = await recordClip(cam, 2500);
    btn.textContent = "Looking...";
    const filename = `clip.${extFor(clip.type)}`;
    const look = await postFile("/api/look", "clip", clip, filename);
    state.look = look;
    state.step = 0;
    $("problem").textContent = look.problem;
    const masks = await postFile("/api/track", "clip", clip, filename, { part: look.part });
    playMasks(masks);
    showStep();
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

function showStep() {
  const steps = state.look.steps;
  $("steps").hidden = false;
  if (state.step >= steps.length) {
    $("stepCount").textContent = "Done";
    $("stepText").textContent = "Spin the wheel once more and ride safe.";
    $("nextStep").textContent = "Home";
    return;
  }
  $("stepCount").textContent = `Step ${state.step + 1} of ${steps.length}`;
  $("stepText").textContent = steps[state.step];
  $("nextStep").textContent = "Next";
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
  a.href = mapsUrl(p.query);
  a.target = "_blank";
  a.rel = "noopener";
  const name = document.createElement("strong");
  name.textContent = p.name;
  const open = document.createElement("span");
  open.className = "open";
  open.textContent = p.open;
  const why = document.createElement("span");
  why.className = "why";
  why.textContent = p.why;
  a.append(name, open, why);
  return a;
}

async function loadNearby() {
  const box = $("places");
  box.textContent = "Looking...";
  try {
    const { places } = await postJSON("/api/nearby", { location: state.location, need: state.lastText });
    box.replaceChildren(...places.map(placeCard));
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
