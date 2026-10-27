// Sorting a rider's words into one lane: fix / ride / safe / emergency.
// The emergency check runs in code first and always wins, whatever a model says later.

const EMERGENCY = [
  /\bhurt\b/, /\binjur/, /\bbleed/, /\bblood\b/, /\bhit by\b/, /\bgot hit\b/,
  /can'?t breathe/, /cannot breathe/, /\bunconscious\b/, /passed out/, /chest pain/,
  /\bbroke my\b/, /\battack/, /following me/, /\bstabbed\b/, /\bshot\b/,
];

export function isEmergency(text = "") {
  const t = text.toLowerCase();
  return EMERGENCY.some((re) => re.test(t));
}

const LANES = [
  { lane: "fix", re: /\b(flat|tire|tyre|tube|chain|brake|pedal|wheel|spoke|puncture|derailleur|gear)/,
    say: "Got it. Sounds fixable. Point the camera at the problem and I'll walk you through it." },
  { lane: "safe", re: /\b(unsafe|scared|sketchy|dark|nervous|creepy|rain|cold|lost)/,
    say: "Okay. Let's get you somewhere lit and open. Here are the closest places." },
  { lane: "ride", re: /\b(home|ride|pick ?up|stranded|stuck|far|tired|can'?t make it|battery)/,
    say: "Got it. Let's find you a way home. Here are your options." },
];

// Stand-in for the Muse Spark dispatcher until the API credits land.
export function cannedDispatch(text = "") {
  if (isEmergency(text)) {
    return { lane: "emergency", say: "Call 911 now.", source: "guard" };
  }
  const t = text.toLowerCase();
  const hit = LANES.find((l) => l.re.test(t));
  if (hit) return { lane: hit.lane, say: hit.say, source: "canned" };
  return { lane: "ride", say: "I hear you. Here's what's open near you right now.", source: "canned" };
}
