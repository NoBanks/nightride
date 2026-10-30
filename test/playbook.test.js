// The playbook is read aloud to tired riders; keep every card well-formed and sourced.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cards, match, LANE_CATEGORIES } from "../server/playbook.js";
import { groupSteps, stageOf } from "../shared/stages.js";

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

test("long repair cards come in stages that cover every step, in order", () => {
  for (const id of ["repair-flat-rear-tube", "repair-flat-front-tube", "repair-chain-snapped", "ebike-cutout-roadside", "repair-ebike-hub-motor-wheel"]) {
    const c = cards.find((x) => x.id === id);
    assert.ok(c.stages?.length >= 3, `${id}: no stages`);
  }
  for (const c of cards.filter((x) => x.stages)) {
    assert.equal(c.stages[0].from, 1, `${c.id}: first stage must start at step 1`);
    c.stages.forEach((s, k) => {
      assert.ok(s.name && s.from <= c.steps.length, `${c.id}: bad stage ${s.name}`);
      if (k) assert.ok(s.from > c.stages[k - 1].from, `${c.id}: stages out of order`);
    });
    assert.equal(groupSteps(c.stages, c.steps).flatMap((g) => g.steps).join("|"), c.steps.join("|"), `${c.id}: a step was lost`);
  }
});

test("the rider always knows where they are: rear flat step 10 is part 2 of 4, step 2 of 6", () => {
  const c = cards.find((x) => x.id === "repair-flat-rear-tube");
  assert.deepEqual(stageOf(c.stages, 9, c.steps.length), { name: "Find what caused it", n: 2, of: 4, step: 2, steps: 6 });
  assert.deepEqual(stageOf(c.stages, 20, c.steps.length), { name: "Wheel back on", n: 4, of: 4, step: 2, steps: 2 });
  assert.equal(stageOf([], 0, 5), null);
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
