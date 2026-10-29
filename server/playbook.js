// NIGHTRIDE's verified playbook: short cards written from cited sources (playbook/*.json).
// Cards are picked by keyword in code (no model tokens); for photos the model only names
// which card fits, and the steps come from the card, not from the model.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { matchCards, LANE_CATEGORIES } from "../shared/match.js";

export { LANE_CATEGORIES };

const DIR = fileURLToPath(new URL("../playbook", import.meta.url));
export const cards = existsSync(DIR)
  ? readdirSync(DIR).filter((f) => f.endsWith(".json")).flatMap((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")))
  : [];
const byId = new Map(cards.map((c) => [c.id, c]));

export const getCard = (id) => byId.get(id) || null;

export const match = (text, categories, limit = 1) => matchCards(cards, text, categories, limit);

// One line per card, for the vision prompt.
export const menu = (categories) =>
  cards.filter((c) => categories.includes(c.category)).map((c) => `${c.id}: ${c.title}`).join("\n");

// What the phone gets: the card plus where every step came from.
export const publicCard = (c) => c && ({
  id: c.id,
  title: c.title,
  category: c.category,
  triggers: c.triggers, // the phone matches cards itself when there's no signal
  summary: c.summary,
  steps: c.steps,
  warnings: c.warnings || [],
  prevent: c.prevent || "",
  confidence: c.confidence,
  qa: c.qa ? { status: c.qa.status, checked: c.qa.checked } : null,
  sources: (c.sources || []).map(({ org, title, url }) => ({ org, title, url })),
});
