# NIGHTRIDE

**Built for the worst hour. Works at every hour.**

**Demo video:** https://youtu.be/ZW6jwK26yeE  ·  **Receipts (every claim, its test, its code):** [RECEIPTS.md](RECEIPTS.md)

**Live:** https://nightride.nohumannearby.com (open it on a phone; Add to Home Screen installs it, and it keeps working with no signal)

A voice-first night dispatcher for people who are not in a car: cyclists, e-bike riders, walkers, skaters.
When something goes wrong after dark (a flat, a snapped chain, an e-bike that cuts out miles from home,
a driver who won't leave you alone), you hold one button and say what happened. NIGHTRIDE sorts it,
tells you the one next thing to do out loud, and shows you where that advice came from.

Built for the Meta Global AI Developer Hackathon (Indie track) by a rider who commutes 20 miles a shift
on an e-bike through California's High Desert, often home after dark. Every line in this repo was
written during the hackathon building period, starting Oct 27 2026 12:00 AM ET. The commit history is the record.

## Why

- 76% of US pedestrian deaths and 52% of cyclist deaths happen in the dark (NHTSA, 2024 data).
- Pedestrian deaths at night rose 84% from 2010 to 2023; daytime deaths rose 28% (GHSA, 2025).
- 1 in 4 pedestrians and 1 in 5 cyclists killed were hit by a driver who left the scene (NHTSA, 2024).
- 11.3 million US households have no vehicle (Census ACS 2024).

## What it does

| Feature | How | Meta model |
|---|---|---|
| **Talk** | Hold to talk; audio is converted to WAV and transcribed in about two seconds. A model's refusal is never shown as the rider's words; silence gets a mic hint. | Muse Voice Transcribe (Meta Model API), Muse Spark Open as backup |
| **Dispatch** | One card: FIX IT, RIDE, SAFE PLACE, or EMERGENCY, spoken aloud. | Muse Spark Open |
| **Fix it** | Camera frame of the problem; the model names it and picks a verified playbook card. | Muse Spark Open (vision) |
| **Part outline** | The part Muse Spark named ("rear tire") is outlined in amber in every frame of the rider's clip, then replayed on screen. No made-up outline: if SAM finds nothing, none is drawn. | SAM 3.1 (Meta Model API) |
| **Get me somewhere** | Real places open right now, ranked for the situation, one tap to bike directions. | none (OpenStreetMap) |
| **Tell my people** | Message with battery and a live map link, sent from the rider's own phone. | none |
| **Close call** | One tap logs where a driver came too close. Reports stack into hotspots on a night map; the city can download them as CSV. | none |

Sorting and seeing (and backup hearing) use **Muse Spark Open** (open weights, `meta-models/muse-spark-open-1026`) served on Baseten.
Hearing uses **Muse Voice Transcribe** (muse-voice-transcribe-1.0, Meta Model API). The part outline uses **SAM 3.1** (`sam-3.1`) on the Meta Model API: the clip is converted to H.264 MP4, sent with the
part name as the concept prompt, and the streamed masks are decoded with Meta's `@meta-sam/parser`.

## The verified playbook

64 short cards for the roadside: flats, chains, brakes, e-bike cutouts, lithium battery fire safety,
California bike law (VC 21760 three-foot passing, 21201 lights, 21202 lane position), what to do when a driver
harasses you, how to report dangerous roads in Apple Valley, desert heat and wind.

- Every card cites the pages it came from (Park Tool, CPSC, FDNY, NFPA, UL, Bosch, the California Vehicle Code,
  NWS, the San Bernardino County Sheriff), and every card was fact-checked against those sources in a second pass.
  The fact-check reports are in [`playbook/qa/`](playbook/qa/).
- Steps are written in our own words, at most 20 words each, for a tired person in the dark.
- Long repairs come in parts, so a 21-step rear flat reads as four small jobs: "Get the wheel off · part 1 of 4 ·
  Step 1 of 8". Back, See all steps (tap one to jump), and "Can't fix it here?" are always one tap away.
- Picking a card from the rider's words is plain keyword matching in code: **no model tokens**.
  For a photo, the model only names the problem and picks a card id; **the steps come from the cited card**,
  not from the model. If no card fits, the model writes steps and the app labels them "AI steps, not verified."

## Safety rules that live in code, not in a prompt

- Words like "hit me", "bleeding", "can't breathe", "following me" go straight to a full-screen **Call 911**
  button before any model sees them.
- Battery smoke, fire or swelling: "Move away from the battery. Call 911."
- No medical advice, ever. NIGHTRIDE never calls anyone by itself: the Call 911 button opens the
  phone's own dialer with 911 filled in, and the rider presses call. NIGHTRIDE is not an emergency service.
- Locked in by tests: `npm test`.

## Free and light

Free for the rider. The Meta Model API runs on the hackathon credit behind a hard $140 ceiling in code (`server/spend.js`). Places come from OpenStreetMap (Overpass), cached per area: the first lookup in a new area can take up to a minute (the app shows general ideas, labeled, and fills in real places when they arrive); after that it's instant. Voice replies use the phone's own speech engine. Map tiles are
OpenStreetMap. Keys stay on the server, outside the repo.

## Run it

```
npm install
npm start          # http://localhost:8787
npm test           # unit tests
npm run test:live  # end-to-end against the live site
npm run test:judge # walks every demo feature in a headless phone browser (fake mic + camera)
```

Put keys in `~/.nightride/.env` (see `.env.example`). Without a key every route answers from canned data.
`SPARK=off` keeps the key loaded but saves credit while building. Camera and mic need HTTPS on a phone.

## Layout

- `server/index.js` routes; the model key never reaches the browser
- `server/dispatch.js` lane sorting and the emergency guard
- `server/spark.js` Muse Spark Open client (Baseten, OpenAI-compatible)
- `server/voice.js` hearing: Muse Voice Transcribe, refusal and silence checks
- `server/sam.js` SAM 3.1 part outline (Meta Model API, Responses stream, `@meta-sam/parser`)
- `server/playbook.js` + `playbook/*.json` the verified cards
- `server/places.js` open-now places from OpenStreetMap
- `server/closecalls.js` close call reports (rounded to about a block, no accounts)
- `public/` the phone web app (plain HTML, CSS, JS)

## License

MIT for the code. Playbook cards are original summaries that link to their sources; map data
© OpenStreetMap contributors.
