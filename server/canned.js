// Canned answers so every screen works before the Meta API credits land.
// Each one has the same shape the real model route will return.

export const TRANSCRIPT = "My back tire just went flat and I'm about four miles from home.";

export const LOOK = {
  problem: "Rear tire is flat. Most likely a puncture in the tube.",
  part: "bicycle tire",
  steps: [
    "Shift to the smallest rear gear, then open the brake and the wheel's quick release.",
    "Pull the wheel out. Let the chain hang free.",
    "Use a tire lever to pop one side of the tire off the rim, then pull the tube out.",
    "Run your fingers slowly inside the tire. Pull out anything sharp you feel.",
    "Put a little air in the new tube, tuck it in, and push the tire bead back on with your thumbs.",
    "Pump it up, put the wheel back, close the brake. Spin it once to check.",
  ],
};

// Mask format used by the client overlay: per frame, a list of rings in 0..1
// video coordinates, filled even-odd so the inner ring cuts a hole.
function ellipse(cx, cy, rx, ry, n = 40) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [+(cx + Math.cos(a) * rx).toFixed(4), +(cy + Math.sin(a) * ry).toFixed(4)];
  });
}

export function track(part = LOOK.part) {
  const fps = 15;
  const frames = Array.from({ length: 45 }, (_, i) => {
    // Small drift so the overlay reads as following a hand-held camera.
    const cx = 0.5 + Math.sin(i / 7) * 0.03;
    const cy = 0.55 + Math.cos(i / 9) * 0.02;
    return { rings: [ellipse(cx, cy, 0.34, 0.3), ellipse(cx, cy, 0.27, 0.235)] };
  });
  return { part, fps, frames };
}

export function nearby() {
  return [
    { name: "24-hour store", why: "Open all night. Tubes, pumps, a bright lot.", open: "Open 24 hours", query: "24 hour store" },
    { name: "Gas station", why: "Lit, staffed, and most have an air pump.", open: "Usually open late", query: "gas station" },
    { name: "Bus stop with a bike rack", why: "Ride the rest of the way with the bike on the front.", open: "Check the last bus time", query: "bus stop" },
  ];
}
