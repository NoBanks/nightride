import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A throwaway ledger, and a config that tries to raise the cap past $140.
const dir = mkdtempSync(join(tmpdir(), "nightride-spend-"));
process.env.META_SPEND_FILE = join(dir, "meta-spend.json");
process.env.META_SPEND_CAP = "500";
const { reserve, spend, samVideoCost, HARD_CAP_USD } = await import("../server/spend.js");

test("a SAM scan costs $0.01: Meta bills at least 50 frames at $0.20 per 1,000", () => {
  assert.equal(samVideoCost(25), 0.01);
  assert.equal(samVideoCost(100), 0.02);
});

test("config can never raise the ceiling past $140", () => {
  assert.equal(HARD_CAP_USD, 140);
  assert.equal(spend().capUsd, 140);
});

test("the call that would cross $140 is refused, and nothing after it gets through", () => {
  let ok = 0;
  while (reserve(10, "test")) ok += 1;
  assert.equal(ok, 14);
  assert.equal(spend().spentUsd, 140);
  assert.equal(reserve(0.01, "test"), null);
});

test("the ledger is on disk, so a restart starts from what was already spent", () => {
  assert.equal(JSON.parse(readFileSync(process.env.META_SPEND_FILE, "utf8")).spentUsd, 140);
  assert.match(readFileSync(process.env.META_SPEND_FILE.replace(/\.json$/, ".log"), "utf8"), /REFUSED/);
});

test("if Meta bills more than reserved, the ledger counts the larger amount", async () => {
  process.env.META_SPEND_FILE = join(dir, "second.json");
  const fresh = await import(`../server/spend.js?second`);
  const settle = fresh.reserve(0.01, "test");
  settle(0.05);
  assert.equal(fresh.spend().spentUsd, 0.05);
});
