// With no signal the phone runs shared/dispatch.js + shared/match.js itself. It must give the
// rider the same lane and the same verified card the server would.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cannedDispatch, isEmergency } from "../server/dispatch.js";
import { matchCards, LANE_CATEGORIES } from "../shared/match.js";
import { cards, match, publicCard } from "../server/playbook.js";

// What the phone has: the cards as /api/playbook serves them.
const phoneCards = cards.map(publicCard);

const PHRASES = [
  "my chain snapped", "my back tire is flat", "my e-bike just cut out", "a truck keeps slowing down next to me",
  "goathead thorns keep giving me flats", "my brakes aren't stopping", "it's so hot I feel dizzy",
];

test("offline card matching equals the server's", () => {
  for (const text of PHRASES) {
    const lane = cannedDispatch(text).lane;
    if (lane === "emergency") continue;
    const server = match(text, LANE_CATEGORIES[lane])[0]?.id;
    const phone = matchCards(phoneCards, text, LANE_CATEGORIES[lane])[0]?.id;
    assert.equal(phone, server, text);
  }
});

test("offline, emergency words still go to Call 911", () => {
  for (const text of ["a car hit me", "I'm bleeding", "the battery is smoking"]) {
    assert.ok(isEmergency(text), text);
    assert.equal(cannedDispatch(text).lane, "emergency", text);
  }
});

test("the phone gets everything it needs to show a card with sources", () => {
  for (const c of phoneCards) {
    assert.ok(c.triggers?.length && c.steps?.length && c.sources?.length, c.id);
    assert.ok(c.sources.every((s) => s.url.startsWith("https://")), c.id);
  }
});
