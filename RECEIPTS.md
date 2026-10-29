# NIGHTRIDE receipts

Every claim in the demo, the test that proves it, and the code to read. Run them yourself:

```
npm install
npm test            # unit tests, no network, no model calls
npm run test:live   # end-to-end against https://nightride.nohumannearby.com (calls the real model a few times)
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
| 64 playbook cards, each sourced and fact-checked | `test/playbook.test.js`: *every card has steps, triggers, sources and a fact-check*; live: *playbook: 64 fact-checked cards* | `playbook/*.json`; fact-check reports in `playbook/qa/` |
| Rider words find the right card with zero model tokens | `test/playbook.test.js`: *common rider words find the right card* | `shared/match.js` (`matchCards`), `server/playbook.js` |
| Works with no signal: same guard, same card on the phone | `test/offline.test.js`: *offline card matching equals the server's*, *offline, emergency words still go to Call 911* | `public/sw.js` (service worker cache), `shared/dispatch.js` served from `server/dispatch.js`, `public/app.js` (`handleText` fallback) |
| "Get me somewhere" never shows a closed place | `test/places.test.js`: *closed places are never shown*, *open-now places carry an honest label*; live: *places: real, open now* | `server/places.js` (`rank`, `openState`), data from OpenStreetMap (Overpass) |
| Feeling unsafe surfaces a police station when one is near | `test/places.test.js`: *feeling unsafe puts the police station in the list* | `server/places.js` (`PRIORITY.safe`) |
| Close calls are stored rounded to about a block, no names, no accounts | live: *close call map + CSV readable* (read-only) | `server/closecalls.js` (`round`), `/api/closecalls.csv` |
| Tell my people: message with battery and a map link, sent from the rider's own phone | live: *tell my people* | `server/index.js` `/api/share`, `public/app.js` (`navigator.share` / `sms:`) |
| The free model credit can't be drained by a public link | read the code | `server/index.js` (`allowModel`: per-visitor and daily caps; past them the playbook still answers) |
| The model key never reaches the browser | read the code: only the server reads `BASETEN_API_KEY` | `server/spark.js`, `.env.example` |
| Built during the hackathon | `git log` starts Oct 26 2026 9:03 PM PT (Oct 27 12:03 AM ET) | commit history |

## Latest results

Run on the builder's machine, Oct 29 2026 (PT).

**Unit, `npm test` (12:02:55 PM): 13 passed, 0 failed**

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
```

**Live end-to-end, `npm run test:live` against https://nightride.nohumannearby.com (12:02:18 PM): 13 passed, 0 failed**

```
PASS | site loads over HTTPS
PASS | health: live AI mode
PASS | offline files served (service worker, guard, matcher)
PASS | playbook: 64 fact-checked cards                 | 64 cards, all sourced + checked
PASS | hear: voice -> Muse Spark Open transcript        | "My back tire just went flat, and I am about 4 miles from home."
PASS | sort: "my back tire just went flat" -> fix        | card: repair-flat-rear-tube
PASS | sort: "my e-bike cut out ..." -> ride             | card: ebike-cutout-roadside
PASS | sort: "a truck keeps slowing down ..." -> safe    | card: safety-driver-harassing
PASS | 911 guard: "a car hit me" never reaches the model
PASS | 911 guard: "my battery is smoking" never reaches the model
PASS | places: real, open now, near Apple Valley        | 7-Eleven, Central Market, Del Taco (all open 24 hours)
PASS | tell my people: message with map link
PASS | close call map + CSV readable (no write)
```

The test audio in `e2e/fixtures/` is a generic Windows text-to-speech voice, not the builder's.
