import { test } from "node:test";
import assert from "node:assert/strict";
import { pathToRings, toMp4 } from "../server/sam.js";

test("SAM mask paths are placed at the mask's box, in 0..1 of the frame", () => {
  // A 10x10 square drawn local to a mask whose box starts at (100, 50) in a 200x100 frame.
  const [ring] = pathToRings("M0 0L10 0L10 10L0 10Z", 100, 50, 200, 100);
  assert.deepEqual(ring, [[0.5, 0.5], [0.55, 0.5], [0.55, 0.6], [0.5, 0.6]]);
});

test("outline points never land outside the frame", () => {
  const [ring] = pathToRings("M-0.5 -0.5L20 -0.5L20 20Z", 0, 0, 10, 10);
  assert.ok(ring.flat().every((v) => v >= 0 && v <= 1));
});

test("holes and second objects stay separate rings; long rings are thinned", () => {
  const big = "M0 0" + Array.from({ length: 500 }, (_, i) => `L${i} 1`).join("") + "Z";
  const rings = pathToRings(`${big}M5 5L6 5L6 6Z`, 0, 0, 1000, 10);
  assert.equal(rings.length, 2);
  assert.ok(rings[0].length <= 120);
});

test("an Android WebM clip becomes an H.264 MP4 SAM accepts", async () => {
  const { readFileSync } = await import("node:fs");
  const mp4 = await toMp4(readFileSync(new URL("../e2e/fixtures/wheels.webm", import.meta.url)));
  assert.equal(mp4.subarray(4, 8).toString(), "ftyp");
  assert.ok(mp4.includes(Buffer.from("avc1")), "H.264 video track");
});
