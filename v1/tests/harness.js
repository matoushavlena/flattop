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

  keyDown("Enter"); keyUp("Enter"); step(2);
  assert(game.state === "brief", "menu -> brief, got " + game.state);
  keyDown("Enter"); keyUp("Enter"); step(2);
  assert(game.state === "rearm", "brief -> rearm (loadout screen), got " + game.state);
  keyDown("Enter"); keyUp("Enter"); step(2);
  assert(game.state === "fly", "rearm -> fly, got " + game.state);
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
  keyDown("Enter"); keyUp("Enter"); step(2); // rearm -> fly
  assert(game.state === "fly", "level 3 flying, got " + game.state);
  const ship = enemies.find(e => e.type === "ship");
  assert(ship, "level 3 has a ship");

  // rearm path
  enterRearm(); step(2);
  assert(game.state === "rearm", "rearm state");
  keyDown("3"); keyUp("3"); step(1);
  assert(plane.loadout === "torpedo" && plane.torps === 1, "torpedo loadout");
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
  const KEYS = ["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," ","x","b","1","2","3","p","P","m","M","Enter"];
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
