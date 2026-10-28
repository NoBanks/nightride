import express from "express";
import multer from "multer";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { cannedDispatch } from "./dispatch.js";
import * as canned from "./canned.js";

// Keys live outside the repo (and outside OneDrive) in ~/.nightride/.env.
const SECRETS = join(homedir(), ".nightride", ".env");
if (existsSync(SECRETS)) process.loadEnvFile(SECRETS);

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const PORT = Number(process.env.PORT) || 8787;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(fileURLToPath(new URL("../public", import.meta.url))));

// Every route answers from canned.js until the Meta Model API credits land.
app.get("/api/health", (_req, res) => res.json({ ok: true, mode: "canned" }));

app.post("/api/transcribe", upload.single("audio"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no audio" });
  res.json({ text: canned.TRANSCRIPT, source: "canned" });
});

app.post("/api/dispatch", (req, res) => {
  const { text } = req.body || {};
  if (!text || typeof text !== "string") return res.status(400).json({ error: "no text" });
  res.json(cannedDispatch(text));
});

app.post("/api/look", upload.single("clip"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no clip" });
  res.json({ ...canned.LOOK, source: "canned" });
});

app.post("/api/track", upload.single("clip"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no clip" });
  res.json({ ...canned.track(req.body?.part), source: "canned" });
});

app.post("/api/nearby", (_req, res) => {
  res.json({ places: canned.nearby(), source: "canned" });
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

app.listen(PORT, () => console.log(`NIGHTRIDE on http://localhost:${PORT}`));
