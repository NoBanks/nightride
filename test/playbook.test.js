// The playbook is read aloud to tired riders; keep every card well-formed and sourced.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cards, match, LANE_CATEGORIES } from "../server/playbook.js";

test("every card has steps, triggers, sources and a fact-check", () => {
  assert.ok(cards.length > 0, "no cards loaded");
  const ids = new Set();
  for (const c of cards) {
    assert.ok(!ids.has(c.id), `duplicate id ${c.id}`);
    ids.add(c.id);
    assert.ok(c.steps?.length, `${c.id}: no steps`);
    assert.ok(c.triggers?.length, `${c.id}: no triggers`);
    assert.ok(c.sources?.length, `${c.id}: no sources`);
    assert.ok(c.qa?.status, `${c.id}: not fact-checked`);
    for (const s of c.sources) assert.match(s.url, /^https:\/\//, `${c.id}: bad source url`);
    for (const s of c.steps) assert.ok(s.split(/\s+/).length <= 20, `${c.id}: step over 20 words: ${s}`);
  }
});

test("common rider words find the right card", () => {
  const cases = [
    ["my back tire just went flat", "fix", "repair-flat-rear-tube"],
    ["my chain snapped", "fix", "repair-chain-snapped"],
    ["my e-bike just cut out", "ride", "ebike-cutout-roadside"],
    ["a truck keeps slowing down next to me", "safe", "safety-driver-harassing"],
  ];
  for (const [text, lane, id] of cases) assert.equal(match(text, LANE_CATEGORIES[lane])[0]?.id, id, text);
});
