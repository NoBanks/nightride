// Hard ceiling on Meta Model API spend. Every SAM call reserves its worst-case price here first;
// a call that would cross the ceiling is refused before it leaves this server, so the app stops
// at the cap and the rider still gets the steps. The ledger is on disk, outside the repo, so a
// restart or redeploy never resets it.
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const HARD_CAP_USD = 140; // never raised by config: META_SPEND_CAP can only lower it
const CAP = Math.min(HARD_CAP_USD, Number(process.env.META_SPEND_CAP) || HARD_CAP_USD);
const FILE = process.env.META_SPEND_FILE || join(homedir(), ".nightride", "meta-spend.json");
const LOG = FILE.replace(/\.json$/, ".log");

// Meta's published SAM 3.1 video price: $0.20 per 1,000 frames, billed at least 50 frames a request.
export const samVideoCost = (frames) => (Math.max(50, frames) * 0.2) / 1000;

function load() {
  try { return JSON.parse(readFileSync(FILE, "utf8")); } catch { return null; }
}

let ledger = load() || { spentUsd: 0, calls: 0, since: new Date().toISOString() };

function save(event) {
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(ledger, null, 1));
  appendFileSync(LOG, `${new Date().toISOString()} ${event} | spent $${ledger.spentUsd.toFixed(4)} of $${CAP}\n`);
}

export const spend = () => ({ spentUsd: +ledger.spentUsd.toFixed(4), capUsd: CAP, calls: ledger.calls });

// Reserve the worst case before calling. Returns a settle(actualUsd) function, or null if refused.
export function reserve(usd, what) {
  if (ledger.spentUsd + usd > CAP) {
    save(`REFUSED ${what} ($${usd.toFixed(4)} would cross the cap)`);
    return null;
  }
  ledger.spentUsd += usd;
  ledger.calls += 1;
  save(`reserve ${what} $${usd.toFixed(4)}`);
  // Meta reports what it billed; if that's more than reserved, the ledger takes the larger number.
  return (actualUsd) => {
    if (Number.isFinite(actualUsd) && actualUsd > usd) {
      ledger.spentUsd += actualUsd - usd;
      save(`settle ${what} +$${(actualUsd - usd).toFixed(4)}`);
    }
  };
}
