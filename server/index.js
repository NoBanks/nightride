import express from "express";
import multer from "multer";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { cannedDispatch, isEmergency } from "./dispatch.js";
import * as canned from "./canned.js";
import * as prompts from "./prompts.js";
import { sparkReady, sparkJSON, sparkTranscribe, imagePart } from "./spark.js";
import { toWav } from "./audio.js";
import * as closeCalls from "./closecalls.js";
import { placesNear, rank } from "./places.js";

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

// Runs the model when a key is set; on any failure the rider still gets an answer.
async function live(name, run, fallback) {
  if (!sparkReady()) return { ...fallback, source: "canned" };
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
  demo: ["track"], // still canned: SAM 3.1 waits on Meta API credits
}));

app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no audio" });
  res.json(await live("transcribe", async () => {
    const text = str(await sparkTranscribe(await toWav(req.file.buffer)), 1000);
    if (!text) throw new Error("no speech");
    return { text };
  }, sparkReady() ? { text: "" } : { text: canned.TRANSCRIPT }));
});

app.post("/api/dispatch", async (req, res) => {
  const { text, battery } = req.body || {};
  if (!text || typeof text !== "string") return res.status(400).json({ error: "no text" });
  // Emergency words never reach the model.
  if (isEmergency(text)) return res.json({ lane: "emergency", say: "Call 911 now.", source: "guard" });
  const time = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const context = `Rider says: "${str(text, 1000)}"\nLocal time: ${time}.${Number.isFinite(battery) ? ` Phone battery: ${Math.round(battery * 100)}%.` : ""}`;
  res.json(await live("dispatch", async () => {
    const d = await sparkJSON(prompts.DISPATCH, context, { maxTokens: 1500 });
    return { lane: LANES.has(d.lane) ? d.lane : "ride", say: str(d.say, 240) || "I hear you. Here's what's open near you.", why: str(d.why, 120) };
  }, cannedDispatch(text)));
});

app.post("/api/look", upload.fields([{ name: "clip", maxCount: 1 }, { name: "frame", maxCount: 1 }]), async (req, res) => {
  const frame = req.files?.frame?.[0];
  if (!frame && !req.files?.clip) return res.status(400).json({ error: "no clip or frame" });
  const said = str(req.body?.said, 500);
  res.json(await live("look", async () => {
    if (!frame) throw new Error("no frame");
    const content = [{ type: "text", text: said ? `The rider said: "${said}"` : "What is wrong here?" }, imagePart(frame.buffer, frame.mimetype)];
    const d = await sparkJSON(prompts.LOOK, content, { maxTokens: 3000 });
    const steps = Array.isArray(d.steps) ? d.steps.map((s) => str(s, 200)).filter(Boolean).slice(0, 8) : [];
    if (!steps.length) throw new Error("no steps");
    return { problem: str(d.problem, 160), part: str(d.part, 40) || "bicycle", fixable: d.fixable !== false, steps, prevent: str(d.prevent, 240) };
  }, canned.LOOK));
});

app.post("/api/track", upload.single("clip"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no clip" });
  res.json({ ...canned.track(req.body?.part), source: "canned" });
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
