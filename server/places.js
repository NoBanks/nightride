// Real places near the rider from OpenStreetMap (Overpass API: free, no key).
// Overpass can take most of a minute, so results are cached per ~1 km area and the
// client warms the cache as soon as it has a location.
import OpeningHours from "opening_hours";

const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
const UA = "NIGHTRIDE/0.1 (hackathon prototype; github.com/NoBanks/nightride)";
const TTL = 15 * 60 * 1000;
const cache = new Map();   // "lat,lng" (2 decimals) -> { at, places }
const inflight = new Map(); // same key -> Promise

const KINDS = {
  bicycle: { label: "Bike shop", why: "Tubes, tools, and people who fix bikes." },
  bicycle_repair_station: { label: "Bike repair stand", why: "Free tools and usually a pump, outdoors." },
  fuel: { label: "Gas station", why: "Lit and staffed. Many have an air pump." },
  convenience: { label: "Convenience store", why: "Lit, staffed, water and snacks." },
  supermarket: { label: "Grocery store", why: "Bright, busy, staff inside." },
  fast_food: { label: "Fast food", why: "Lit, people around, a place to wait." },
  cafe: { label: "Cafe", why: "A place to sit and wait for a ride." },
  police: { label: "Police station", why: "Go here if someone is following you." },
  hospital: { label: "Hospital", why: "Open all night, staffed." },
};

// Which kinds help most for each dispatch lane, best first.
const PRIORITY = {
  fix: ["bicycle", "bicycle_repair_station", "fuel", "convenience"],
  ride: ["fuel", "convenience", "fast_food", "supermarket", "cafe"],
  safe: ["police", "hospital", "convenience", "fuel", "supermarket", "fast_food"],
};

const query = (lat, lng) => `[out:json][timeout:50];(
nwr(around:4000,${lat},${lng})["amenity"~"^(fuel|bicycle_repair_station|police|hospital|fast_food|cafe)$"]["name"];
nwr(around:4000,${lat},${lng})["shop"~"^(convenience|supermarket|bicycle)$"]["name"];
);out center tags 120;`;

async function fetchOverpass(lat, lng) {
  let lastErr;
  for (const url of ENDPOINTS) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query(lat, lng))}`,
        signal: AbortSignal.timeout(70000),
      });
      if (!r.ok) throw new Error(`overpass ${r.status}`);
      return (await r.json()).elements || [];
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

function toPlace(el) {
  const t = el.tags || {};
  const kind = t.shop || t.amenity;
  if (!KINDS[kind]) return null;
  const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { name: t.name, kind, lat, lng, hours: t.opening_hours || null, air: t.compressed_air === "yes" };
}

export async function placesNear(lat, lng) {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.places;
  if (!inflight.has(key)) {
    inflight.set(key, fetchOverpass(+lat.toFixed(2), +lng.toFixed(2))
      .then((els) => {
        const places = els.map(toPlace).filter(Boolean);
        cache.set(key, { at: Date.now(), places });
        return places;
      })
      .finally(() => inflight.delete(key)));
  }
  return inflight.get(key);
}

function openState(hours, now) {
  if (!hours) return { open: null, label: "Hours not listed" };
  if (hours.trim() === "24/7") return { open: true, label: "Open 24 hours" };
  try {
    const oh = new OpeningHours(hours, null);
    if (!oh.getState(now)) return { open: false, label: "Closed now" };
    const next = oh.getNextChange(now);
    return { open: true, label: next ? `Open until ${next.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : "Open now" };
  } catch {
    return { open: null, label: "Hours not listed" };
  }
}

function miles(aLat, aLng, bLat, bLng) {
  const R = 3958.8, rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad, dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Top 3 for this lane, never a closed place. Score in "miles of detour": each mile counts,
// each step down the lane's priority list adds one, and unknown hours add 1.5.
export function rank(places, lane, lat, lng, now = new Date()) {
  const order = PRIORITY[lane] || PRIORITY.ride;
  const score = (p) => p.miles + order.indexOf(p.kind) + (p.open ? 0 : 1.5);
  return places
    .filter((p) => order.includes(p.kind))
    .map((p) => ({ ...p, ...openState(p.hours, now), miles: miles(lat, lng, p.lat, p.lng) }))
    .filter((p) => p.open !== false)
    .sort((a, b) => score(a) - score(b))
    .slice(0, 3)
    .map((p) => ({
      name: p.name,
      kind: KINDS[p.kind].label,
      why: p.air ? `${KINDS[p.kind].why} Air pump listed.` : KINDS[p.kind].why,
      open: p.label,
      miles: Math.round(p.miles * 10) / 10,
      lat: p.lat,
      lng: p.lng,
    }));
}
