/* Visual check: one real browser (Alice) races a scripted ws driver (Bob) who
   cruises ahead along the coast road. Saves screenshots of the rival car. */
'use strict';
const { chromium } = require('playwright');
const WebSocket = require('ws');

const BASE = 'http://localhost:3000';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // scripted driver Bob (host)
  const bob = { ws: new WebSocket('ws://localhost:3000'), inbox: [] };
  bob.ws.on('message', raw => bob.inbox.push(JSON.parse(raw)));
  const bobOpen = new Promise(r => bob.ws.on('open', r));
  await bobOpen;
  const send = o => bob.ws.send(JSON.stringify(o));
  const waitType = t => new Promise(r => {
    const iv = setInterval(() => {
      const i = bob.inbox.findIndex(m => m.type === t);
      if (i >= 0) { clearInterval(iv); r(bob.inbox.splice(i, 1)[0]); }
    }, 50);
  });
  send({ type: 'create', mode: 'dual', name: 'Bob', color: '#ff7a1f' });
  const created = await waitType('created');
  console.log('Bob created room', created.code);

  const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', e => console.log('PAGE ERROR:', e));
  await page.goto(BASE, { waitUntil: 'load', timeout: 240000 });
  await page.waitForFunction(() => window.net && window.net.ok === true, null, { timeout: 240000 });
  await page.fill('#mpName', 'Alice');
  await page.fill('#mpCode', created.code);
  await page.click('#mpJoin');
  await page.waitForFunction(() => document.querySelectorAll('#mpPlayers .pl:not(.open)').length === 2, null, { timeout: 60000 });
  console.log('Alice joined the lobby');

  send({ type: 'start' });
  await page.waitForFunction(() => window.net && window.net.cd === 0, null, { timeout: 120000 });
  console.log('race started, GO');

  // Bob cruises ahead along the coast road: start at Alice's grid heading
  const pose = await page.evaluate(() => gridPose(0));
  let t = 0;
  const iv = setInterval(() => {
    t += 0.1;
    const x = pose.x + Math.cos(pose.th) * (14 + 11 * t), z = pose.z - Math.sin(pose.th) * (14 + 11 * t);
    send({ type: 'sync', s: { x, y: pose.y, z, th: pose.th, pit: 0, rol: 0, vf: 11, pg: 0.02, fn: 0 } });
  }, 100);

  await sleep(9000);
  await page.screenshot({ path: '/home/user/Balicalsi/test/rival-chase.png' });
  console.log('saved test/rival-chase.png');
  const tag = await page.evaluate(() => window.rivals[0].name + ' visible=' + window.rivals[0].g.visible + ' buf=' + window.rivals[0].buf.length);
  console.log('rival state on Alice:', tag);
  const chip = await page.textContent('#rc');
  console.log('race chip:', chip);
  clearInterval(iv);
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('aborted:', e); process.exit(1); });
