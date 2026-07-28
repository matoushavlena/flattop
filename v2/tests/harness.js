// Headless smoke test: stub DOM/canvas, load the game, drive frames + inputs.
const fs = require("fs");

const listeners = {};
let rafCb = null;
let nowMs = 0;

const ctxStub = new Proxy({ _props: {} }, {
  get(t, prop) {
    if (prop === "measureText") return () => ({ width: 50 });
    if (prop === "createLinearGradient") return () => ({ addColorStop() {} });
    if (prop in t._props) return t._props[prop];
    return () => {};
  },
  set(t, prop, v) { t._props[prop] = v; return true; },
});

global.window = {
  addEventListener(type, fn) { listeners[type] = fn; },
};
global.document = {
  getElementById: () => ({ width: 960, height: 540, getContext: () => ctxStub }),
};
global.performance = { now: () => nowMs };
global.requestAnimationFrame = (cb) => { rafCb = cb; };

function keyDown(k) { listeners.keydown({ key: k, repeat: false, preventDefault() {} }); }
function keyUp(k)   { listeners.keyup({ key: k, preventDefault() {} }); }
function step(n = 1) {
  for (let i = 0; i < n; i++) {
    nowMs += 16.67;
    const cb = rafCb; rafCb = null;
    cb(nowMs);
    if (!rafCb) throw new Error("rAF chain broken");
  }
}

const html = fs.readFileSync(__dirname + "/../index.html", "utf8");
const src = html.split("<script>")[1].split("<\/script>")[0];

const driver = `
;(function driver() {
  const assert = (cond, msg) => { if (!cond) throw new Error("ASSERT: " + msg); };

  step(5);
  assert(game.state === "menu", "starts in menu");

  // difficulty selector cycles and ranks resolve
  keyDown("ArrowRight"); keyUp("ArrowRight"); step(1);
  assert(game.diff === "ace", "difficulty cycles right, got " + game.diff);
  keyDown("ArrowLeft"); keyUp("ArrowLeft"); step(1);
  assert(game.diff === "pilot", "difficulty cycles back, got " + game.diff);
  assert(rankFor(0) === "MIDSHIPMAN" && rankFor(40000) === "CAPTAIN", "rank table resolves");

  keyDown("Enter"); keyUp("Enter"); step(2);
  assert(game.state === "brief", "menu -> brief, got " + game.state);
  keyDown("Enter"); keyUp("Enter"); step(2);
  assert(game.state === "rearm", "brief -> rearm (loadout screen), got " + game.state);

  // timed rearm: Enter is ignored while the deck crew works
  assert(game.rearmT > 0, "rearm timer running");
  keyDown("Enter"); keyUp("Enter"); step(2);
  assert(game.state === "rearm", "Enter gated while servicing");
  step(240);                                  // ~4s: service completes
  assert(game.rearmT === 0, "rearm timer finished");
  keyDown("Enter"); keyUp("Enter"); step(2);
  assert(game.state === "fly", "rearm -> fly after service, got " + game.state);
  assert(plane.onDeck, "starts on deck");

  // takeoff roll
  keyDown("ArrowUp"); step(240);
  assert(plane.speed > TAKEOFF_SPD, "reached takeoff speed, spd=" + plane.speed.toFixed(0));
  keyDown("ArrowLeft"); step(30); keyUp("ArrowLeft");
  assert(!plane.onDeck, "lifted off");
  step(60);
  assert(plane.alive, "still alive after liftoff, y=" + plane.y.toFixed(0));

  // level off & fly toward the island, guns blazing, dropping bombs
  plane.a = -0.05;
  keyDown(" ");
  keyDown("x");
  let maxFrames = 3000, cleared = false;
  for (let i = 0; i < maxFrames; i++) {
    // crude autopilot: keep altitude band over the island
    if (plane.alive && !plane.onDeck) {
      if (plane.y > SEA - 180) plane.a = -0.25;
      else if (plane.y < SEA - 420) plane.a = 0.2;
      else plane.a = 0.05;
      if (plane.x > 4600) plane.a = Math.PI - 0.1; // turn back
      if (plane.x < 2600 && Math.cos(plane.a) < 0) plane.a = 0.05;
      plane.fuel = 100;
      plane.hp = 100;       // god mode for the fuzz
      if (plane.bombs === 0) plane.bombs = 8;
    }
    step(1);
    if (!plane.alive) { plane.alive = true; plane.onDeck = false; plane.x = 3000; plane.y = SEA - 300; plane.speed = 250; plane.hp = 100; }
    if (game.state === "levelclear") { cleared = true; break; }
  }
  keyUp(" "); keyUp("x"); keyUp("ArrowUp");
  console.log("after combat: state=" + game.state + " enemies=" + enemies.length + " score=" + game.score + " cleared=" + cleared);

  // --- v2 flight-model unit checks (direct state manipulation) ---
  const placeAirborne = (x, y, a, spd) => {
    game.state = "fly";
    // keep the level "alive" so the level-clear check can't pause the sim
    if (enemies.length === 0)
      enemies.push({ type: "bunker", x: WORLD_W - 200, y: groundY(WORLD_W - 200), hp: 8, dead: false });
    plane.alive = true; plane.onDeck = false; plane.justLanded = false; plane.rolloutHook = false;
    plane.x = x; plane.y = y; plane.a = a; plane.hemi = Math.cos(a) >= 0 ? 1 : -1;
    plane.speed = spd; plane.throttle = 0.7; plane.fuel = 100; plane.hp = 100;
    plane.inv = false; plane.rollT = 0; plane.autoRollT = 0; plane.gear = true; plane.airT = 5;
  };

  // 1) loop reversal leaves you inverted, auto-roll rights you
  placeAirborne(5000, SEA - 400, -0.1, 320);
  keyDown("ArrowLeft");
  let crossed = false;
  for (let i = 0; i < 120; i++) { step(1); if (Math.cos(plane.a) < 0) { crossed = true; break; } }
  keyUp("ArrowLeft");
  assert(crossed, "half-loop crossed the vertical");
  assert(plane.inv === true, "inverted after loop reversal");
  plane.a = -Math.PI + 0.05;   // level off heading west
  step(80);
  assert(plane.inv === false, "auto-roll righted the plane, inv=" + plane.inv + " rollT=" + plane.rollT.toFixed(2));

  // 2) bolter: touch down past the wires, roll off the bow, stay alive
  placeAirborne(carrier.x + 360, DECK_Y - 18, 0.085, 160);
  plane.throttle = 0.4;
  let touched = false, boltered = false;
  for (let i = 0; i < 300; i++) {
    step(1);
    if (plane.onDeck) touched = true;
    if (touched && !plane.onDeck && plane.alive) { boltered = true; break; }
    if (!plane.alive) break;
  }
  assert(touched, "bolter test touched down");
  assert(boltered, "rolled off the bow alive (bolter), alive=" + plane.alive + " onDeck=" + plane.onDeck);

  // 3) trap: touch down in the wires at proper speed -> rearm
  placeAirborne(carrier.x - 100, DECK_Y - 22, 0.12, 160);
  plane.throttle = 0.35;
  let trapped = false;
  for (let i = 0; i < 400; i++) {
    step(1);
    if (game.state === "rearm") { trapped = true; break; }
    if (!plane.alive) break;
  }
  assert(trapped, "wire-zone landing led to rearm, alive=" + plane.alive + " state=" + game.state + " x-off=" + Math.round(plane.x - carrier.x));
  game.rearmT = 0; keyDown("Enter"); keyUp("Enter"); step(2);
  assert(game.state === "fly", "post-trap rearm exits to fly");

  // 4) belly landing kills (gear up, fast enough that the assist stays quiet)
  placeAirborne(carrier.x - 200, DECK_Y - 30, 0.05, 230);
  plane.gear = false; plane.throttle = 0.9;
  for (let i = 0; i < 200 && plane.alive; i++) step(1);
  assert(!plane.alive, "belly landing crashed");
  step(160); // respawn

  // 5) island tower is solid in clean (gear-up) flight, forgiving in the pattern
  game.state = "fly";
  const tb = towerBox();
  placeAirborne(tb.x0 - 40, DECK_Y - 40, 0, 240);
  plane.gear = false;
  for (let i = 0; i < 60 && plane.alive; i++) step(1);
  assert(!plane.alive, "tower collision kills with gear up");
  step(160); // respawn
  console.log("v2 flight-model checks passed (auto-roll, bolter, trap, belly, tower)");

  // --- Phase B ecosystem checks (fresh level, plane parked far away) ---
  buildLevel(0);
  game.state = "fly";
  plane.alive = true; plane.onDeck = false; plane.justLanded = false; plane.rolloutHook = false;
  plane.x = 12000; plane.y = 200; plane.a = 0; plane.hemi = 1; plane.speed = 300;
  plane.throttle = 0.7; plane.fuel = 100; plane.hp = 100; plane.airT = 5; plane.gear = true;

  // 6) bombed barracks spill their garrison
  const barB = enemies.find(e => e.type === "barracks");
  assert(barB, "level 1 has a barracks");
  const soldiersBefore = enemies.filter(e => !e.dead && e.type === "soldier").length;
  damageEnemy(barB, 999, "bomb");
  const soldiersAfter = enemies.filter(e => !e.dead && e.type === "soldier").length;
  assert(soldiersAfter >= soldiersBefore + 4, "barracks spilled soldiers " + soldiersBefore + " -> " + soldiersAfter);

  // 7) bunkers are rocket-only
  const bunkB = enemies.find(e => e.type === "bunker");
  const bhp = bunkB.hp;
  damageEnemy(bunkB, 5, "bomb");
  assert(bunkB.hp === bhp - 1, "bomb blast only chips a bunker");
  damageEnemy(bunkB, 0, "bullet");
  assert(bunkB.hp === bhp - 1, "bullets do nothing to a bunker");
  damageEnemy(bunkB, 3, "rocket");
  assert(bunkB.hp === bhp - 4, "rockets bite a bunker");

  // 8) MG fire silences an AA crew; survivors re-man the gun
  const aaB = enemies.find(e => e.type === "aa");
  for (let i = 0; i < 6; i++) damageEnemy(aaB, 0, "bullet");
  assert(aaB.crew === 0 && aaB.hp > 0 && !aaB.wreck, "MG fire wiped the AA crew");
  step(60 * 16);   // soldiers walk over and re-man it
  assert(aaB.crew > 0, "soldiers re-manned the silenced gun, crew=" + aaB.crew);

  // 9) wrecked gun gets rebuilt by the repair crew
  damageEnemy(aaB, 999, "bomb");
  assert(aaB.wreck && !aaB.dead, "AA gun became a wreck (stays on the map)");
  step(60 * 26);
  assert(!aaB.wreck && aaB.hp > 0, "repair crew rebuilt the wrecked gun");

  // 10) near-miss tracers make soldiers dive prone
  const sB = enemies.find(e => !e.dead && e.type === "soldier");
  sB.dodgeCd = 0; sB.pose = "walk";
  pBullets.push({ x: sB.x + 40, y: sB.y - 45, vx: 0, vy: 0, life: 0.5 });
  step(1);
  assert(sB.pose === "prone", "soldier dove prone under fire, pose=" + sB.pose);
  console.log("Phase B ecosystem checks passed (barracks, bunker armor, crew, rebuild, prone)");

  // --- Phase C raid checks ---
  game.state = "fly";
  carrier.hp = 6;
  game.raidSize = 2;
  spawnRaidWave();
  const bombersC = enemies.filter(e => !e.dead && e.type === "bomber");
  assert(bombersC.length === 2, "raid wave spawned 2 bombers, got " + bombersC.length);
  damageEnemy(bombersC[1], 99, "test");   // keep the test single-threaded
  // 11) rush the survivor to the release point and watch the drop
  const bmb = bombersC[0];
  bmb.x = carrier.x + DECK_W / 2 + 700; bmb.y = SEA - 70; bmb.a = Math.PI;
  step(30);
  assert(bmb.dropped && eTorps.length >= 1, "bomber released its torpedo");
  // 12) the fish runs home; the carrier's own flak fires while it can
  const hp0 = carrier.hp;
  let friendlyFlakSeen = false;
  for (let i = 0; i < 60 * 14 && carrier.hp === hp0; i++) {
    friendlyFlakSeen = friendlyFlakSeen || flaks.some(f => f.friendly);
    step(1);
  }
  assert(carrier.hp === hp0 - 1, "torpedo hit the carrier, hp " + hp0 + " -> " + carrier.hp);
  assert(friendlyFlakSeen, "carrier defensive flak engaged the raid");
  // 13) losing the ship ends the campaign
  carrier.hp = 1;
  hitCarrier();
  assert(game.state === "gameover" && game.overReason.length > 0, "carrier loss ends the game with a reason");
  // restore for the rest of the suite
  game.state = "fly";
  game.overReason = "";
  carrier.hp = 6;
  eTorps = [];
  console.log("Phase C raid checks passed (wave, drop, hull hit, flak, sinking)");

  // --- Phase D checks ---
  // 14) battle damage degrades systems with warnings
  placeAirborne(6000, SEA - 300, 0, 250);
  plane.hp = 45; step(2);
  assert(plane.warnEngine, "engine damage warning fired");
  plane.hp = 30; step(2);
  assert(plane.warnLeak, "fuel leak warning fired");
  plane.hp = 15; step(2);
  assert(plane.warnCtl, "controls damage warning fired");

  // 15) rookie mercy: a gear-up arrival is survivable
  game.diff = "rookie";
  placeAirborne(carrier.x - 200, DECK_Y - 30, 0.05, 245);
  plane.gear = false; plane.throttle = 0.65;   // fast enough that gear assist stays quiet, slow enough not to cartwheel
  let bellySurvived = false;
  for (let i = 0; i < 300; i++) {
    step(1);
    if (plane.onDeck) { bellySurvived = true; break; }
    if (!plane.alive) break;
  }
  assert(bellySurvived && plane.alive, "rookie survives a gear-up arrival, alive=" + plane.alive);
  game.diff = "pilot";
  console.log("Phase D checks passed (difficulty, ranks, systems damage, rookie mercy)");

  // normalize back to flying state before the level-transition checks
  if (game.state === "rearm") { game.rearmT = 0; keyDown("Enter"); keyUp("Enter"); step(2); }
  cleared = game.state === "levelclear";

  // force-clear remaining enemies to test level transition
  if (!cleared) {
    for (const e of enemies) damageEnemy(e, 999);
    game.fightersToSpawn = 0;
    step(3);
    assert(game.state === "levelclear", "level clear after wiping enemies, state=" + game.state);
  }
  keyDown("Enter"); keyUp("Enter"); step(2);
  assert(game.state === "brief" && game.level === 1, "advanced to level 2");
  keyDown("Enter"); keyUp("Enter"); step(2);

  // jump to level 3 to exercise ships + torpedo + rearm
  startLevel(2); step(2);
  keyDown("Enter"); keyUp("Enter"); step(2); // brief -> (fly ->) rearm
  game.rearmT = 0;
  keyDown("Enter"); keyUp("Enter"); step(2); // rearm -> fly
  assert(game.state === "fly", "level 3 flying, got " + game.state);
  const ship = enemies.find(e => e.type === "ship");
  assert(ship, "level 3 has a ship");

  // rearm path
  enterRearm(); step(2);
  assert(game.state === "rearm", "rearm state");
  keyDown("3"); keyUp("3"); step(1);
  assert(plane.loadout === "torpedo" && plane.torps === 1, "torpedo loadout");
  game.rearmT = 0;
  keyDown("Enter"); keyUp("Enter"); step(1);
  assert(game.state === "fly", "back to fly");

  // torpedo run: place plane low, level, heading at ship
  plane.onDeck = false;
  plane.x = ship.x - 700; plane.y = SEA - 40; plane.a = 0; plane.speed = 200; plane.throttle = 0.8;
  plane.ordCd = 0;
  dropOrdnance();
  assert(torps.length === 1, "torpedo dropped");
  let shipHp0 = ship.hp;
  for (let i = 0; i < 600 && !ship.dead; i++) {
    plane.a = -0.1; plane.fuel = 100; plane.hp = 100;
    step(1);
    if (!plane.alive) break;
  }
  console.log("torpedo test: ship dead=" + ship.dead + " hp " + shipHp0 + "->" + ship.hp);
  assert(ship.dead || ship.hp < shipHp0, "torpedo damaged ship");

  // fighter spawn + dogfight fuzz
  game.fightersToSpawn = 2; game.fighterTimer = 0;
  plane.alive = true; plane.onDeck = false; plane.x = 5000; plane.y = SEA - 400; plane.speed = 280; plane.hp = 100;
  keyDown(" ");
  for (let i = 0; i < 900; i++) {
    plane.fuel = 100;
    if (plane.y > SEA - 150) plane.a = -0.3;
    if (plane.y < SEA - 600) plane.a = 0.3;
    step(1);
    if (!plane.alive) { plane.alive = true; plane.hp = 100; plane.y = SEA - 400; plane.onDeck = false; }
  }
  keyUp(" ");
  const fighters = enemies.filter(e => e.type === "fighter").length;
  console.log("dogfight fuzz done: fighters active=" + fighters + " eBullets=" + eBullets.length);

  // death -> respawn -> game over path
  game.lives = 0;
  killPlane("TEST");
  step(200);
  assert(game.state === "gameover" || plane.alive, "gameover reached, state=" + game.state);
  console.log("death path ok: state=" + game.state);

  keyDown("Enter"); keyUp("Enter"); step(2);
  assert(game.state === "menu", "back to menu");

  // random-input fuzz across a fresh run
  keyDown("Enter"); keyUp("Enter"); step(2);
  keyDown("Enter"); keyUp("Enter"); step(2);
  const KEYS = ["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," ","x","b","z","g","1","2","3","p","P","m","M","Enter"];
  let rng = 1234;
  const rnd = () => (rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 4000; i++) {
    if (rnd() < 0.15) { const k = KEYS[(rnd() * KEYS.length) | 0]; keyDown(k); }
    if (rnd() < 0.15) { const k = KEYS[(rnd() * KEYS.length) | 0]; keyUp(k); }
    step(1);
  }
  console.log("fuzz done: state=" + game.state + " level=" + game.level + " lives=" + game.lives + " particles=" + particles.length);

  console.log("ALL SMOKE TESTS PASSED");
})();
`;

try {
  eval(src + driver);
} catch (e) {
  console.error("SMOKE TEST FAILED:", e.stack || e);
  process.exit(1);
}
