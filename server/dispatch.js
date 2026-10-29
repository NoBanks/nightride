// Sorting a rider's words into one lane: fix / ride / safe / emergency.
// The emergency check runs in code first and always wins, whatever a model says later.

const EMERGENCY = [
  /\bhurt\b/, /\binjur/, /\bbleed/, /\bblood\b/, /\bhit by\b/, /\bgot hit\b/, /\bhit me\b/, /\bhit us\b/,
  /\bstruck\b/, /\bran me (over|off)\b/, /\brun over\b/, /\bcrash(ed)?\b/, /\bknocked (me )?(out|down|over)\b/,
  /can'?t move\b/, /can'?t (get|stand) up\b/,
  /can'?t breathe/, /cannot breathe/, /\bunconscious\b/, /passed out/, /chest pain/,
  /\bbroke my\b/, /\battack/, /following me/, /\bstabbed\b/, /\bshot\b/,
];

// Lithium battery fires: fire services say get away from it and call 911.
const FIRE = [/\bon fire\b/, /\bflames?\b/, /(battery|bike|scooter|charger)\b.{0,30}\b(smok|burn|fire|melt|hiss|swell)/, /(smok|burn|fire|melt|swell)\w*\b.{0,30}\b(battery|bike|scooter|charger)/];

// Places named "fire ..." are landmarks, not fires.
const clean = (text) => text.toLowerCase().replace(/fire (station|department|dept|road|hydrant|house)/g, "");

export function isEmergency(text = "") {
  const t = clean(text);
  return FIRE.some((re) => re.test(t)) || EMERGENCY.some((re) => re.test(t));
}

// The one line shown above the Call 911 button.
export function emergencySay(text = "") {
  return FIRE.some((re) => re.test(clean(text))) ? "Move away from the battery. Call 911." : "Call 911 now.";
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
    return { lane: "emergency", say: emergencySay(text), source: "guard" };
  }
  const t = text.toLowerCase();
  const hit = LANES.find((l) => l.re.test(t));
  if (hit) return { lane: hit.lane, say: hit.say, source: "canned" };
  return { lane: "ride", say: "I hear you. Here's what's open near you right now.", source: "canned" };
}
