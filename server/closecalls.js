// Close calls: one tap logs where and when a driver came too close.
// Stored as a small JSON file (no database, no accounts). Locations are rounded to
// 3 decimals (about one block) before they are saved, so no exact spot is ever kept.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const DIR = fileURLToPath(new URL("../data", import.meta.url));
const FILE = join(DIR, "closecalls.json");
export const TAGS = ["too close", "ran off road", "yelled or threw", "almost hit"];

const calls = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : [];
const round = (n) => Math.round(n * 1000) / 1000;

function save() {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(calls));
}

export function add(lat, lng) {
  const call = { id: randomUUID().slice(0, 8), at: new Date().toISOString(), lat: round(lat), lng: round(lng), tag: null };
  calls.push(call);
  save();
  return call;
}

export function setTag(id, tag) {
  const call = calls.find((c) => c.id === id);
  if (!call || !TAGS.includes(tag)) return null;
  call.tag = tag;
  save();
  return call;
}

export const all = () => calls;

// For a city traffic office: one row per report.
export function csv() {
  const rows = calls.map((c) => [c.at, c.lat, c.lng, c.tag || ""].join(","));
  return ["reported_at_utc,lat,lng,what_happened", ...rows].join("\n");
}
