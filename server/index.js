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

app.set("trust proxy", "loopback"); // behind a local tunnel, req.ip is the rider's address
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
}));

app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no audio" });
  res.json(await live("transcribe", async () => {
    const text = str(await sparkTranscribe(await toWav(req.file.buffer)), 1000);
    if (!text) throw new Error("no speech");
    return { text };
  }, sparkReady() ? { text: "" } : { text: canned.TRANSCRIPT }, req.ip));
});

app.post("/api/dispatch", async (req, res) => {
  const { text, battery } = req.body || {};
  if (!text || typeof text !== "string") return res.status(400).json({ error: "no text" });
  // Emergency words never reach the model.
  if (isEmergency(text)) return res.json({ lane: "emergency", say: emergencySay(text), source: "guard" });
  const time = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const context = `Rider says: "${str(text, 1000)}"\nLocal time: ${time}.${Number.isFinite(battery) ? ` Phone battery: ${Math.round(battery * 100)}%.` : ""}`;
  const d = await live("dispatch", async () => {
    const d = await sparkJSON(prompts.DISPATCH, context, { maxTokens: 1500 });
    return { lane: LANES.has(d.lane) ? d.lane : "ride", say: str(d.say, 240) || "I hear you. Here's what's open near you.", why: str(d.why, 120) };
  }, cannedDispatch(text), req.ip);
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
  const fallback = saidCard
    ? { problem: saidCard.title, part: canned.LOOK.part, fixable: true, card: playbook.publicCard(saidCard), steps: saidCard.steps, prevent: saidCard.prevent || "" }
    : canned.LOOK;
  res.json(await live("look", async () => {
    if (!frame) throw new Error("no frame");
    const content = [{ type: "text", text: said ? `The rider said: "${said}"` : "What is wrong here?" }, imagePart(frame.buffer, frame.mimetype)];
    const menu = playbook.menu(fixCategories);
    const d = await sparkJSON(menu ? prompts.lookWithPlaybook(menu) : prompts.LOOK, content, { maxTokens: 3000 });
    const base = { problem: str(d.problem, 160), part: str(d.part, 40) || "bicycle", fixable: d.fixable !== false };
    const card = playbook.getCard(d.card);
    if (card) return { ...base, card: playbook.publicCard(card), steps: card.steps, prevent: card.prevent || "" };
    const steps = Array.isArray(d.steps) ? d.steps.map((s) => str(s, 200)).filter(Boolean).slice(0, 8) : [];
    if (!steps.length && base.fixable) throw new Error("no card and no steps");
    return { ...base, card: null, steps, prevent: str(d.prevent, 240) };
  }, fallback, req.ip));
});

// Meta SAM 3.1 outlines the part Muse Spark named, in every frame of the rider's clip.
// If it can't, the rider gets no outline rather than a made-up one; the steps still show.
app.post("/api/track", upload.single("clip"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no clip" });
  const part = str(req.body?.part, 40) || "bicycle wheel";
  if (!samReady()) return res.json({ ...canned.track(part), source: "canned" });
  const none = { part, fps: SAM_FPS, frames: [] };
  if (!allowModel(req.ip)) return res.json({ ...none, source: "limit" });
  const t0 = Date.now();
  try {
    const signal = AbortSignal.timeout(30000);
    let concept = part, out = await samTrack(req.file.buffer, concept, { signal });
    // "rear tail light" can miss where "light" hits: one retry with the head noun.
    const head = part.split(/\s+/).pop();
    if (!out.found && head !== part && allowModel(req.ip)) out = await samTrack(req.file.buffer, (concept = head), { signal });
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
  if (now - (lastReport.get(req.ip) || 0) < 20000) return res.status(429).json({ error: "already logged" });
  lastReport.set(req.ip, now);
  res.json(closeCalls.add(lat, lng));
});

app.post("/api/closecall/:id/tag", (req, res) => {
  const call = closeCalls.setTag(req.params.id, req.body?.tag);
  if (!call) return res.status(400).json({ error: "bad id or tag" });
  res.json(call);
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
