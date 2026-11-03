# NIGHTRIDE judge quickstart (under 3 minutes)

## Fastest: the live site (no install, 30 seconds)

1. Open https://nightride.nohumannearby.com on a phone (or a desktop browser; a phone is the intended device).
2. Hold the big talk button and say: "My back tire just went flat." Allow the microphone if asked.
   You should see a FIX IT card, a spoken reply, and a verified playbook card with its sources.
3. On that FIX IT card, tap "Open the camera", point it at a bike wheel and tap "Show NIGHTRIDE the problem". Muse Spark Open names the part, SAM 3.1 outlines it in amber on a replay of your clip, and the steps go one at a time ("part 1 of 4", Next, Back, See all steps).
4. Or, on the FIX IT card, tap "What to do: Flat rear tire" to read the whole verified card: 21 steps in 4 parts, with its sources. (Back from a card returns to the home screen.)
5. Type or say "a car hit me" (to type: "Can't talk? Type instead" under the talk button). You should get a full-screen Call 911 button right away, with no model involved.
6. Optional: tap "Close call map" at the bottom to see reports. The CLOSE CALL button asks "Where did it happen?" first and saves nothing until you choose.

Tip: use Add to Home Screen, then turn on airplane mode. The app, the 911 guard and the playbook still work with no signal.

## Run it locally (about 2 minutes, Node 22 or newer)

```
git clone https://github.com/NoBanks/nightride.git
cd nightride
npm install
npm start
```

Open http://localhost:8787. With no API keys it runs in canned mode: same screens, answers come from built-in data
(http://localhost:8787/api/health says `"mode":"canned"`). Live Meta models need keys in `~/.nightride/.env`
(names in `.env.example`); those are not in the repo.

In canned mode, tap "Can't talk? Type instead" under the talk button (not the mic) and try:
- "my back tire went flat": FIX IT card with the verified steps and sources
- "my chain snapped": the chain card
- "a car hit me": Call 911 screen
- "the battery is smoking": "Move away from the battery. Call 911."

## Tests

```
npm test    # 27 unit tests, no network, about 1 second, all pass
```

`npm run test:live` and `npm run test:judge` target the live site and need Chrome (see README, Run it).
