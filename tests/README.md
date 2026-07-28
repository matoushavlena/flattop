# Tests

**harness.js** — headless smoke test. Stubs the DOM/canvas, loads the game from
`../index.html`, and drives it through menu → takeoff → combat → level clear →
torpedo run → dogfight → death/game-over, plus a 4000-frame random-input fuzz.
On top of that it unit-checks the v2 systems: loop-reversal + auto-roll, bolter,
wire trap, belly landing, tower collision, timed rearm, barracks spill, bunker
armor, AA crew silencing / re-manning / wreck rebuild, prone dodge, raid waves,
carrier torpedo hits + defensive flak, carrier-loss game over, difficulty
cycling, ranks, systems-damage warnings, rookie landing mercy, and the v3
additions (MG vs wooden buildings, roll-turn reversal, cable pay-out during a
trap, crash-barrier stop, deck-crew tow-back, elevator for replacements).
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

Frozen builds live in `../v1/` and `../v2/`, each with the tests that shipped
with it.

Not covered by these two: audio behavior. `scratchpad/audio-test.js`-style
instrumentation (hooking `GainNode.gain.setTargetAtTime`) was used to confirm
pause drives the engine gain target to 0 and resume restores it.
