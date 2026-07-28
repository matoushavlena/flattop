# FLATTOP

A WWII carrier-combat game that runs in the browser. Launch off the deck, work
over the islands, break up torpedo raids on your ship, and get back aboard —
gear down, slow, level, and hook a wire.

"Flattop" is what the sailors who served on them called an aircraft carrier,
and the ship really is the main character here: it moves, it can be sunk, and
if it goes down there is nowhere left to land.

No build step, no dependencies, no assets to load — each version is a single
self-contained HTML file. All graphics are drawn procedurally on a canvas and
all sound is synthesized at runtime with WebAudio.

## Play

**[matoushavlena.github.io/flattop](https://matoushavlena.github.io/flattop/)** — no install, runs in the browser.

| Version | Play | Source | What it is |
|---|---|---|---|
| **v3** (current) | [play](https://matoushavlena.github.io/flattop/) | `index.html` | Roll-turn reversal, arresting cables with a visible catch, crash barrier, deck-crew servicing + tow, MG vs buildings, damage pips, richer art |
| v2 | [play](https://matoushavlena.github.io/flattop/v2/) | `v2/index.html` | Realism pass: roll/loop flight model, gear, wire-zone landing, island ecosystem (repair crews!), carrier raids, difficulty + ranks |
| v1 | [play](https://matoushavlena.github.io/flattop/v1/) | `v1/index.html` | The original simple arcade take |

## Run locally

```sh
python3 -m http.server 8123     # from this directory
# v3: http://localhost:8123/   v2: /v2/   v1: /v1/
```

Any static server works (`npx serve`, `deno run -A jsr:@std/http/file-server`),
or just open an `index.html` directly — they are fully self-contained.

## Controls (v3)

- **↑ ↓** throttle **← →** pitch
- **Z** roll-turn (reverse heading, stays level) **G** landing gear
- **SPACE** machine guns **X / B** drop ordnance
- **P** pause **M** mute — **←/→ on the menu** picks difficulty

Bomb the barracks and strafe the survivors before they rebuild the guns you
knocked out; concrete bunkers only crack under rockets; ships need a torpedo,
dropped low, slow and level. When the raid klaxon sounds, get home and break it
up. Then land: snag one of the three white cables with your tailhook and watch
it pay out as it hauls you down. Miss all three and the crash barrier stops you
the hard way. Once you're stopped the deck crew services your aircraft and tows
it aft to launch again — only a replacement airframe rides up on the elevator.

Three difficulty levels (Rookie / Pilot / Ace) scale the landing windows, enemy
fire rate, and raid size. Your best score and rank persist in `localStorage`.

## Tests

```sh
node tests/harness.js           # headless, no dependencies
```

See `tests/README.md` for the full-mission browser test and what each suite
covers.

## License and provenance

The code is MIT licensed — see [LICENSE](LICENSE).

This is an original implementation, written from scratch. It contains no code,
artwork, audio, level data, or other assets from any other game — every sprite
is drawn procedurally on a canvas and every sound is synthesized at runtime.

It takes its inspiration from the genre of late-1980s carrier-combat games in
general: launching off a flight deck, strafing infantry, bombing installations,
torpedo runs against shipping, and the hard trip home to the wires. Game
mechanics are ideas rather than protected expression, and everything here was
built independently.

FLATTOP is not affiliated with, authorized by, sponsored by, or endorsed by any
game publisher or rights holder, and no such affiliation is implied. All
trademarks are the property of their respective owners.
