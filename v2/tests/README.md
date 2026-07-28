# Tests

**harness.js** — headless smoke test. Stubs the DOM/canvas, loads the game from
`../index.html`, and drives it through menu → takeoff → combat → level clear →
torpedo run → dogfight → death/game-over, plus a 4000-frame random-input fuzz.
On top of that it unit-checks the v2 systems: loop-reversal + auto-roll, bolter,
wire trap, belly landing, tower collision, timed rearm, barracks spill, bunker
armor, AA crew silencing / re-manning / wreck rebuild, prone dodge, raid waves,
carrier torpedo hits + defensive flak, carrier-loss game over, difficulty
cycling, ranks, systems-damage warnings, and rookie landing mercy.
No dependencies:

```sh
node tests/harness.js
```

**mission-test.js** — full-mission browser test. Launches headless Chrome via
`playwright-core` and flies a closed-loop autopilot sortie: takeoff → gear up →
bombing run → half-loop reversal (auto-roll) → return past the moving carrier →
reversal → steep final with flare into the wires → trap → rearm screen, with
go-around handling for bolters. Uses the `window.__wof` debug handle for
telemetry and saves `mshot-*.png` screenshots along the way.

```sh
npm install playwright-core        # once; or point NODE_PATH at an install
python3 -m http.server 8123 &      # from the project root
node tests/mission-test.js
```

The frozen v1 build lives in `../v1/` with its own copy of the original tests.
