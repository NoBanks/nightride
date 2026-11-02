# NIGHTRIDE judge quickstart (under 3 minutes)

## Fastest: the live site (no install, 30 seconds)

1. Open https://nightride.nohumannearby.com on a phone (or a desktop browser; a phone is the intended device).
2. Hold the big talk button and say: "My back tire just went flat." Allow the microphone if asked.
   You should see a FIX IT card, a spoken reply, and a verified playbook card with its sources.
3. Tap Next through the steps. A long repair reads as parts ("part 1 of 4"). Back and "See all steps" are always available.
4. Type or say "a car hit me". You should get a full-screen Call 911 button right away, with no model involved.
5. Optional: from a fix card, open the camera and point it at a bike wheel to see the part outlined in amber.
6. Optional: tap Close call to see the night map of reports (nothing is saved until you choose).

Tip: use Add to Home Screen, then turn on airplane mode. The app, the 911 guard and the playbook still work with no signal.

## Run it locally (about 2 minutes, Node 22 or newer)

```
git clone https://github.com/nobanks/nightride.git
cd nightride
npm install
npm start
```

Open http://localhost:8787. With no API keys it runs in canned mode: same screens, answers come from built-in data
(http://localhost:8787/api/health says `"mode":"canned"`). Live Meta models need keys in `~/.nightride/.env`
(names in `.env.example`); those are not in the repo.

In canned mode, use the text box under the talk button (not the mic) and try:
- "my back tire went flat": FIX IT card with the verified steps and sources
- "my chain snapped": the chain card
- "a car hit me": Call 911 screen
- "the battery is smoking": "Move away from the battery. Call 911."

## Tests

```
npm test    # 27 unit tests, no network, about 1 second, all pass
```

`npm run test:live` and `npm run test:judge` target the live site and need Chrome (see README, Run it).
