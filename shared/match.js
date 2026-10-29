// Card matching shared by the server and the phone, so the app picks the same verified
// card with or without signal. Pure functions only: no Node or browser APIs.

// Which card categories answer each dispatch lane.
export const LANE_CATEGORIES = {
  fix: ["repair", "ebike"],
  ride: ["ebike", "safety", "desert"],
  safe: ["safety", "report", "law", "desert"],
};

// Best cards for what the rider said. Multi-word triggers count for more.
export function matchCards(cards, text, categories, limit = 1) {
  const t = ` ${String(text).toLowerCase()} `;
  return cards
    .filter((c) => !categories || categories.includes(c.category))
    .map((c) => ({ c, score: (c.triggers || []).reduce((s, trig) => (t.includes(trig.toLowerCase()) ? s + trig.split(" ").length : s), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.c);
}
