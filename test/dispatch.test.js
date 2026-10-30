// The emergency guard decides when NIGHTRIDE skips the model and shows Call 911.
// A miss here is the worst bug the app can have; run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isEmergency, emergencySay, cannedDispatch } from "../server/dispatch.js";

const EMERGENCIES = [
  "a car hit me",
  "a car hit me and I'm bleeding",
  "a truck struck me",
  "someone ran me off the road",
  "I crashed hard",
  "I got knocked down by a car",
  "I can't get up",
  "I can't breathe",
  "someone is following me",
  "my bike is on fire",
  "I smell burning from my battery",
  "the battery is smoking",
  "my battery is swelling up",
  "flames coming out of the charger",
  "I think I broke my wrist",
  "I broke my collarbone",
  "my leg is broken",
  "someone shot at me",
  "I got shot",
  "a guy pulled a gun on me",
];

const NOT_EMERGENCIES = [
  "my battery is dead",
  "my e-bike battery died",
  "I'm near the fire station on Bear Valley",
  "my chain snapped",
  "my back tire is flat",
  "I'm burning out, so tired",
  "a truck keeps slowing down next to me",
  "I'm lost and it's dark",
  "I broke my chain",
  "I broke my back wheel",
  "I broke my derailleur hanger",
  "my spoke broke",
  "a car shot past me",
  "a truck shot by way too close",
];

test("every emergency phrase goes to Call 911", () => {
  for (const t of EMERGENCIES) assert.ok(isEmergency(t), `missed: ${t}`);
});

test("everyday trouble is not an emergency", () => {
  for (const t of NOT_EMERGENCIES) assert.ok(!isEmergency(t), `false alarm: ${t}`);
});

test("battery fires get the move-away line", () => {
  assert.equal(emergencySay("the battery is smoking"), "Move away from the battery. Call 911.");
  assert.equal(emergencySay("a car hit me"), "Call 911 now.");
});

test("the guard wins even when other lanes match", () => {
  assert.equal(cannedDispatch("my tire is flat because a car hit me").lane, "emergency");
});
