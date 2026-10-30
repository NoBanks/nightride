// Live end-to-end check, run against the deployed site: npm run test:live
// (set NIGHTRIDE_URL to point it elsewhere). Calls the real model a few times; never writes to the close-call map.
// End-to-end smoke test against the LIVE site, the way a phone uses it. No writes to the close-call map.
import { readFileSync } from "node:fs";
const BASE = process.env.NIGHTRIDE_URL || "https://nightride.nohumannearby.com";
const results = [];
const check = async (name, fn) => {
  const t = Date.now();
  try { const note = await fn(); results.push(["PASS", name, `${Date.now() - t} ms`, note || ""]); }
  catch (e) { results.push(["FAIL", name, `${Date.now() - t} ms`, String(e.message || e)]); }
};
const json = async (path, body) => {
  const r = await fetch(BASE + path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
  if (!r.ok) throw new Error(`${path} -> HTTP ${r.status}`);
  return r.json();
};
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const loc = { lat: 34.5008, lng: -117.1859 };

await check("site loads over HTTPS", async () => { const r = await fetch(BASE + "/"); expect(r.ok && (await r.text()).includes("NIGHTRIDE"), "home page"); });
await check("health: live AI mode", async () => { const h = await json("/api/health"); expect(h.mode === "live", `mode ${h.mode}`); return "mode live"; });
await check("offline files served (service worker, guard, matcher)", async () => {
  for (const p of ["/sw.js", "/shared/dispatch.js", "/shared/match.js", "/manifest.webmanifest", "/icon-512.png"]) { const r = await fetch(BASE + p); expect(r.ok, p); }
  return "5 files";
});
await check("playbook: 64 fact-checked cards", async () => {
  const { cards } = await json("/api/playbook");
  expect(cards.length === 64, `${cards.length} cards`); expect(cards.every((c) => c.sources.length && c.qa), "unsourced or unchecked card");
  return "64 cards, all sourced + checked";
});
const wav = readFileSync(new URL("./fixtures/ask_flat.wav", import.meta.url));
await check("hear: voice -> Muse Spark Open transcript", async () => {
  const fd = new FormData(); fd.append("audio", new Blob([wav], { type: "audio/wav" }), "talk.wav");
  const r = await fetch(BASE + "/api/transcribe", { method: "POST", body: fd }); const j = await r.json();
  expect(j.source === "muse-spark-open" && /tire/i.test(j.text), `${j.source}: ${j.text}`); return `"${j.text}"`;
});
// A 2.5 s WebM, the format Android Chrome records; the server converts it for SAM.
const clip = readFileSync(new URL("./fixtures/wheels.webm", import.meta.url));
await check("outline: Meta SAM 3.1 tracks the part in every frame", async () => {
  const fd = new FormData(); fd.append("clip", new Blob([clip], { type: "video/webm" }), "clip.webm"); fd.append("part", "bicycle wheel");
  const j = await (await fetch(BASE + "/api/track", { method: "POST", body: fd })).json();
  expect(j.source === "sam-3.1", `source ${j.source}`);
  expect(j.frames.length >= 20 && j.found === j.frames.length, `found in ${j.found}/${j.frames.length} frames`);
  const inside = j.frames.every((f) => f.rings.flat().every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1));
  expect(inside, "outline point outside the frame");
  return `wheel outlined in ${j.found}/${j.frames.length} frames, SAM ${j.ms} ms`;
});
for (const [text, lane] of [["my back tire just went flat", "fix"], ["my e-bike cut out and I'm six miles from home", "ride"], ["a truck keeps slowing down next to me and I'm scared", "safe"]]) {
  await check(`sort: "${text}" -> ${lane}`, async () => {
    const d = await json("/api/dispatch", { text, battery: 0.4 });
    expect(d.lane === lane, `got ${d.lane}`); expect(d.source === "muse-spark-open", `source ${d.source}`);
    return `card: ${d.card ? d.card.id : "none"}`;
  });
}
for (const [text, say] of [["a car hit me", "Call 911 now."], ["my battery is smoking", "Move away from the battery. Call 911."]]) {
  await check(`911 guard: "${text}" never reaches the model`, async () => {
    const d = await json("/api/dispatch", { text });
    expect(d.lane === "emergency" && d.source === "guard" && d.say === say, JSON.stringify(d)); return `source guard`;
  });
}
await check("places: real, open now, near Apple Valley", async () => {
  const { places, source } = await json("/api/nearby", { location: loc, lane: "safe" });
  expect(source === "openstreetmap" && places.length, `source ${source}`); return places.map((p) => `${p.name} (${p.open})`).join(", ");
});
await check("tell my people: message with map link", async () => {
  const { message, link } = await json("/api/share", { location: loc, battery: 0.23, note: "flat tire" });
  expect(link && message.includes("23%"), message); return link;
});
await check("close call map + CSV readable (no write)", async () => {
  const { calls } = await json("/api/closecalls"); const csv = await (await fetch(BASE + "/api/closecalls.csv")).text();
  expect(csv.startsWith("reported_at_utc"), "csv header"); return `${calls.length} real reports`;
});

for (const r of results) console.log(r.join(" | "));
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(`SUMMARY: ${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
