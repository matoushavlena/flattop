# FLATTOP — v2 plan ("realism pass")

> **Status: all four phases implemented and verified** (harness + closed-loop
> browser mission both green). v2 is the root `index.html`; v1 stays playable in
> `v1/`. Remaining ideas that did NOT make the cut: pixel-art sprite pass, palm
> trees / collapse animations, dogfight-AI energy management, dive whistle.

v1 is frozen in `v1/` (own copy + tests, verified passing). v2 will be built in the
root `index.html`, still a single self-contained file. Both stay runnable side by side:
`http://localhost:8123/` (v2) and `http://localhost:8123/v1/` (v1).

Design targets for the genre this is modelled on — the classic late-1980s
carrier-combat formula, which v1 only partly captured: infantry flee bombed
barracks and *repair installations if left alive*; armored bunkers need rockets;
torpedoes are ships-only and finicky to drop; reversing direction is a committed
rolling maneuver and pulling up too hard stalls; carrier landing is hard enough
to want a dedicated approach view; enemy torpedo bombers raid your own carrier
and a handful of hits sink it; rank progression scales enemy density.

---

## Step-by-step audit of v1 vs the genre reference

### 1. Flight model / turning — biggest gap
- **v1**: free 360° rotation (Luftrausers-style), sprite mirror-flips at 90°. Functional
  but arcade-floaty; reversing direction is a cheap instant pivot.
- **Original**: the Hellcat flies essentially horizontal; reversing is a committed,
  animated half-roll; pulling up hard stalls you.
- **v2**: heading (left/right) + pitch as primary state, with a **roll maneuver** to
  reverse: ~0.5 s animation (canvas Y-squash through the roll), speed cost, no guns
  while rolling. Full-stick loops remain possible (Immelmann to reverse with altitude
  gain). Stall becomes a real event: nose drops, controls mushy, recover by diving.
  Pitch authority already scales with speed in v1 — keep.

### 2. Takeoff — good enough
Deck run + rotate works and feels right. Minor v2 touches: slight tail-settle at
rotation, prop wash dust, and (if gear is added, see 3) gear retraction after liftoff.

### 3. Landing — works, but far too forgiving
- **v1 windows**: speed ≤ 235 (vs. takeoff at 150!), sink ≤ 95, pitch ±22°, wire
  catches anywhere on the 620 px deck, repair/rearm instant, island tower is decorative.
- **Original**: hard enough to need an approach-view inset; you could fly into the
  carrier's side.
- **v2**:
  - Tighter trap window: speed 130–180 (just above stall), sink ≤ 45, nose level-to-up.
  - **Wire zone** = aft ~55% of deck only. Touch down fast/late → **bolter**: you roll
    off the bow and must go around.
  - The carrier **island tower is solid** — a low sloppy approach can hit it.
  - The carrier **steams slowly forward** and the deck bobs — the target moves.
  - **Approach inset panel** (homage to the original's 3-D window): alignment, speed,
    sink rate, wire-zone marker; visible when gear is down / near the boat.
  - Optional (beyond the original, keep behind difficulty flag): landing gear key [G],
    belly landing = heavy damage.
  - **Repair & rearm take time on deck** (progress bar), not instant — risk while raids
    are inbound.

### 4. Weapons — right roster, wrong differentiation
- **Guns**: fine. Add tracers with slight drop, muzzle flash, hit sparks. (v1 damage
  routing per target type already exists.)
- **Bombs** (6, as original): keep lofting ballistics. Great vs. barracks/guns/soldiers,
  but **no longer damage bunkers** except direct hit chip damage.
- **Rockets**: become the anti-armor tool — the *only* practical bunker killer, also
  knock out ship gun mounts. This makes the loadout screen a real decision (it's
  cosmetic in v1 — bombs do everything).
- **Torpedo**: keep the low-slow-level drop constraint (faithful). Add wake trail, and
  ships slowly turn away to evade. No dud RNG — frustration without depth.

### 5. Enemies & AI — v1 is static set-dressing; the original is an ecosystem
- **Barracks** (new): buildings that *spill 4–6 soldiers* when bombed — some kneel and
  shoot, some sprint for bunkers.
- **Repair crews** (new, the killer feature): surviving soldiers walk to destroyed
  AA guns / installations and **rebuild them over ~20–30 s**. Strafing infantry stops
  being mop-up and becomes strategy. Kill the crew or re-lose the gun.
- **Soldiers dodge**: dive prone when tracers land near them (brief invulnerability
  window, then get up) — strafing needs aim, not spray.
- **AA guns**: manned — silenced when crew dies, until repaired.
- **Fighters**: real dogfight AI — pursuit curves, energy management, break-off and
  re-attack passes, and the original's dirty trick: *dragging you low over AA*.
- **Ships**: destroyer (flak screen) + battleship (torpedo-only kill, rocket-able gun
  turrets).

### 6. Carrier raids — the missing signature mechanic
Periodic waves of enemy **torpedo bombers** head for your carrier (radar warning +
klaxon). Carrier has 6 HP; its own AA is weak. You must break off and intercept.
**Carrier sunk = game over** — nowhere to land. This creates the original's constant
tension between pressing the attack and guarding home plate.

### 7. Damage model — single HP pool is flat
v2 rolls hits onto systems: **engine** (power loss, smoke tiers), **fuel leak**
(gauge visibly drains), **controls** (reduced pitch rate), **guns jammed**. Any of
these force the original's sortie rhythm: limp home, repair (takes time), go back out.

### 8. Progression
Ranks **Midshipman → Captain** (7), promotion every 3rd mission, enemy density scales
with rank. Persist rank + high score in `localStorage`. Keep the 5 handcrafted islands
as the mission backbone; density/raid frequency scale with rank.

### 9. Presentation (low-hanging, big payoff)
- Pixel-art sprite pass: recognizable Hellcat silhouette, palm trees, buildings with
  collapse animation, soldier run/kneel/prone/fall frames.
- Dive whistle, klaxon for carrier raids, richer explosion audio.
- Difficulty select: **Rookie** (v1-like forgiving landings) / **Pilot** / **Ace**
  (full v2 rules) — realism shouldn't cost playability for a first-time player.

### 10. Testing
- Extend `tests/harness.js`: roll-reversal state machine, bolter path, repair-crew
  resurrection of a gun, carrier-raid loss condition, timed rearm.
- Rewrite `tests/mission-test.js` autopilot for the new control scheme (roll to
  reverse, gear, wire-zone targeting) — it earns its keep; it caught 4 real bugs in v1.

---

## Build order

| Phase | Content | Why first |
|---|---|---|
| **A — core feel** | roll-reversal flight model, stall rework, tight landing + wire zone + bolter, moving/bobbing carrier, solid tower, timed rearm, approach inset | Everything else sits on top of how the plane feels |
| **B — combat depth** | barracks → soldier spawns, repair crews, prone-dodge, bunkers rocket-only, manned AA | Turns islands into an ecosystem |
| **C — signature** | carrier raids, carrier HP, interception, game-over-by-sinking | The original's defining tension |
| **D — progression & polish** | ranks + localStorage, sprites, sound pass, difficulty modes, dogfight AI upgrade | Retention & feel |

Each phase ends green on the extended harness + a full autopilot mission in headless
Chrome before the next begins.
