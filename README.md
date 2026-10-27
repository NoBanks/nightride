# NIGHTRIDE

A voice-first night dispatcher for people who are not in a car: cyclists, walkers, skaters.
When something goes wrong after dark (a flat, a snapped chain, a dead phone, an unsafe stretch
of road), you hold one button and say what happened. NIGHTRIDE sorts it and gives you one thing to do.

Built for the Meta Global AI Developer Hackathon (Indie track). Every line in this repo was
written during the hackathon building period, starting Oct 27 2026 12:00 AM ET. The commit history is the record.

## What it does

| Screen | What happens | Meta model (when wired) |
|---|---|---|
| Talk | Hold to talk, let go. | Muse Voice Transcribe |
| Dispatch | One card: FIX IT, RIDE, SAFE PLACE, or EMERGENCY. | Muse Spark |
| Fix it | Camera clip of the problem; the broken part glows amber and stays locked on while you follow the steps. | Muse Spark (video) + SAM 3.1 |
| Get me somewhere | Three places open now, one tap to directions. | Muse Spark + search grounding |
| Tell my people | A ready message with battery and a live map link, sent from your own phone. | none |
| Night riders nearby | Opt-in riders who can help. **Simulated in this build.** | none |

Safety rules that live in code, not in a prompt:
- Words like "hurt", "bleeding", "hit by" go straight to a full-screen **Call 911** button, whatever a model says.
- NIGHTRIDE gives no medical advice and never calls anyone by itself.

## Status

- Day 1: every screen works end to end with **canned answers** (the page shows a DEMO DATA badge).
  Real Meta Model API calls get switched on route by route next.

## Run it

```
npm install
copy .env.example .env
npm start
```

Open http://localhost:8787. Camera and mic need HTTPS on a phone; on the laptop, localhost is fine.

## Layout

- `server/index.js` API routes; holds the Meta key so the browser never sees it
- `server/dispatch.js` lane sorting and the emergency guard
- `server/canned.js` stand-in answers, same shape as the real routes
- `public/` the phone web app (plain HTML, CSS, JS)

## License

MIT
