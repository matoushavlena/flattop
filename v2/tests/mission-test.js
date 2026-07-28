// v2 full-mission closed-loop test:
// takeoff -> gear up -> attack -> half-loop reversal -> RTB past the (moving) carrier
// -> reversal -> wire-zone approach -> trap -> rearm. Handles bolters with a go-around.
const { chromium } = require("playwright-core");
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1000, height: 600 } })).newPage();
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));

  await page.goto("http://localhost:8123/index.html");
  await sleep(500);
  await page.keyboard.press("Enter"); await sleep(300);  // menu -> brief
  await page.keyboard.press("Enter"); await sleep(300);  // brief -> fly -> rearm
  // wait out the deck crew, then launch
  await page.waitForFunction(() => window.__wof.game.rearmT === 0, null, { timeout: 15000 });
  await page.keyboard.press("Enter"); await sleep(200);

  const S = () => page.evaluate(() => {
    const w = window.__wof;
    return { x: w.plane.x, y: w.plane.y, a: w.plane.a, spd: w.plane.speed,
             onDeck: w.plane.onDeck, alive: w.plane.alive, hp: w.plane.hp,
             gear: w.plane.gear, inv: w.plane.inv, cx: w.carrier.x,
             state: w.game.state, enemies: w.enemyCount(), score: w.game.score };
  });

  const held = new Set();
  const hold = async k => { if (!held.has(k)) { held.add(k); await page.keyboard.down(k); } };
  const release = async k => { if (held.has(k)) { held.delete(k); await page.keyboard.up(k); } };
  const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

  async function steer(st, aDes) {
    const da = wrap(aDes - st.a);
    if (da > 0.05)       { await hold("ArrowRight"); await release("ArrowLeft"); }
    else if (da < -0.05) { await hold("ArrowLeft");  await release("ArrowRight"); }
    else                 { await release("ArrowLeft"); await release("ArrowRight"); }
  }
  async function speedBand(st, lo, hi) {
    if (st.spd > hi)      { await hold("ArrowDown"); await release("ArrowUp"); }
    else if (st.spd < lo) { await hold("ArrowUp");   await release("ArrowDown"); }
    else                  { await release("ArrowUp"); await release("ArrowDown"); }
  }

  const SEA = 600, DECK_Y = 558, DECK_W = 620;
  let phase = "takeoff", t0 = Date.now(), lastLog = 0, shots = {}, goarounds = 0, noAttack = false;
  const shoot = async name => { if (!shots[name]) { shots[name] = 1; await page.screenshot({ path: `mshot-${name}.png` }); } };

  await hold("ArrowUp");
  let result = "TIMEOUT";

  while (Date.now() - t0 < 150000) {
    const st = await S();
    if (Date.now() - lastLog > 2000) {
      lastLog = Date.now();
      console.log(`[${phase}] x=${st.x | 0} alt=${(SEA - st.y) | 0} spd=${st.spd | 0} a=${st.a.toFixed(2)} gear=${st.gear} hp=${st.hp} enemies=${st.enemies} state=${st.state}`);
    }
    if (!st.alive) { result = "DIED in phase " + phase; await shoot("death"); break; }
    if (st.state === "rearm" && phase !== "takeoff") { result = "LANDED — trapped & rearming (go-arounds: " + goarounds + ")"; await shoot("rearm"); break; }
    if (st.state === "levelclear") {
      // wiped the island before we could test the landing — relaunch on the next level
      console.log("level cleared mid-mission; relaunching for the landing test");
      for (const k of [...held]) await release(k);
      noAttack = true;
      await page.keyboard.press("Enter"); await sleep(400);   // -> brief
      await page.keyboard.press("Enter"); await sleep(400);   // -> fly -> rearm
      await page.waitForFunction(() => window.__wof.game.rearmT === 0, null, { timeout: 20000 });
      await page.keyboard.press("Enter"); await sleep(200);   // -> fly
      await hold("ArrowUp");
      phase = "takeoff";
      continue;
    }

    switch (phase) {
      case "takeoff":
        if (st.onDeck && st.spd >= 152) await hold("ArrowLeft");
        if (!st.onDeck) { await release("ArrowLeft"); phase = "climb"; }
        break;

      case "climb":
        await steer(st, st.y > SEA - 200 ? -0.3 : -0.05);
        if (st.y <= SEA - 190) {
          if (st.gear) await page.keyboard.press("g");     // clean up
          phase = noAttack ? "turn-west" : "attack";
        }
        break;

      case "attack": {
        await hold(" ");
        if (st.x > 2700 && st.x < 3400) await hold("x"); else await release("x");
        const targetY = SEA - 240;
        await steer(st, Math.max(-0.35, Math.min(0.25, (st.y - targetY) * -0.004)));
        if (st.x > 3800) {
          await release(" "); await release("x");
          await shoot("strafe-done");
          phase = "turn-west";
        } else if (st.x > 2900) await shoot("strafe");
        break;
      }

      case "turn-west":   // climbing half-loop; auto-roll rights us
        await release("ArrowRight");
        await hold("ArrowLeft");
        if (Math.cos(st.a) < -0.9) { await release("ArrowLeft"); await shoot("rolled-out"); phase = "rtb"; }
        break;

      case "rtb": {
        await speedBand(st, 200, 280);
        const targetY = SEA - 160;
        const down = Math.max(-0.3, Math.min(0.3, (targetY - st.y) * 0.004));
        await steer(st, wrap(Math.PI - down));
        if (st.x < st.cx - 700 || st.x < 140) { phase = "turn-east"; }
        break;
      }

      case "turn-east":   // powered reversal back toward the boat
        await release("ArrowLeft");
        await hold("ArrowUp");
        await hold("ArrowRight");
        if (Math.cos(st.a) > 0.9) { await release("ArrowRight"); phase = "approach"; await shoot("approach"); }
        break;

      case "approach": {
        if (st.onDeck) {  // wheels down — hands off, let the wire/rollout play out
          for (const k of [...held]) await release(k);
          break;
        }
        // steep final onto the stern, flare for the last 250px; gear assist drops the wheels
        const aim = st.cx;
        const dist = aim - st.x;
        if (dist < -420) {   // past the wires without touching — go around
          goarounds++;
          if (goarounds > 3) { result = "TOO MANY GO-AROUNDS"; break; }
          phase = "goaround";
          break;
        }
        await speedBand(st, 140, 158);
        const targetY = DECK_Y - Math.max(6, Math.min(220, 0.16 * dist));
        const cap = dist <= 250 ? 0.15 : 0.3;
        const pitch = Math.max(-0.2, Math.min(cap, (targetY - st.y) * 0.008));
        await steer(st, pitch);
        break;
      }

      case "goaround":   // power first, attitude second
        await hold("ArrowUp");
        await steer(st, st.spd < 200 ? -0.08 : -0.35);
        if (st.y < SEA - 280) { phase = "rtb"; await shoot("goaround"); }
        break;
    }
    await sleep(40);
  }

  for (const k of [...held]) await release(k);
  const fin = await S();
  console.log("RESULT:", result);
  console.log(`final: score=${fin.score} enemies=${fin.enemies} state=${fin.state} hp=${fin.hp} gear=${fin.gear}`);
  console.log(errors.length ? "PAGE ERRORS:\n" + errors.join("\n") : "NO PAGE ERRORS");
  await browser.close();
  if (!result.startsWith("LANDED")) process.exit(1);
})().catch(e => { console.error("DRIVER FAILED:", e); process.exit(1); });
