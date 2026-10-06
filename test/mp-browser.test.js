/* Two real browsers race each other against the live server on :3000.
   Validates: client boots without errors, WS lobby flow, countdown, grid,
   rival rendering + interpolation feed, live position. Exit 0 = pass. */
'use strict';
const { chromium } = require('playwright');

const BASE = 'http://localhost:3000';
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok  ' : ' FAIL ') + msg); if (!cond) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const mk = name => {
    const ctx = browser.newContext({ viewport: { width: 480, height: 270 } });
    const page = ctx.then(c => c.newPage());
    const errors = [];
    const ready = (async () => {
      const p = await page;
      p.on('pageerror', e => errors.push(String(e)));
      p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await p.goto(BASE, { waitUntil: 'load', timeout: 240000 });
      await p.waitForFunction(() => window.net && window.net.ok === true, null, { timeout: 240000 });
    })();
    return { ready, page, errors, name };
  };

  console.log('booting two clients in parallel (procedural world gen + software WebGL)...');
  const A = mk('Alice'), B = mk('Bob');
  await Promise.all([A.ready, B.ready]);
  A.pg = await A.page; B.pg = await B.page;
  const P = c => c.pg;
  ok(A.errors.length === 0 && B.errors.length === 0, 'both pages boot with zero console errors');

  const TO = { timeout: 60000 };
  // lobby
  await P(A).fill('#mpName', 'Alice', TO);
  await P(B).fill('#mpName', 'Bob', TO);
  await P(A).click('#mpCreate', TO);
  await P(A).waitForSelector('#mpRoom:not([hidden])', TO);
  const code = (await P(A).textContent('#mpCodeShow')).trim();
  ok(/^[A-Z0-9]{4}$/.test(code), `host created room ${code}`);
  await P(B).fill('#mpCode', code, TO);
  await P(B).click('#mpJoin', TO);
  await P(A).waitForFunction(() => document.querySelectorAll('#mpPlayers .pl:not(.open)').length === 2, null, TO);
  await P(B).waitForFunction(() => document.querySelectorAll('#mpPlayers .pl:not(.open)').length === 2, null, TO);
  ok(true, 'both lobbies list 2 drivers');
  const hostTag = await P(A).textContent('#mpPlayers');
  ok(/HOST/.test(hostTag) && /Alice \(you\)/.test(hostTag), 'host lobby shows HOST tag + (you)');
  ok(await P(B).isDisabled('#mpStart'), 'guest start button disabled (waiting for host)');
  ok(!(await P(A).isDisabled('#mpStart')), 'host start button enabled');

  // start
  await P(A).click('#mpStart', TO);
  await Promise.all([
    P(A).waitForFunction(() => document.getElementById('ov').style.display === 'none', null, TO),
    P(B).waitForFunction(() => document.getElementById('ov').style.display === 'none', null, TO),
  ]);
  ok(true, 'overlay hidden on both after start');
  const rivalsA = await P(A).evaluate(() => window.rivals.length);
  const rivalsB = await P(B).evaluate(() => window.rivals.length);
  ok(rivalsA === 1 && rivalsB === 1, `each client spawned 1 rival car (${rivalsA}/${rivalsB})`);
  await Promise.all([
    P(A).waitForFunction(() => window.net && window.net.cd === 0, null, { timeout: 90000 }),
    P(B).waitForFunction(() => window.net && window.net.cd === 0, null, { timeout: 90000 }),
  ]);
  ok(true, 'countdown reached GO on both (server clock sync works)');
  const bPose = await P(B).evaluate(() => ({ x: car.x, z: car.z }));
  const aRival = await P(A).evaluate(() => ({ x: window.rivals[0].x, z: window.rivals[0].z }));
  const dSelf = Math.hypot(bPose.x - aRival.x, bPose.z - aRival.z);
  ok(dSelf < 40, `A's rendered rival matches B's true grid pose (~${dSelf.toFixed(1)} m apart)`);

  // drive: hold W on A for a few seconds. Under software WebGL the sim runs
  // ~6x slower than wall clock, so assert motion, not a speed target.
  await P(A).keyboard.down('w');
  await sleep(6000);
  await P(A).keyboard.up('w');
  const aSpeed = await P(A).evaluate(() => car.vf);
  ok(aSpeed > 0.3, `A's car accelerated under throttle (vf=${aSpeed.toFixed(2)})`);
  const bFeed = await P(B).evaluate(() => ({ buf: window.rivals[0].buf.length }));
  ok(bFeed.buf >= 3, `B is receiving A's state stream (${bFeed.buf} buffered snapshots)`);
  const bRivalSpeed = await P(B).evaluate(() => window.rivals[0].vf);
  ok(bRivalSpeed > 0.2, `B renders A's car moving (interpolated vf=${bRivalSpeed.toFixed(2)})`);

  // hud shows live position
  const chip = await P(A).textContent('#rc');
  ok(/P1\/2|P2\/2/.test(chip), `race chip shows live position ("${chip.trim().slice(0, 48)}")`);
  // frozen input check: B never throttled; car should be ~still (settled)
  const bStill = await P(B).evaluate(() => car.vf);
  ok(Math.abs(bStill) < 2, `B's car stays parked without input (vf=${bStill.toFixed(2)})`);

  // simulate B finishing via internals (full 3 laps would take minutes)
  await P(B).evaluate(() => { rc.k = 8; rc.lap = 3; rc.t = 221.5; rc.done = 1; rc.on = 0; mpFinal(); });
  await P(A).waitForFunction(() => window.net.race === false, null, { timeout: 90000 });
  await P(B).waitForFunction(() => window.net.race === false, null, { timeout: 90000 });
  ok(true, 'results arrived on both after a finish');
  const resA = await P(A).textContent('#resList');
  ok(/1\s*.*Bob/.test(resA.replace(/\n/g, ' ')), 'results rank 1 = Bob');
  const resTitleB = await P(B).textContent('#resTitle');
  ok(/P1|won/.test(resTitleB), `finisher sees their result ("${resTitleB}")`);
  ok(!(await P(B).isVisible('#resAgain')), 'non-host has no rematch button');
  ok(await P(A).isVisible('#resAgain'), 'host sees rematch button');

  // rematch -> lobby
  await P(A).click('#resAgain', TO);
  await Promise.all([
    P(A).waitForFunction(() => !document.getElementById('kard').hidden && document.getElementById('ov').style.display === 'flex', null, TO),
    P(B).waitForFunction(() => !document.getElementById('kard').hidden && document.getElementById('ov').style.display === 'flex', null, TO),
  ]);
  ok(true, 'rematch returns both to the lobby');
  const lobbyPlayers = await P(A).evaluate(() => document.querySelectorAll('#mpPlayers .pl:not(.open)').length);
  ok(lobbyPlayers === 2, 'lobby repopulated with both drivers');

  ok(A.errors.length === 0, `host page: zero console errors across whole session${A.errors.length ? ' — ' + A.errors[0] : ''}`);
  ok(B.errors.length === 0, `guest page: zero console errors across whole session${B.errors.length ? ' — ' + B.errors[0] : ''}`);

  await browser.close();
  console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('aborted:', e); process.exit(1); });
