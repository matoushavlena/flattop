# Tests

**harness.js** — headless smoke test. Stubs the DOM/canvas, loads the game from
`../index.html`, and drives it through menu → takeoff → combat → level clear →
torpedo run → dogfight → death/game-over, plus a 4000-frame random-input fuzz.
No dependencies:

```sh
node tests/harness.js
```

**mission-test.js** — full-mission browser test. Serves the game, launches
headless Chrome via `playwright-core`, and flies a closed-loop autopilot sortie:
takeoff → bombing run over the island → 180° turn → return → carrier landing →
rearm screen. Uses the `window.__wof` debug handle for telemetry and saves
`mshot-*.png` screenshots along the way.

```sh
npm install playwright-core        # once, anywhere on NODE_PATH
python3 -m http.server 8123 &      # from the project root
node tests/mission-test.js
```
