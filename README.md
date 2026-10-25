<p align="center"><img src="public/flowstate.svg" width="112" alt="Flowstate logo" /></p>

# FLOWSTATE — Live Football Match Overlay

_Read the game like a striker in flow._

A football analytics product for watching a match with a second screen or a floating window that explains what is actually happening. It shows the live score and clock, possession, shots, **xG**, a **flow meter** (momentum), the match log, formations, attack lanes, player rankings, and a plain-English **analyst** ("Manchester City are dominating possession in midfield", "Momentum is shifting toward Arsenal").

New: **Scan my screen**. Watching on YouTube or any other site? Share that tab or window and a vision model (**Claude** or **Gemini**) reads the match from the broadcast every 10 seconds: teams, score, clock, kit colours, stat graphics, and who is attacking. The overlay turns that into live stats.

It ships as:

- a **full dashboard** with three views: **Match** (stats, flow meter, analyst, match log), **Metavision** (head-to-head radar, formations, attack lanes) and **Rankings** (player "weapons" and ego rankings),
- a **compact overlay**: a small card with score, possession, xG, the latest event and the lead insight. It runs in a pop-out window or a frameless, transparent, **always-on-top Electron window** above your stream, and it is where screen scanning lives.

The look is an anime-inspired "Ego Mode": electric blue on black, speed lines, cut-corner panels, a VS-screen header and a full-screen **GOAL** slash whenever someone scores.

No key is needed to try it. **Demo mode** runs a seeded live-match simulator, clearly labelled `DEMO MODE`.

## Quick start

Requirements: Node 20+ and npm.

```bash
git clone https://github.com/Mithilbatra/FLOWSTATE.git
cd FLOWSTATE
npm install
npm run dev
```

Open <http://localhost:5173>. The first-run screen lets you pick *Demo match* (default) or *Live fixtures*.

Always-on-top overlay (downloads Electron on first run, ~100 MB, not part of `npm install`):

```bash
npm run dev:overlay      # backend + web + Electron overlay together
# or, with `npm run dev` already running:
npm run overlay
```

Production-style, single process on one port:

```bash
npm run build
npm start                # serves the built UI + API + WebSocket on http://127.0.0.1:3737
OVERLAY_URL="http://127.0.0.1:3737/?compact=1" npm run overlay   # overlay against the production build
```

Other scripts: `npm test`, `npm run typecheck`.

## Scan my screen (Claude or Gemini vision)

1. Pick a reader in `.env`, then restart `npm run dev`. The model name decides which provider is called:
   - **Claude:** `SCREEN_MODEL=claude-opus-5-5` (the default) or `claude-haiku-5-5`, plus `ANTHROPIC_API_KEY=...` (or run `ant auth login`). Needs API credits.
   - **Gemini:** `SCREEN_MODEL=gemini-3.8-flash` plus `GEMINI_API_KEY=...` from <https://aistudio.google.com/apikey>. Works on the free tier.
2. Open the overlay: **Scan my screen** in the dashboard opens a pop-out, or use `npm run overlay` for the always-on-top window.
3. In the overlay, press **Scan my screen** and choose the tab or window with the match.
   - In a browser, the browser's own picker opens.
   - In Electron on macOS 15+, the macOS picker opens. The first time, macOS asks to allow Screen Recording for Electron. On older systems the whole primary screen is shared.
4. The overlay and dashboard switch to the `SCREEN SCAN` source within one or two frames. Press **Stop scanning**, or stop sharing, to go back.

How it works:

- The browser grabs a frame every 10 s, scales it to 1280 px wide and sends it as a JPEG to the local backend. **Unchanged frames are skipped**, so a paused video costs nothing.
- The backend sends it to the model with a strict JSON schema. It asks only for what is visible: scoreboard text, the clock, team colour swatches, any on-screen stat graphic, who has the ball, how dangerous the play is, and whether it is a replay.
  - Claude: structured outputs, effort `low`, server-side refusal fallback.
  - Gemini: the same schema as JSON Schema (`responseJsonSchema`).
  - Both readers check the answer against the same zod schema before using it.
- `backend/screen.ts` accumulates the reads:
  - **Score, clock and goals** come from the scoreboard. A goal is recorded when the score goes up, so each goal counts exactly once, and a VAR-cancelled goal is removed when the score goes back down. A score change or a clock jump only counts once two frames in a row agree, so one misread digit can't fake a goal. Goals scored before you started scanning are shown in the score but get no events.
  - **Possession** is the share of frames where each team had the ball. **Pressure and chances** come from frames in the final third, and drive the flow meter.
  - **Cards, subs, corners and offsides** come from on-screen graphics. Each one counts once, even if the graphic stays up for several frames.
  - **Broadcast stat graphics** (possession, shots, corners, xG, …) replace the estimates whenever they are shown.
  - **Replays, adverts and studio shots** are ignored for sampling.
  - A completely different pair of teams on screen starts a new match.
- What a broadcast can't show, such as pass accuracy, pressing, passing lanes, attack lanes and players, is displayed as **"—"**, never as a made-up number. Everything else is marked **Estimated stats**.
- The analyst's first card is the model's one-line read of the current frame. The other cards come from the same rule engine as the other modes.

**Privacy:** frames of whatever you share are sent to the provider's API (Anthropic or Google). Share only the match tab or window, not your whole screen. On Gemini's **free tier**, Google may use what you send to improve its products, and human reviewers may read it. The paid tier doesn't.

**Cost (rough):**
- **Claude:** with the default `claude-opus-5-5`, one frame is roughly $0.015–0.02, so about $10 for a full 95-minute match at one frame per 10 s (less if you pause). `claude-haiku-5-5` is roughly $0.30 per match, at some cost to reading tiny scoreboard text.
- **Gemini:** the free tier costs nothing but caps requests per minute and per day. A full match is about 570 frames, so check your limits in [AI Studio](https://aistudio.google.com/rate-limit). When the cap is hit, those frames fail and scanning catches up once it resets.

## Environment variables

Copy `.env.example` to `.env` (the backend loads it automatically).

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3737` | Backend port. The Vite dev server proxies `/api` and `/stream` to it. If you change it, also export `PORT` for `npm run dev`. |
| `DATA_MODE` | `demo` | `demo` = simulator, `live` = football-data.org with automatic fallback to demo. Also switchable from the in-app settings screen. |
| `FOOTBALL_DATA_API_KEY` | _(empty)_ | Free token from <https://www.football-data.org/client/register>. |
| `FOOTBALL_DATA_MATCH_ID` | _(empty)_ | Pin a specific match id. Otherwise the first in-play match is used. |
| `SCREEN_MODEL` | `claude-opus-5-5` | Model that reads screen frames. A `claude-*` name uses Claude; a `gemini-*` name (e.g. `gemini-3.8-flash`) uses Gemini. |
| `ANTHROPIC_API_KEY` | _(empty)_ | For Claude screen scanning. An `ant auth login` profile also works. |
| `GEMINI_API_KEY` | _(empty)_ | For Gemini screen scanning. Free from <https://aistudio.google.com/apikey>. |
| `SIM_SPEED` | `1` | Simulator speed. `1` = one match minute every 2 seconds (a full match in ~3.5 min). |
| `SIM_SEED` | `42` | Seed. The same seed always plays out the same match. |
| `SIM_START_MINUTE` | `24` | The demo is fast-forwarded to this minute at startup so charts are populated immediately. |

## Demo mode

- Default whenever there is no key, `DATA_MODE=demo`, or the live API fails.
- A persistent **Demo mode** badge is shown in the header and the overlay. When demo data is shown *because* a live attempt failed, a banner says why (bad key, rate limit, no live matches, network down). While a screen scan hasn't recognised a match yet, the banner says so too.
- The simulated match (Manchester City v Arsenal) is deterministic per `SIM_SEED`. After full time it holds for ~16 s, then restarts with the next seed, so the demo never dead-ends.

## Architecture

```
   your screen (tab/window)       football-data.org            seeded simulator
   getDisplayMedia → JPEG/10s     (free tier JSON)             (API-Football-shaped feed)
            │                            │                              │
   POST /api/screen/frame        providers/footballData.ts       providers/simulator.ts
   vision.ts (Claude|Gemini, schema)     └───────────┬──────────────────┘
   screen.ts (reads → match)                         ▼
            │                                normalize.ts       raw payload → app schema (src/types/match.ts)
            └──────────────────┬─────────────────────┘
                               ▼
        momentum.ts  +  insights.ts          enrichment: flow meter series, rule-based analyst
                               ▼
                           hub.ts            source priority: screen > live > demo; retry, cache, fallback
                       ┌───────┴────────┐
              REST  /api/match      WebSocket /stream     (server.ts, Express + ws)
                                          ▼
                                 useMatchStream()  ws → auto-reconnect → 5 s polling fallback
                                          ▼
              React views: Match · Metavision · Rankings · CompactOverlay (+ GoalBurst)
                                          ▼
                       electron/main.cjs  (frameless, transparent, always-on-top, screen picker)
```

Key decisions:

- **One schema, three sources.** Providers return raw payloads, and only the normalizer and the screen tracker know their shapes. The simulator deliberately emits an API-Football-style payload, so the normalizer is exercised in demo mode too.
- **Vision reads, code decides.** Claude only reports what is in one frame, as schema-checked JSON. Goals, dedupe, replays and possession are plain, tested TypeScript, so a misread frame can't invent a goal twice.
- **Momentum is derived, not fetched.** `MomentumTracker` turns successive snapshots into per-minute attacking threat: deltas in xG, shots, dangerous attacks and corners, smoothed with an EMA. A side whose threat stays high for three minutes "enters flow".
- **Graceful degradation.** `fetchJson` retries 5xx/429/network errors with backoff and a timeout, but fails fast on 4xx. Live failures fall back to demo with a notice, and live is retried 15 s after the last attempt *ends*, so slow timeouts can't freeze the fallback. A scan that stops recognising a match lapses back after 60 s. One failing update is logged and never stops the feed.
- **Cost control.** Only one frame is analysed at a time (extra frames get `429`), unchanged frames are skipped, and frames are downscaled. A missing or rejected Claude key stops scanning with a clear message instead of retrying forever.
- **Security.** The server binds to `127.0.0.1`. API keys stay on the server (the browser never sees the Claude key), and the football-data key entered in the UI is held in memory only. Request bodies are size-limited and validated.

## What is real, what is estimated

- **football-data.org free tier** provides fixtures, scores and (on some competitions or plans) goals, bookings and substitutions. It has no possession, shots, xG, formations or player stats. Possession, shots and xG are **derived estimates** from the score, badged **Estimated stats**. Fouls, corners, offsides, pass accuracy, pressing and attack lanes would only be guesses from the minute, so they show as "—".
- **Screen scan**: the score, clock and teams are what the broadcast shows. Possession and pressure are sampled from frames. xG is roughly 0.12 per detected chance unless the broadcast shows real xG. Unmeasurable stats show "—".
- **Demo**: the simulator produces plausible values for everything, including tracking-style stats (pressing, passing lanes), so the full product can be demonstrated.
- **The analyst** is a deterministic rule engine (`backend/insights.ts`). It works offline, is testable and never invents facts. In screen mode, Claude adds one caption card describing the current frame.

## Project layout

```
backend/        Express + ws server, hub, providers, normalizer, momentum, insights
  providers/    footballData.ts (live), simulator.ts (demo)
  vision.ts     Claude / Gemini vision call + the shared JSON schema for one frame
  screen.ts     Turns per-frame reads into a match (goals, possession, events)
data/fixtures/  Sample football-data.org payload used by tests
electron/       Always-on-top overlay shell + screen-share handler
scripts/        dev.mjs (runs backend + Vite [+ Electron])
src/            React app
  components/   Panels, charts (Recharts), GoalBurst
  hooks/        useMatchStream (WebSocket + polling), useScreenAnalysis (capture), useSettings
  services/     REST client
  types/        Shared schema (used by backend too)
  utils/        Formatting and player ranking helpers
  views/        Match (Overview), Metavision (Tactical), Rankings (Players)
tests/          Vitest: normalizers, simulator, momentum, insights, retry/cache, hub, screen tracker, UI
```

## Tests

```bash
npm test
```

Covers:

- the football-data and simulator normalizers;
- simulator determinism and invariants over a full match, and momentum tracking;
- each insight rule, with regressions for momentum direction and red cards;
- HTTP retry and the cache;
- the hub: live mode staying live between polls, the demo fallback moving while the API is down, the screen source, and one frame at a time;
- the screen tracker: clock parsing, goals from score changes, VAR removal, replays, possession sampling, stat graphics winning, card dedupe, match change;
- rendering of the header, stats, timeline, insights, compact overlay and GOAL burst.

The Gemini reader is tested against a mocked SDK: request shape, schema validation, and key errors. The Claude call itself is not exercised by tests; the hub tests inject a fake reader.

## Known limits

- State is **in memory in one process**: no database and no history across restarts.
- Screen scanning reads one frame per 10 s, so very quick events (a card shown for 3 s) can be missed. The rest follows from the scoreboard.
- The live football-data path has run against the real API once (a Série A match), plus a recorded fixture in tests. Screen scanning has read one synthetic frame through Gemini, plus fake readers in tests, but has not been run against a real broadcast.
- Electron is run via `npx electron`, with no installer or packaging. Without the macOS 15 system picker, Electron shares the whole primary screen.
- `.npmrc` sets `legacy-peer-deps=true` to avoid an npm peer-resolution crash with the current Vite/Vitest versions. The peers that matter (`react-is`, `@testing-library/dom`) are installed explicitly.
- The display fonts load from Google Fonts. Offline, it falls back to system fonts.

## Why this stands out as a portfolio project

- **A real product loop, not a demo page**: data in (an API, a simulator, or *your own screen*) → normalized → enriched → streamed → three UI surfaces, including a native always-on-top overlay.
- **Practical AI, not a chatbot**: a vision model is used as a sensor with a strict schema. Deterministic code owns the match state, and a fake reader stands in for the model in tests. Cost and privacy are designed in.
- **Honest engineering around bad data**: estimated flags, "—" for what can't be measured, fallbacks, retry/backoff, cache and visible notices, instead of fake numbers.
- **Clear boundaries**: provider adapters, a normalizer, enrichment, a hub and a thin UI. A new provider or model is one file.
- **Tested and runnable in one command**, with a README that states what is real, what is estimated and what is not done.
