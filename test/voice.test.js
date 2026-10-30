import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isRefusal, wavStats } from "../server/voice.js";
import { toWav } from "../server/audio.js";

test("a model's refusal is never passed on as the rider's words", () => {
  for (const t of [
    "I don't have the ability to listen to or transcribe audio files, and no playable audio was included with your message.",
    "I can't transcribe this audio.",
    "I'm unable to process audio input.",
    "As an AI, I cannot hear recordings.",
    "No speech detected.",
  ]) assert.ok(isRefusal(t), t);
});

test("what riders actually say is kept", () => {
  for (const t of [
    "My back tire just went flat, and I am about four miles from home.",
    "my chain snapped on Bear Valley Road",
    "a truck keeps slowing down next to me and I'm scared",
    "my e-bike cut out and the display says error 30",
  ]) assert.ok(!isRefusal(t), t);
});

test("loudness tells a silent mic from real speech", async () => {
  const speech = wavStats(await toWav(readFileSync(new URL("../e2e/fixtures/ask_flat.wav", import.meta.url))));
  assert.ok(speech.seconds > 1 && speech.peakDb > -30, JSON.stringify(speech));
  // One second of silence, run through the same conversion the server uses (it adds header chunks).
  const raw = Buffer.alloc(44 + 32000);
  raw.write("RIFF", 0); raw.writeUInt32LE(36 + 32000, 4); raw.write("WAVEfmt ", 8); raw.writeUInt32LE(16, 16);
  raw.writeUInt16LE(1, 20); raw.writeUInt16LE(1, 22); raw.writeUInt32LE(16000, 24); raw.writeUInt32LE(32000, 28);
  raw.writeUInt16LE(2, 32); raw.writeUInt16LE(16, 34); raw.write("data", 36); raw.writeUInt32LE(32000, 40);
  assert.equal(wavStats(await toWav(raw)).peakDb, -Infinity);
});
