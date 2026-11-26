# Island Hopper — a flight game

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/goperek48/flightgame-entry/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/goperek48/flightgame-entry/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

Fly a little red prop plane over a tropical archipelago. Thread the sky rings,
hop between island runways, or race a parcel to Far Atoll before the fuel — or
the clock — runs out. A chase camera follows the aircraft over procedural
islands, ocean and beaches, with a full HUD: altitude and speed tapes, a
compass, an artificial horizon, throttle and fuel gauges, and a steering
chevron that points at the next ring or runway.

- `main.ts` — the entrypoint. Copies `game/` and `screenshots/` to
  `$MAKEFUN_OUTPUT_DIR` (`/output` in the grader sandbox) and writes
  `dossier.json` with the vendored `vendor/makefun-game.ts` library.
- `game/` — the playable game as static files: `index.html` plus ES modules
  under `game/src/`. No build step, no network request, no library: the 3D
  view is a software renderer on one 2D canvas, and the sounds are synthesised
  live with WebAudio.
- `screenshots/` — real renders of the game running in desktop Chrome.

## How to play

Pick a sortie on the title screen — `1` Ring Run, `2` Island Hop, `3` Courier
Dash — then press `Enter` to fly.

- **Arrows / WASD:** pitch and bank. `Up` climbs, `Down` descends, `Left` /
  `Right` bank and turn.
- **Shift / Ctrl:** throttle up / down. **Space:** brake.
- **Mouse:** hold the pointer off-centre to steer gently.
- **P:** pause. **M:** sound on/off. **R:** restart the sortie.

## The rules of the sky

- Speed is life: below 30 knots the wing stalls, the nose drops and you sink.
- A landing only counts on a runway, gentle and lined up with the strip — hard
  arrivals and terrain are crashes, and a soft ditching in the lagoon is a
  ditching, not a landing.
- Landing refuels you. Rings are worth 250 points, landings 500, a finished
  mission 1000. The Courier Dash gives you 5 minutes and one tank of fuel.

## Run it locally

```sh
node serve.ts
# open http://localhost:8080 in desktop Chrome
```

Screenshots are staged from the game itself: `?shot=title|cover|approach|rings`
plays the real flight model forward under an autopilot and paints the frame.
