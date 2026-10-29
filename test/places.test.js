// "Get me somewhere" must never send a rider to a closed place at night.
import { test } from "node:test";
import assert from "node:assert/strict";
import { rank } from "../server/places.js";

const here = { lat: 34.5, lng: -117.18 };
const at = (dLat) => ({ lat: here.lat + dLat, lng: here.lng });
const NIGHT = new Date("2026-10-29T23:30:00"); // 11:30 PM local

const places = [
  { name: "Closed Diner", kind: "fast_food", hours: "Mo-Su 06:00-21:00", ...at(0.001) },
  { name: "All Night Mart", kind: "convenience", hours: "24/7", ...at(0.02) },
  { name: "Late Tacos", kind: "fast_food", hours: "Mo-Su 10:00-26:00", ...at(0.005) },
  { name: "Mystery Gas", kind: "fuel", hours: null, ...at(0.004) },
  { name: "Open Gas", kind: "fuel", hours: "24/7", ...at(0.006) },
  { name: "Sheriff Station", kind: "police", hours: "24/7", ...at(0.03) },
];

test("closed places are never shown", () => {
  for (const lane of ["fix", "ride", "safe"]) {
    const names = rank(places, lane, here.lat, here.lng, NIGHT).map((p) => p.name);
    assert.ok(!names.includes("Closed Diner"), `${lane}: closed place shown`);
  }
});

test("open-now places carry an honest label", () => {
  const top = rank(places, "ride", here.lat, here.lng, NIGHT);
  assert.ok(top.length <= 3);
  for (const p of top) assert.match(p.open, /Open 24 hours|Open until|Hours not listed/);
});

test("feeling unsafe puts the police station in the list", () => {
  assert.ok(rank(places, "safe", here.lat, here.lng, NIGHT).some((p) => p.name === "Sheriff Station"));
});

test("a gas station confirmed open beats a closer one with unknown hours", () => {
  const names = rank(places, "ride", here.lat, here.lng, NIGHT).map((p) => p.name);
  assert.ok(names.includes("Open Gas"), "confirmed-open station missing");
  assert.ok(!names.includes("Mystery Gas") || names.indexOf("Open Gas") < names.indexOf("Mystery Gas"));
});
