# NIGHTRIDE receipts

Every claim in the demo, the test that proves it, and the code to read. Run them yourself:

```
npm install
npm test            # unit tests, no network, no model calls
npm run test:live   # end-to-end against https://nightride.nohumannearby.com (calls the real model a few times)
npm run test:judge  # a headless phone browser walks every feature in the demo video, screenshots in e2e/out/
```

## Claim → proof → code

| Claim | Test | Code |
|---|---|---|
| Emergency words skip the model and go to Call 911 | `test/dispatch.test.js`: *every emergency phrase goes to Call 911*, *the guard wins even when other lanes match*; live: *911 guard ... never reaches the model* (`source: "guard"`) | `server/dispatch.js` (`isEmergency`, `emergencySay`); `server/index.js` route `/api/dispatch` checks the guard before `live()` |
| Battery smoke or fire: "Move away from the battery. Call 911." | `test/dispatch.test.js`: *battery fires get the move-away line*; live: *"my battery is smoking"* | `server/dispatch.js` (`FIRE`) |
| Everyday trouble is not treated as an emergency | `test/dispatch.test.js`: *everyday trouble is not an emergency* | `server/dispatch.js` |
| Call 911 never calls anyone by itself | read the markup: a `tel:911` link opens the phone's dialer; the rider presses call | `public/index.html` (`#emergency`) |
| Muse Spark Open (Meta open weights) hears the rider | live: *hear: voice -> Muse Spark Open transcript* (`source: "muse-spark-open"`) | `server/spark.js` (`sparkTranscribe`, model `meta-models/muse-spark-open-1026` on Baseten); `server/audio.js` (WebM/MP4 to WAV) |
| Muse Spark Open sorts the situation into fix / ride / safe | live: three *sort:* checks (fix, ride, safe) | `server/prompts.js` (`DISPATCH`), `server/index.js` `/api/dispatch` |
| Muse Spark Open looks at a photo and picks a verified card; steps come from the card, not the model | captured in the demo's Under the Hood panel | `server/prompts.js` (`lookWithPlaybook`), `server/index.js` `/api/look` |
| SAM 3.1 outlines the part Muse Spark named, in every frame of the rider's clip | live: *outline: Meta SAM 3.1 tracks the part in every frame* (`source: "sam-3.1"`, a WebM clip like Android records); `test/sam.test.js`: *SAM mask paths are placed at the mask's box*, *an Android WebM clip becomes an H.264 MP4 SAM accepts* | `server/sam.js` (`toMp4`, `samTrack`, `pathToRings`), `server/index.js` `/api/track`, `public/app.js` (`playMasks`) |
| No fake outline: if SAM finds nothing, nothing is drawn | read the code: live mode never falls back to preview data | `server/index.js` `/api/track` (`frames: []` on a miss), `public/app.js` (*Couldn't outline the ...*) |
| 64 playbook cards, each sourced and fact-checked | `test/playbook.test.js`: *every card has steps, triggers, sources and a fact-check*; live: *playbook: 64 fact-checked cards* | `playbook/*.json`; fact-check reports in `playbook/qa/` |
| Long repairs read as parts; the rider always knows what's next | `test/playbook.test.js`: *long repair cards come in stages that cover every step*, *the rider always knows where they are*; judge: *21 steps read as 4 parts* | `shared/stages.js`, `playbook/*.json` (`stages`), `public/app.js` (`showStep`, `renderStepList`) |
| Meta spend can never pass $140 | `test/spend.test.js`: *the call that would cross $140 is refused*, *config can never raise the ceiling* | `server/spend.js`; meter at `/api/health` (`metaSpend`) |
| Rider words find the right card with zero model tokens | `test/playbook.test.js`: *common rider words find the right card* | `shared/match.js` (`matchCards`), `server/playbook.js` |
| Works with no signal: same guard, same card on the phone | `test/offline.test.js`: *offline card matching equals the server's*, *offline, emergency words still go to Call 911* | `public/sw.js` (service worker cache), `shared/dispatch.js` served from `server/dispatch.js`, `public/app.js` (`handleText` fallback) |
| "Get me somewhere" never shows a closed place | `test/places.test.js`: *closed places are never shown*, *open-now places carry an honest label*; live: *places: real, open now* | `server/places.js` (`rank`, `openState`), data from OpenStreetMap (Overpass) |
| Feeling unsafe surfaces a police station when one is near | `test/places.test.js`: *feeling unsafe puts the police station in the list* | `server/places.js` (`PRIORITY.safe`) |
| Close calls are stored rounded to about a block, no names, no accounts | live: *close call map + CSV readable* (read-only) | `server/closecalls.js` (`round`), `/api/closecalls.csv` |
| Tell my people: pick people from the phone's contacts, one tap texts them battery and a map link from the rider's own phone | live: *tell my people* | `server/index.js` `/api/share`, `public/app.js` (`navigator.contacts.select`, `sms:` to every picked number, `navigator.share`) |
| The free model credit can't be drained by a public link | read the code | `server/index.js` (`allowModel`: per-visitor and daily caps; past them the playbook still answers) |
| The model keys never reach the browser | read the code: only the server reads `BASETEN_API_KEY` and `MODEL_API_KEY` | `server/spark.js`, `server/sam.js`, `.env.example` |
| Built during the hackathon | `git log` starts Oct 26 2026 9:03 PM PT (Oct 27 12:03 AM ET) | commit history |

## Latest results

Run on the builder's machine, Oct 30 2026 (PT).

**Judge walkthrough, `npm run test:judge` against the live site: 13 passed, 0 failed**

```
PASS | 1. opens on a phone: one big talk button, no fake features
PASS | 2. hold to talk: Muse Spark Open hears "my back tire just went flat" and says FIX IT
PASS | 3. the verified card shows its sources and fact-check     | 4 sources; 4 parts
PASS | 4. camera: Muse Spark names the part, SAM 3.1 outlines it  | "rear tire"
PASS | 5. 21 steps read as 4 parts; Back, Next, See all steps and Finish all work
PASS | 6. can't fix it here: Get me somewhere and Tell my people are on the fix screen
PASS | 7. e-bike cut out: RIDE, the roadside card, then places open right now with bike directions
PASS | 8. close call: the map and the city CSV (tap + tag + law line checked on a local copy, so the live map holds only real reports)
PASS | 9. "a car hit me" goes straight to full-screen Call 911
PASS | 9. "the battery is smoking" goes straight to full-screen Call 911
PASS | 10. tell my people: add Mom, one tap opens Messages with battery and a map link
PASS | 11. no signal (page and service worker both offline): app opens, 911 rule and chain card still work
PASS | 12. playbook: all 64 cards readable
```

**Unit, `npm test`: 24 passed, 0 failed** (the list below plus the stage and spend-cap tests)

```
✔ every emergency phrase goes to Call 911
✔ everyday trouble is not an emergency
✔ battery fires get the move-away line
✔ the guard wins even when other lanes match
✔ offline card matching equals the server's
✔ offline, emergency words still go to Call 911
✔ the phone gets everything it needs to show a card with sources
✔ closed places are never shown
✔ open-now places carry an honest label
✔ feeling unsafe puts the police station in the list
✔ a gas station confirmed open beats a closer one with unknown hours
✔ every card has steps, triggers, sources and a fact-check
✔ common rider words find the right card
✔ SAM mask paths are placed at the mask's box, in 0..1 of the frame
✔ outline points never land outside the frame
✔ holes and second objects stay separate rings; long rings are thinned
✔ an Android WebM clip becomes an H.264 MP4 SAM accepts
```

**Live end-to-end, `npm run test:live` against https://nightride.nohumannearby.com: 14 passed, 0 failed**

```
PASS | site loads over HTTPS
PASS | health: live AI mode
PASS | offline files served (service worker, guard, matcher)
PASS | playbook: 64 fact-checked cards                 | 64 cards, all sourced + checked
PASS | hear: voice -> Muse Spark Open transcript        | "My back tire just went flat, and I am about four miles from home."
PASS | outline: Meta SAM 3.1 tracks the part in every frame | wheel outlined in 25/25 frames, SAM 3523 ms
PASS | sort: "my back tire just went flat" -> fix        | card: repair-flat-rear-tube
PASS | sort: "my e-bike cut out ..." -> ride             | card: ebike-cutout-roadside
PASS | sort: "a truck keeps slowing down ..." -> safe    | card: safety-driver-harassing
PASS | 911 guard: "a car hit me" never reaches the model
PASS | 911 guard: "my battery is smoking" never reaches the model
PASS | places: real, open now, near Apple Valley        | 7-Eleven, Central Market, Del Taco (all open 24 hours)
PASS | tell my people: message with map link
PASS | close call map + CSV readable (no write)
```

**On the phone screen, live site:** typed "my back tire is going flat" → FIX IT → Open the camera → Muse Spark Open named "rear tire" → SAM 3.1 outlined it in 25/25 frames (3.2 s) → the clip replays with the amber outline moving with the wheel.

The test audio in `e2e/fixtures/` is a generic Windows text-to-speech voice, not the builder's. The test clip is a 2.5 s crop of the bike's wheels from the demo footage.
