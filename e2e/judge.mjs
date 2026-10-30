// Walks the app the way a judge would, on a phone-sized screen: every feature in the demo video.
//   npm run test:judge                      # against the live site (read-only: never adds a close call)
//   NIGHTRIDE_URL=http://localhost:8787 NIGHTRIDE_WRITE=1 npm run test:judge   # also taps CLOSE CALL
// Runs its own headless Chrome (no window). The microphone plays e2e/fixtures/ask_flat.wav, a generic
// text-to-speech voice; the camera plays e2e/fixtures/wheels.webm. Screenshots go to e2e/out/.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";

const BASE = (process.env.NIGHTRIDE_URL || "https://nightride.nohumannearby.com").replace(/\/$/, "");
const WRITE = process.env.NIGHTRIDE_WRITE === "1";
const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9447, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = new URL("./out/", import.meta.url);
mkdirSync(OUT, { recursive: true });

// The camera: the wheel clip as a raw video file Chrome can loop as a fake webcam.
const work = mkdtempSync(join(tmpdir(), "nightride-judge-"));
const cam = join(work, "cam.y4m");
spawnSync(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-i", new URL("./fixtures/wheels.webm", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"),
  "-vf", "scale=480:-2,fps=24", "-pix_fmt", "yuv420p", "-y", cam], { windowsHide: true });

const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(work, "profile")}`,
  "--no-first-run", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${cam}`,
  "--autoplay-policy=no-user-gesture-required"], { windowsHide: true, stdio: "ignore" });
const done = () => { try { chrome.kill(); } catch {} setTimeout(() => { try { rmSync(work, { recursive: true, force: true }); } catch {} }, 500); };
process.on("exit", done);
for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORT}/json/version`); break; } catch { await sleep(200); } }

// One websocket to the browser; page and service worker are flat sessions on it.
const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
const ws = new WebSocket(webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let nid = 0;
const pend = new Map();
ws.onmessage = (m) => { const j = JSON.parse(m.data); if (j.id && pend.has(j.id)) { pend.get(j.id)(j); pend.delete(j.id); } };
const raw = (method, params = {}, sessionId) => new Promise((r) => { const i = ++nid; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { targetId } = (await raw("Target.createTarget", { url: "about:blank" })).result;
const { sessionId: page } = (await raw("Target.attachToTarget", { targetId, flatten: true })).result;
const send = (method, params) => raw(method, params, page);
const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const until = async (js, ms = 30000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await ev(js)) return true; await sleep(150); } throw new Error(`timed out: ${js}`); };
const text = (id) => ev(`document.getElementById(${JSON.stringify(id)})?.textContent?.trim() || ""`);
const click = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
const home = async () => { await ev(`document.getElementById('emergency').hidden = true`); await click(".screen.active .back"); await sleep(300); };
const shot = async (name) => writeFileSync(new URL(`${name}.png`, OUT), Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64"));
const typeSend = async (t) => {
  await ev(`(() => { document.querySelector('.type-instead').open = true; document.getElementById('typeText').value = ${JSON.stringify(t)}; document.getElementById('typeForm').requestSubmit(); })()`);
};

const results = [];
const check = async (name, fn) => {
  const t = Date.now();
  try { const note = (await fn()) || ""; results.push(["PASS", name, `${((Date.now() - t) / 1000).toFixed(1)} s`, note]); }
  catch (e) { results.push(["FAIL", name, `${((Date.now() - t) / 1000).toFixed(1)} s`, String(e.message || e)]); }
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

// Microphone: the fixture voice, started the moment the talk button is held.
const wav = readFileSync(new URL("./fixtures/ask_flat.wav", import.meta.url)).toString("base64");
await send("Page.enable");
await send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
  const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (c) => {
    if (!c || !c.audio || c.video) return real(c);
    const ctx = new AudioContext(); await ctx.resume();
    const buf = await ctx.decodeAudioData(Uint8Array.from(atob("${wav}"), (ch) => ch.charCodeAt(0)).buffer);
    const dest = ctx.createMediaStreamDestination();
    window.__say = () => { const s = ctx.createBufferSource(); s.buffer = buf; s.connect(dest); s.start(); return buf.duration; };
    return dest.stream;
  };
  // Capture where "Text my people" goes instead of leaving the page.
  const d = Object.getOwnPropertyDescriptor(Location.prototype, "href"); window.__nav = [];
  Object.defineProperty(Location.prototype, "href", { set(v) { if (/^sms:/.test(v)) { window.__nav.push(v); return; } d.set.call(this, v); }, get() { return d.get.call(this); } });
})()` });
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await raw("Browser.grantPermissions", { origin: BASE, permissions: ["geolocation"] });
await send("Emulation.setGeolocationOverride", { latitude: 34.5008, longitude: -117.1859, accuracy: 15 }); // Apple Valley, CA

try {
  await check("1. opens on a phone: one big talk button, no fake features", async () => {
    await send("Page.navigate", { url: BASE + "/" });
    await until(`document.getElementById('talk') && document.readyState === 'complete'`);
    await sleep(1500);
    expect(!(await ev(`!!document.querySelector('[data-go=riders]')`)), "a simulated feature is still linked");
    expect(await ev(`document.getElementById('demoBadge').hidden`), "DEMO DATA badge is showing");
    await shot("01_home");
    return "home screen ready";
  });

  await check("2. hold to talk: Meta Voice Transcribe hears \"my back tire just went flat\", Muse Spark Open says FIX IT", async () => {
    const r = await ev(`(() => { const b = document.getElementById('talk').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: r.x, y: r.y });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: r.x, y: r.y, button: "left", clickCount: 1 });
    await until(`document.getElementById('talk').classList.contains('recording')`, 8000);
    const secs = await ev(`window.__say()`);
    await sleep(secs * 1000 + 400);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: r.x, y: r.y, button: "left", clickCount: 1 });
    await until(`!document.getElementById('dispatchCard').hidden`, 45000);
    const heard = await text("transcript"), lane = await text("laneName"), card = await text("laneCard");
    await shot("02_dispatch");
    expect(/tire/i.test(heard), `heard ${heard}`);
    expect(lane === "FIX IT", `lane ${lane}`);
    expect(/flat rear tire/i.test(card), `card button: ${card}`);
    return `${heard} -> ${lane}, "${card}"`;
  });

  await check("3. the verified card shows its sources and fact-check", async () => {
    await click("#laneCard");
    await until(`document.getElementById('guide').classList.contains('active')`);
    const tag = await text("guideTag"), srcs = await ev(`document.querySelectorAll('#guideSources a').length`);
    const stages = await ev(`[...document.querySelectorAll('#guideSteps .guide-stage')].map((e) => e.textContent)`);
    await shot("03_card");
    expect(/fact-checked/.test(tag) && srcs > 0, `${tag}, ${srcs} sources`);
    expect(stages.length === 4, `stages: ${stages}`);
    return `${srcs} sources; stages: ${stages.join(" > ")}`;
  });

  await check("4. camera: Muse Spark names the part, SAM 3.1 outlines it", async () => {
    await home();
    // Same path a rider takes: FIX IT -> Open the camera.
    await typeSend("my back tire just went flat");
    await until(`document.getElementById('laneName').textContent === 'FIX IT'`, 30000);
    await click("#laneGo");
    await until(`!!document.getElementById('camVideo').srcObject`, 10000);
    await sleep(1200);
    await click("#scan");
    await until(`!document.getElementById('steps').hidden`, 60000);
    await until(`/SAM|outline/.test(document.getElementById('camMsg').textContent)`, 40000);
    const part = await text("partTag"), msg = await text("camMsg");
    await sleep(800); await shot("04_outline");
    expect(/SAM 3\.1/.test(msg), `camera says: ${msg}`);
    // Proof the vision model ran: the fallback path draws no outline and names no part.
    expect(part && /tire|wheel/i.test(part), `part from the vision model: "${part}"`);
    return `part "${part}", ${msg}`;
  });

  await check("5. 21 steps read as 4 parts; Back, Next, See all steps and Finish all work", async () => {
    const at = async () => `${await text("stageName")} | ${await text("stepCount")}`;
    const first = await at();
    expect(first === "Get the wheel off · part 1 of 4 | Step 1 of 8", `start: ${first}`);
    for (let i = 0; i < 8; i++) await click("#nextStep");
    const second = await at();
    expect(second === "Find what caused it · part 2 of 4 | Step 1 of 6", `after 8 Next: ${second}`);
    await click("#prevStep");
    const back = await at();
    expect(back === "Get the wheel off · part 1 of 4 | Step 8 of 8", `after Back: ${back}`);
    await click("#allSteps");
    const listed = await ev(`document.querySelectorAll('#stepList .jump').length`);
    expect(listed === 21, `${listed} steps listed`);
    await shot("05_all_steps");
    await ev(`document.querySelectorAll('#stepList .jump')[14].click()`);
    const jumped = await at();
    expect(jumped === "Put the new tube in · part 3 of 4 | Step 1 of 5", `jump to 15: ${jumped}`);
    for (let i = 0; i < 6; i++) await click("#nextStep");
    const last = await text("nextStep");
    expect(last === "Finish", `last step button: ${last}`);
    await click("#nextStep");
    const finished = `${await text("stepCount")}: ${await text("stepText")}`;
    expect(/^Done/.test(finished) && /test your brakes/.test(finished), finished);
    await shot("05_done");
    return "1 of 8 > Next x8 > part 2 > Back > list of 21 > jump to 15 > Finish > Done";
  });

  await check("6. can't fix it here: Get me somewhere and Tell my people are on the fix screen", async () => {
    const outs = await ev(`[...document.querySelectorAll('#fix .sheet > .step-nav [data-go]')].map((b) => b.dataset.go)`);
    expect(outs.join() === "nearby,share", `ways out: ${outs}`);
    return "both buttons present";
  });

  await check("7. e-bike cut out: RIDE, the roadside card, then places open right now with bike directions", async () => {
    await home();
    await typeSend("my e-bike just cut out and I'm six miles from home");
    await until(`!document.getElementById('dispatchCard').hidden && document.getElementById('laneName').textContent.length`, 30000);
    const lane = await text("laneName"), card = await text("laneCard");
    expect(lane === "RIDE", `lane ${lane}`);
    expect(/e-bike/i.test(card), `card ${card}`);
    await click("#laneGo");
    await until(`document.querySelectorAll('#places a.place').length > 0 && !/Still finding/.test(document.getElementById('places').textContent)`, 90000);
    const places = await ev(`[...document.querySelectorAll('#places a.place')].map((a) => ({ name: a.querySelector('strong').textContent, open: a.querySelector('.open').textContent, href: a.href }))`);
    await shot("07_places");
    expect(places.every((p) => /travelmode=bicycling/.test(p.href)), "a place without bike directions");
    // Closed places are never shown; unknown hours are labeled honestly, and the top pick is confirmed open.
    expect(places.every((p) => !/closed/i.test(p.open)), `a closed place: ${JSON.stringify(places)}`);
    expect(/^open/i.test(places[0].open), `top pick not confirmed open: ${places[0].open}`);
    return places.slice(0, 3).map((p) => `${p.name} (${p.open.split(" · ")[0]})`).join(", ");
  });

  await check(`8. close call: ${WRITE ? "tap, tag, the law line, the map, the city CSV" : "the map and the city CSV (read-only on the live site)"}`, async () => {
    await home();
    let note = "";
    if (WRITE) {
      await click("#closeCall");
      await until(`!document.getElementById('ccSheet').hidden`, 15000);
      const law = await ev(`document.querySelector('.cclaw').textContent`);
      expect(/VC 21760/.test(law) && /3 feet/.test(law), `law line: ${law}`);
      await shot("08_logged");
      await click('[data-tag="too close"]');
      note = "logged + tagged; ";
    }
    await click(".links [data-go=map]");
    await until(`document.getElementById('mapSummary').textContent.length > 0`, 20000);
    const summary = await text("mapSummary");
    const dots = await ev(`document.querySelectorAll('#ccMap path.leaflet-interactive').length`);
    const csv = await ev(`fetch(document.querySelector('#map a[download]').href).then((r) => r.text())`);
    await sleep(1500); await shot("08_map");
    expect(csv.startsWith("reported_at_utc"), "CSV header missing");
    if (WRITE) expect(dots > 0 && /logged/.test(summary), `${summary}, ${dots} dots`);
    return `${note}${summary} (${dots} dots on the map, CSV ok)`;
  });

  for (const [said, line] of [["a car hit me", "Call 911 now."], ["the battery is smoking", "Move away from the battery. Call 911."]]) {
    await check(`9. "${said}" goes straight to full-screen Call 911`, async () => {
      await home();
      await typeSend(said);
      await until(`!document.getElementById('emergency').hidden`, 10000);
      const say = await text("emergencySay"), tel = await ev(`document.querySelector('#emergency .call911').getAttribute('href')`);
      await shot(said.includes("car") ? "09_911" : "09_battery");
      expect(say === line && tel === "tel:911", `${say} ${tel}`);
      await click("#closeEmergency");
      return say;
    });
  }

  await check("10. tell my people: add Mom, one tap opens Messages with battery and a map link", async () => {
    await home();
    await click(".quick [data-go=share]");
    await until(`document.getElementById('shareText').value.length > 0`, 15000);
    await ev(`(() => { document.getElementById('addManual').open = true; document.getElementById('personName').value = 'Mom'; document.getElementById('personTel').value = '(760) 555-0101'; document.getElementById('addPerson').requestSubmit(); })()`);
    await sleep(300);
    await click("#sendShare"); await sleep(400);
    const status = await text("shareStatus"), msg = await ev(`document.getElementById('shareText').value`), btn = await text("sendShare");
    await shot("10_share");
    await ev(`localStorage.removeItem('nightride.people')`);
    expect(btn === "Text Mom" && /Messages opened to Mom/.test(status), `${btn} / ${status}`);
    expect(/maps\.google\.com\/\?q=/.test(msg) && /battery \d+%/i.test(msg), `message: ${msg}`);
    return `${btn} -> ${status}`;
  });

  await check("11. no signal: the app still opens, the 911 rule and the chain card still work", async () => {
    // Make sure the service worker has saved the app, then cut the network for the page AND the worker.
    await until(`navigator.serviceWorker.ready.then(() => !!navigator.serviceWorker.controller)`, 15000).catch(async () => { await send("Page.reload"); await sleep(3000); });
    const offline = { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 };
    const workers = (await raw("Target.getTargets")).result.targetInfos.filter((t) => t.type === "service_worker" && t.url.startsWith(BASE));
    for (const w of workers) {
      const { sessionId } = (await raw("Target.attachToTarget", { targetId: w.targetId, flatten: true })).result;
      await raw("Network.enable", {}, sessionId);
      await raw("Network.emulateNetworkConditions", offline, sessionId);
    }
    await send("Network.enable");
    await send("Network.emulateNetworkConditions", offline);
    await send("Page.reload"); await sleep(3000);
    const reallyOff = await ev(`fetch('/api/health', { cache: 'no-store' }).then(() => false, () => true)`);
    expect(reallyOff, "the network is still reachable; test is not offline");
    expect(await ev(`!!document.getElementById('talk')`), "app did not open offline");
    const banner = await ev(`!document.getElementById('offline').hidden`);
    await typeSend("my chain snapped");
    await until(`!document.getElementById('dispatchCard').hidden`, 10000);
    const say = await text("laneSay"), card = await text("laneCard");
    expect(/No signal/.test(say) && /chain/i.test(card), `${say} / ${card}`);
    await click("#laneCard");
    const stages = await ev(`[...document.querySelectorAll('#guideSteps .guide-stage')].map((e) => e.textContent)`);
    await shot("11_offline_card");
    await home();
    await typeSend("a car hit me");
    await until(`!document.getElementById('emergency').hidden`, 5000);
    await click("#closeEmergency");
    const on = { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 };
    await send("Network.emulateNetworkConditions", on);
    return `${workers.length} worker(s) offline, banner ${banner ? "shown" : "missing"}; "${card}" in ${stages.length} parts; 911 still works`;
  });

  await check("12. playbook: all 64 cards readable", async () => {
    await home();
    await click(".links [data-go=playbook]");
    await until(`document.querySelectorAll('#playbookList .btn').length > 0`, 10000);
    const n = await ev(`document.querySelectorAll('#playbookList .btn').length`);
    expect(n === 64, `${n} cards`);
    return `${n} cards`;
  });
} finally {
  for (const r of results) console.log(r.join(" | "));
  const failed = results.filter((r) => r[0] === "FAIL").length;
  console.log(`SUMMARY: ${results.length - failed} passed, ${failed} failed  (${BASE}${WRITE ? ", writes on" : ", read-only"}; screenshots in e2e/out/)`);
  ws.close();
  done();
  setTimeout(() => process.exit(failed ? 1 : 0), 800);
}
