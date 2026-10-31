import express from "express";
import multer from "multer";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { cannedDispatch, isEmergency, emergencySay } from "./dispatch.js";
import * as canned from "./canned.js";
import * as prompts from "./prompts.js";
import { sparkReady, sparkJSON, sparkTranscribe, imagePart } from "./spark.js";
import { toWav } from "./audio.js";
import { samReady, samTrack, SAM_FPS } from "./sam.js";
import { spend } from "./spend.js";
import { voiceReady, voiceTranscribe, isRefusal, wavStats } from "./voice.js";
import * as closeCalls from "./closecalls.js";
import { placesNear, rank } from "./places.js";
import * as playbook from "./playbook.js";

// Keys live outside the repo (and outside OneDrive) in ~/.nightride/.env.
const SECRETS = join(homedir(), ".nightride", ".env");
if (existsSync(SECRETS)) process.loadEnvFile(SECRETS);

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const PORT = Number(process.env.PORT) || 8787;
const LANES = new Set(["fix", "ride", "safe"]);

app.set("trust proxy", "loopback");
// Behind the Cloudflare tunnel every request arrives from this machine; Cloudflare puts the
// visitor's address in CF-Connecting-IP. Only trust that header when the tunnel (loopback) sent it,
// so each visitor gets their own model allowance instead of everyone sharing one.
const clientIp = (req) => (/^(::1|127\.|::ffff:127\.)/.test(req.socket.remoteAddress || "") && req.get("cf-connecting-ip")) || req.ip;
app.use(express.json({ limit: "1mb" }));
app.use(express.static(fileURLToPath(new URL("../public", import.meta.url))));
// The phone runs the same emergency guard and card matching when there's no signal.
app.use("/shared", express.static(fileURLToPath(new URL("../shared", import.meta.url))));
app.get("/shared/dispatch.js", (_req, res) => res.type("text/javascript").sendFile(fileURLToPath(new URL("./dispatch.js", import.meta.url))));

// The free model credit has to last through judging, so a public link can't be allowed to
// drain it: each visitor gets a few model calls per hour, and the whole app a daily ceiling.
// Past either limit the rider still gets the playbook answer, just without the model.
const PER_VISITOR_HOUR = Number(process.env.SPARK_PER_HOUR) || 40;
const PER_DAY = Number(process.env.SPARK_PER_DAY) || 800;
const visitorCalls = new Map(); // ip -> timestamps in the last hour
let day = { date: "", calls: 0 };

function allowModel(ip) {
  const now = Date.now(), today = new Date().toISOString().slice(0, 10);
  if (day.date !== today) day = { date: today, calls: 0 };
  const recent = (visitorCalls.get(ip) || []).filter((t) => now - t < 3600000);
  if (recent.length >= PER_VISITOR_HOUR || day.calls >= PER_DAY) return false;
  recent.push(now);
  visitorCalls.set(ip, recent);
  day.calls += 1;
  return true;
}

// Runs the model when a key is set; on any failure the rider still gets an answer.
async function live(name, run, fallback, ip = "") {
  if (!sparkReady()) return { ...fallback, source: "canned" };
  if (!allowModel(ip)) return { ...fallback, source: "limit" };
  const t0 = Date.now();
  try {
    const out = await run();
    console.log(`${name}: muse-spark-open ${Date.now() - t0}ms`);
    return { ...out, source: "muse-spark-open" };
  } catch (e) {
    console.warn(`${name}: fallback after ${Date.now() - t0}ms: ${e.message}`);
    return { ...fallback, source: "fallback" };
  }
}

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

app.get("/api/health", (_req, res) => res.json({
  ok: true,
  mode: sparkReady() ? "live" : "canned",
  outline: samReady() ? "sam-3.1" : "canned",
  metaSpend: spend(), // the ceiling the server enforces before every Meta call
}));

// Two Meta ears. Muse Voice Transcribe (built for speech, ~2.5 s) hears first; Muse Spark Open
// (open weights) backs it up. A model's refusal ("I can't transcribe...") is never passed on as if
// the rider said it. ?engine=spark or ?engine=voice tests one ear on its own.
async function hearWithVoice(wav, seconds) {
  const t1 = Date.now();
  try {
    const text = str(await voiceTranscribe(wav, seconds, { signal: AbortSignal.timeout(20000) }), 1000);
    console.log(`transcribe: muse-voice-transcribe ${Date.now() - t1}ms, ${seconds}s, ${text ? "heard" : "empty"}`);
    return text;
  } catch (e) {
    console.warn(`transcribe: muse-voice-transcribe failed: ${e.message}`);
    return "";
  }
}
async function hearWithSpark(wav, seconds, peakDb) {
  const t0 = Date.now();
  let heard = "";
  try { heard = str(await sparkTranscribe(wav), 1000); } catch (e) { heard = `error: ${e.message}`; }
  const ok = heard && !heard.startsWith("error:") && !isRefusal(heard);
  console.log(`transcribe: muse-spark-open ${Date.now() - t0}ms, ${seconds}s, peak ${peakDb} dB, ${ok ? "heard" : `missed (${heard.slice(0, 60) || "empty"})`}`);
  return ok ? heard : "";
}

app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no audio" });
  if (!sparkReady() && !voiceReady()) return res.json({ text: canned.TRANSCRIPT, source: "canned" });
  const wav = await toWav(req.file.buffer);
  const { seconds, peakDb } = wavStats(wav);
  const t0 = Date.now();
  // Below about -50 dB the mic sent silence (muted, or a Bluetooth headset holding the mic).
  if (peakDb < -50) {
    console.warn(`transcribe: silent audio (${seconds}s, peak ${peakDb} dB)`);
    return res.json({ text: "", reason: "silent", source: "none" });
  }
  if (!allowModel(clientIp(req))) return res.json({ text: "", reason: "limit", source: "limit" });
  const ears = [
    voiceReady() && req.query.engine !== "spark" && ["muse-voice-transcribe", () => hearWithVoice(wav, seconds)],
    sparkReady() && req.query.engine !== "voice" && ["muse-spark-open", () => hearWithSpark(wav, seconds, peakDb)],
  ].filter(Boolean);
  for (const [source, hear] of ears) {
    const text = await hear();
    if (text) return res.json({ text, source, ms: Date.now() - t0 });
  }
  res.json({ text: "", reason: "unclear", source: "fallback" });
});

app.post("/api/dispatch", async (req, res) => {
  const { text, battery } = req.body || {};
  if (!text || typeof text !== "string") return res.status(400).json({ error: "no text" });
  // Emergency words never reach the model.
  if (isEmergency(text)) return res.json({ lane: "emergency", say: emergencySay(text), source: "guard" });
  const time = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const context = `Rider says: "${str(text, 1000)}"\nLocal time: ${time}.${Number.isFinite(battery) ? ` Phone battery: ${Math.round(battery * 100)}%.` : ""}`;
  const d = await live("dispatch", async () => {
    const d = await sparkJSON(prompts.DISPATCH, context, { maxTokens: 3000 });
    return { lane: LANES.has(d.lane) ? d.lane : "ride", say: str(d.say, 240) || "I hear you. Here's what's open near you.", why: str(d.why, 120) };
  }, cannedDispatch(text), clientIp(req));
  // Matching a verified card costs no tokens: plain keywords against the rider's words.
  const [card] = playbook.match(text, playbook.LANE_CATEGORIES[d.lane]);
  res.json({ ...d, card: playbook.publicCard(card) || null });
});

app.get("/api/playbook", (_req, res) => res.json({ cards: playbook.cards.map(playbook.publicCard) }));

app.post("/api/look", upload.fields([{ name: "clip", maxCount: 1 }, { name: "frame", maxCount: 1 }]), async (req, res) => {
  const frame = req.files?.frame?.[0];
  if (!frame && !req.files?.clip) return res.status(400).json({ error: "no clip or frame" });
  const said = str(req.body?.said, 500);
  const fixCategories = ["repair", "ebike"];
  // Without the model, the rider's own words still pick a verified card.
  const [saidCard] = playbook.match(said, fixCategories);
  // If the model can't look (error, timeout, cap), never guess a diagnosis: use the rider's own
  // words to pick a card, or say we couldn't see it and hand them the playbook. Canned demo only
  // when there is no model key at all.
  const fallback = saidCard
    ? { problem: saidCard.title, part: "", fixable: true, card: playbook.publicCard(saidCard), steps: saidCard.steps, stages: saidCard.stages || [], prevent: saidCard.prevent || "" }
    : sparkReady() ? { problem: "", part: "", fixable: false, unseen: true, card: null, steps: [], prevent: "" } : canned.LOOK;
  res.json(await live("look", async () => {
    if (!frame) throw new Error("no frame");
    const content = [{ type: "text", text: said ? `The rider said: "${said}"` : "What is wrong here?" }, imagePart(frame.buffer, frame.mimetype)];
    const menu = playbook.menu(fixCategories);
    const d = await sparkJSON(menu ? prompts.lookWithPlaybook(menu) : prompts.LOOK, content, { maxTokens: 3000 });
    const base = { problem: str(d.problem, 160), part: str(d.part, 40) || "bicycle", fixable: d.fixable !== false };
    const card = playbook.getCard(d.card);
    // What the model saw, for checking real-world scans (its answer only, not the rider's words).
    console.log(`look: problem="${base.problem}" part="${base.part}" card=${card?.id || "none"}`);
    if (card) return { ...base, card: playbook.publicCard(card), steps: card.steps, stages: card.stages || [], prevent: card.prevent || "" };
    const steps = Array.isArray(d.steps) ? d.steps.map((s) => str(s, 200)).filter(Boolean).slice(0, 8) : [];
    if (!steps.length && base.fixable) throw new Error("no card and no steps");
    return { ...base, card: null, steps, prevent: str(d.prevent, 240) };
  }, fallback, clientIp(req)));
});

// Meta SAM 3.1 outlines the part Muse Spark named, in every frame of the rider's clip.
// If it can't, the rider gets no outline rather than a made-up one; the steps still show.
app.post("/api/track", upload.single("clip"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no clip" });
  const part = str(req.body?.part, 40) || "bicycle wheel";
  if (!samReady()) return res.json({ ...canned.track(part), source: "canned" });
  const none = { part, fps: SAM_FPS, frames: [] };
  if (!allowModel(clientIp(req))) return res.json({ ...none, source: "limit" });
  const t0 = Date.now();
  try {
    const signal = AbortSignal.timeout(30000);
    let concept = part, out = await samTrack(req.file.buffer, concept, { signal });
    // "rear tail light" can miss where "light" hits: one retry with the head noun.
    const head = part.split(/\s+/).pop();
    if (!out.found && head !== part && allowModel(clientIp(req))) out = await samTrack(req.file.buffer, (concept = head), { signal });
    console.log(`track: sam-3.1 ${Date.now() - t0}ms, "${concept}" in ${out.found}/${out.frames.length} frames`);
    res.json({ part, concept, ...out, ms: Date.now() - t0, source: "sam-3.1" });
  } catch (e) {
    console.warn(`track: no outline after ${Date.now() - t0}ms: ${e.message}`);
    res.json({ ...none, source: "fallback" });
  }
});

app.post("/api/nearby", async (req, res) => {
  const { location, lane } = req.body || {};
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
    return res.json({ places: canned.nearby(), source: "canned" });
  }
  // A rider can't wait a minute: answer within 12 s and let the lookup keep filling the cache.
  const lookup = placesNear(location.lat, location.lng);
  lookup.catch(() => {});
  const slow = new Promise((resolve) => setTimeout(resolve, 12000, null));
  try {
    const all = await Promise.race([lookup, slow]);
    if (!all) return res.json({ places: canned.nearby(), source: "pending" });
    const places = rank(all, lane, location.lat, location.lng);
    if (!places.length) throw new Error("nothing open nearby in OpenStreetMap");
    res.json({ places, source: "openstreetmap" });
  } catch (e) {
    console.warn(`nearby: fallback: ${e.message}`);
    res.json({ places: canned.nearby(), source: "fallback" });
  }
});

// One report per device address every 20 s, so a stuck button can't flood the map.
const lastReport = new Map();
app.post("/api/closecall", (req, res) => {
  const { lat, lng } = req.body || {};
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return res.status(400).json({ error: "no location" });
  }
  const now = Date.now();
  if (now - (lastReport.get(clientIp(req)) || 0) < 20000) return res.status(429).json({ error: "already logged" });
  lastReport.set(clientIp(req), now);
  const call = closeCalls.add(lat, lng);
  reporters.set(call.id, { ip: clientIp(req), at: now });
  res.json(call);
});

// Only the device that logged a report can move or undo it, and only for 30 minutes.
// Kept in memory on purpose: no accounts, nothing about the rider is stored with the report.
const reporters = new Map(); // id -> { ip, at }
const ownsReport = (req) => {
  const r = reporters.get(req.params.id);
  return r && r.ip === clientIp(req) && Date.now() - r.at < 30 * 60 * 1000;
};

app.post("/api/closecall/:id/move", (req, res) => {
  const { lat, lng } = req.body || {};
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return res.status(400).json({ error: "no location" });
  if (!ownsReport(req)) return res.status(403).json({ error: "only the rider who logged it, within 30 minutes" });
  res.json(closeCalls.move(req.params.id, lat, lng));
});

app.post("/api/closecall/:id/undo", (req, res) => {
  if (!ownsReport(req)) return res.status(403).json({ error: "only the rider who logged it, within 30 minutes" });
  reporters.delete(req.params.id);
  res.json({ removed: closeCalls.remove(req.params.id) });
});

app.post("/api/closecall/:id/tag", (req, res) => {
  const call = closeCalls.setTag(req.params.id, req.body?.tag);
  if (!call) return res.status(400).json({ error: "bad id or tag" });
  res.json(call);
});

// "Navajo Rd & Rancherias Rd" -> a spot on the map, so a rider can log a close call where it
// happened. OpenStreetMap's Nominatim (free, no key): one identified request at a time, cached,
// biased toward where the rider is. Nominatim can't search an intersection, so for "A & B" we
// fetch both streets' lines and take the point where they meet.
const geoCache = new Map();
let geoBusy = Promise.resolve();
function nominatim(q, extra) {
  const run = geoBusy.then(async () => {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}${extra}`, {
      headers: { "User-Agent": "NIGHTRIDE/0.1 (github.com/NoBanks/nightride)" }, signal: AbortSignal.timeout(10000),
    });
    await new Promise((ok) => setTimeout(ok, 1100)); // Nominatim's limit: one request per second
    if (!r.ok) throw new Error(`nominatim ${r.status}`);
    return r.json();
  });
  geoBusy = run.catch(() => {});
  return run;
}
const linePoints = (results) => results.flatMap((p) => {
  const g = p.geojson || {};
  const lines = g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [];
  return lines.flat().map(([lng, lat]) => ({ lat, lng }));
});
const meters = (a, b) => Math.hypot((a.lat - b.lat) * 111320, (a.lng - b.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180));

app.get("/api/geocode", async (req, res) => {
  const q = str(req.query.q, 120);
  if (!q) return res.status(400).json({ error: "no query" });
  const lat = Number(req.query.lat), lng = Number(req.query.lng);
  const box = Number.isFinite(lat) && Number.isFinite(lng) ? `&viewbox=${lng - 0.3},${lat + 0.3},${lng + 0.3},${lat - 0.3}` : "";
  const key = `${q.toLowerCase()}|${box}`;
  if (geoCache.has(key)) return res.json({ places: geoCache.get(key) });
  try {
    let places = [];
    const parts = q.split(/\s*(?:&|\band\b|@|\/)\s*/i).filter(Boolean);
    if (parts.length === 2) {
      // "Navajo Rd & Rancherias Rd, Apple Valley": the town after the last comma applies to both.
      const [s2, ...town] = parts[1].split(",");
      const where = town.join(",").trim();
      const s1 = parts[0].split(",")[0].trim();
      const withTown = (s) => (where ? `${s}, ${where}` : s);
      const extra = `&limit=10&polygon_geojson=1${box}${box ? "&bounded=1" : ""}`;
      const a = linePoints(await nominatim(withTown(s1), extra));
      const b = linePoints(await nominatim(withTown(s2.trim()), extra));
      let best = null;
      for (const p of a) for (const q2 of b) { const d = meters(p, q2); if (!best || d < best.d) best = { d, p, lat: (p.lat + q2.lat) / 2, lng: (p.lng + q2.lng) / 2 }; }
      const label = `${s1} & ${s2.trim()}${where ? `, ${where}` : ""}`;
      if (best && best.d < 80) places = [{ name: label, lat: best.lat, lng: best.lng }];
      // Map data is patchy: if the two never meet in it, go to the spot on the first street closest
      // to the second, and let the rider tap the exact place.
      else if (best) places = [{ name: `${s1}, near ${s2.trim()} (map data couldn't find where they meet)`, lat: best.p.lat, lng: best.p.lng, approximate: true }];
    }
    if (!places.length) {
      places = (await nominatim(q, `&limit=5${box}`)).map((p) => ({ name: p.display_name, lat: +p.lat, lng: +p.lon }));
    }
    geoCache.set(key, places);
    res.json({ places });
  } catch (e) {
    console.warn(`geocode: ${e.message}`);
    res.json({ places: [] });
  }
});
app.get("/api/closecalls", (_req, res) => res.json({ calls: closeCalls.all(), tags: closeCalls.TAGS }));

app.get("/api/closecalls.csv", (_req, res) => {
  res.type("text/csv").attachment("nightride-close-calls.csv").send(closeCalls.csv());
});

// No model here: builds the message the rider sends from their own phone.
app.post("/api/share", (req, res) => {
  const { location, battery, note } = req.body || {};
  const parts = ["NIGHTRIDE: I'm stuck out on my ride."];
  if (note) {
    let n = String(note).trim().slice(0, 200);
    n = n.charAt(0).toUpperCase() + n.slice(1);
    parts.push(/[.!?]$/.test(n) ? n : `${n}.`);
  }
  if (Number.isFinite(battery)) parts.push(`Phone battery ${Math.round(battery * 100)}%.`);
  let link = null;
  if (location && Number.isFinite(location.lat) && Number.isFinite(location.lng)) {
    link = `https://maps.google.com/?q=${location.lat.toFixed(5)},${location.lng.toFixed(5)}`;
    parts.push(`I'm here: ${link}`);
  } else {
    parts.push("My location is off, call me.");
  }
  res.json({ message: parts.join(" "), link });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "server error" });
});

app.listen(PORT, () => console.log(`NIGHTRIDE on http://localhost:${PORT} (${sparkReady() ? "live: Muse Spark Open" : "canned"})`));
