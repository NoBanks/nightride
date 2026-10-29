// NIGHTRIDE's verified playbook: short cards written from cited sources (playbook/*.json).
// Cards are picked by keyword in code (no model tokens); for photos the model only names
// which card fits, and the steps come from the card, not from the model.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const DIR = fileURLToPath(new URL("../playbook", import.meta.url));
export const cards = existsSync(DIR)
  ? readdirSync(DIR).filter((f) => f.endsWith(".json")).flatMap((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")))
  : [];
const byId = new Map(cards.map((c) => [c.id, c]));

export const getCard = (id) => byId.get(id) || null;

// Which card categories answer each dispatch lane.
export const LANE_CATEGORIES = {
  fix: ["repair", "ebike"],
  ride: ["ebike", "safety", "desert"],
  safe: ["safety", "report", "law", "desert"],
};

// Best cards for what the rider said. Multi-word triggers count for more.
export function match(text, categories, limit = 1) {
  const t = ` ${String(text).toLowerCase()} `;
  return cards
    .filter((c) => !categories || categories.includes(c.category))
    .map((c) => ({ c, score: c.triggers.reduce((s, trig) => (t.includes(trig.toLowerCase()) ? s + trig.split(" ").length : s), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.c);
}

// One line per card, for the vision prompt.
export const menu = (categories) =>
  cards.filter((c) => categories.includes(c.category)).map((c) => `${c.id}: ${c.title}`).join("\n");

// What the phone gets: the card plus where every step came from.
export const publicCard = (c) => c && ({
  id: c.id,
  title: c.title,
  category: c.category,
  summary: c.summary,
  steps: c.steps,
  warnings: c.warnings || [],
  prevent: c.prevent || "",
  confidence: c.confidence,
  qa: c.qa ? { status: c.qa.status, checked: c.qa.checked } : null,
  sources: (c.sources || []).map(({ org, title, url }) => ({ org, title, url })),
});
