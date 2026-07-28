// Full-mission closed-loop test: takeoff -> low-level attack -> turn -> RTB -> carrier landing.
const { chromium } = require("playwright-core");
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1000, height: 600 } })).newPage();
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));

  await page.goto("http://localhost:8123/index.html");
  await sleep(500);
  for (const k of ["Enter", "Enter", "Enter"]) { await page.keyboard.press(k); await sleep(250); }

  const S = () => page.evaluate(() => {
    const w = window.__wof;
    return { x: w.plane.x, y: w.plane.y, a: w.plane.a, spd: w.plane.speed,
             onDeck: w.plane.onDeck, alive: w.plane.alive, hp: w.plane.hp,
             state: w.game.state, enemies: w.enemyCount(), score: w.game.score };
  });

  const held = new Set();
  const hold = async k => { if (!held.has(k)) { held.add(k); await page.keyboard.down(k); } };
  const release = async k => { if (held.has(k)) { held.delete(k); await page.keyboard.up(k); } };
  const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

  // steer toward a desired flight-path angle
  async function steer(st, aDes) {
    const da = wrap(aDes - st.a);
    if (da > 0.05)      { await hold("ArrowRight"); await release("ArrowLeft"); }
    else if (da < -0.05){ await hold("ArrowLeft");  await release("ArrowRight"); }
    else                { await release("ArrowLeft"); await release("ArrowRight"); }
  }

  const SEA = 600, DECK_Y = 558, CARRIER_X = 300, DECK_W = 620;
  let phase = "takeoff", t0 = Date.now(), lastLog = 0, shots = {};
  const shoot = async name => { if (!shots[name]) { shots[name] = 1; await page.screenshot({ path: `mshot-${name}.png` }); } };

  await hold("ArrowUp");
  let result = "TIMEOUT";

  while (Date.now() - t0 < 90000) {
    const st = await S();
    if (Date.now() - lastLog > 2000) {
      lastLog = Date.now();
      console.log(`[${phase}] x=${st.x | 0} alt=${(SEA - st.y) | 0} spd=${st.spd | 0} a=${st.a.toFixed(2)} hp=${st.hp} enemies=${st.enemies} state=${st.state}`);
    }
    if (!st.alive) { result = "DIED in phase " + phase; await shoot("death"); break; }
    if (st.state === "rearm") { result = "LANDED — rearm screen reached"; await shoot("rearm"); break; }

    switch (phase) {
      case "takeoff":
        if (st.onDeck && st.spd >= 152) await hold("ArrowLeft");
        if (!st.onDeck) { await release("ArrowLeft"); phase = "climb"; }
        break;
      case "climb": {
        await steer(st, st.y > SEA - 150 ? -0.28 : 0);
        if (st.y <= SEA - 140 && st.x > 1500) phase = "attack";
        break;
      }
      case "attack": {
        // hold altitude over terrain; guns always, bombs only over the island
        await hold(" ");
        if (st.x > 2700 && st.x < 4200) await hold("x"); else await release("x");
        const targetY = SEA - 240;
        await steer(st, Math.max(-0.35, Math.min(0.25, (st.y - targetY) * -0.004)));
        if (st.x > 4400) {
          await release(" "); await release("x");
          await shoot("strafe-done");
          phase = "turn";
        } else if (st.x > 3100) await shoot("strafe");
        break;
      }
      case "turn": {
        // climbing left turn until heading west
        await hold("ArrowLeft");
        if (Math.cos(st.a) < -0.9) { await release("ArrowLeft"); phase = "rtb"; }
        break;
      }
      case "rtb": {
        const targetY = st.x > 2200 ? SEA - 180 : SEA - 90;
        // flying left, y grows downward: too high (y < targetY) -> aim below PI (descend)
        const down = Math.max(-0.3, Math.min(0.3, (targetY - st.y) * 0.004));
        await steer(st, wrap(Math.PI - down));
        if (st.x < 1900) { phase = "approach"; await shoot("approach"); }
        break;
      }
      case "approach": {
        // manage speed: keep 170-215
        if (st.spd > 210) { await hold("ArrowDown"); await release("ArrowUp"); }
        else if (st.spd < 165) { await hold("ArrowUp"); await release("ArrowDown"); }
        else { await release("ArrowUp"); await release("ArrowDown"); }
        // glideslope to deck
        const overDeck = st.x > CARRIER_X && st.x < CARRIER_X + DECK_W;
        const targetY = overDeck ? DECK_Y + 20 : DECK_Y - 50;
        const down = Math.max(-0.28, Math.min(0.2, (targetY - st.y) * 0.004));
        await steer(st, wrap(Math.PI - down));
        if (st.onDeck) { await shoot("trapped"); phase = "rollout"; }
        if (st.x < 260) { result = "OVERSHOT CARRIER"; }
        break;
      }
      case "rollout":
        for (const k of [...held]) await release(k);
        break;
    }
    await sleep(70);
  }

  for (const k of [...held]) await release(k);
  const fin = await S();
  console.log("RESULT:", result);
  console.log(`final: score=${fin.score} enemies=${fin.enemies} state=${fin.state} hp=${fin.hp}`);
  console.log(errors.length ? "PAGE ERRORS:\n" + errors.join("\n") : "NO PAGE ERRORS");
  await browser.close();
  if (!result.startsWith("LANDED")) process.exit(1);
})().catch(e => { console.error("DRIVER FAILED:", e); process.exit(1); });
