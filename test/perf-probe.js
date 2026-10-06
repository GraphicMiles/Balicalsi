#!/usr/bin/env node
/* test/perf-probe.js - measures what the running game actually draws, per frame.

   The renderer lives in a closure, so instead of reaching for renderer.info this hooks
   the WebGL context before the page loads and counts the real draw calls and triangles
   every frame. That works regardless of Three.js version and also catches the extra
   passes (shadow map, environment probe) that renderer.info would fold away.

   Also optionally screenshots the running game so the same run gives numbers AND a look.

   Usage:  node test/perf-probe.js [--url http://localhost:3000/] [--frames 40]
                                  [--shot out.png] [--wait 9000]
   Needs:  playwright + chromium.
*/
'use strict';
const { chromium } = require('playwright');

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const URL = arg('url', 'http://localhost:3000/');
const FRAMES = parseInt(arg('frames', '40'), 10);
const SHOT = arg('shot', null);
const WAIT = parseInt(arg('wait', '9000'), 10);

/* injected before any page script: wrap rAF to get exact per-frame windows */
const HOOK = `
(() => {
  const d2 = window.WebGL2RenderingContext && WebGL2RenderingContext.prototype;
  const d1 = window.WebGLRenderingContext && WebGLRenderingContext.prototype;
  window.__tri = 0; window.__calls = 0; window.__windows = []; window.__hookErr = null;
  const wrap = (proto) => { if (!proto) return;
    for (const fn of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      const orig = proto[fn]; if (!orig) continue;
      proto[fn] = function (mode, countOrFirst, ...rest) {
        try {
          if (fn.startsWith('drawElements')) {
            window.__tri += (mode === 4 ? countOrFirst / 3 : 0);
          } else {
            const instances = (fn.endsWith('Instanced')) ? rest[rest.length - 1] : 1;
            window.__tri += (mode === 4 ? countOrFirst / 3 : 0) * instances;
          }
          window.__calls++;
        } catch (e) { window.__hookErr = String(e); }
        return orig.apply(this, arguments);
      };
    }
  };
  wrap(d2); wrap(d1);
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => {
    const tri = window.__tri, calls = window.__calls; window.__tri = 0; window.__calls = 0;
    cb(t);
    if (window.__windows.length < 100000) window.__windows.push({ tri, calls, t });
  });
})();
`;

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 220)); });
  await page.addInitScript(HOOK);
  await page.goto(URL, { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(WAIT);

  /* start the game: click the overlay / any free-drive control */
  const started = await page.evaluate(() => {
    const cand = [...document.querySelectorAll('button,div,span')]
      .filter(e => /free drive|start|drive|play/i.test((e.id || '') + ' ' + (e.textContent || '').slice(0, 30)))
      .filter(e => e.offsetParent !== null);
    if (cand.length) { cand[cand.length - 1].click(); return (cand[cand.length - 1].textContent || cand[cand.length - 1].id || '?').trim().slice(0, 30); }
    return null;
  });
  await page.waitForTimeout(3000);

  /* drive for a while so the car is on the road, then sample */
  for (const k of ['w', 'W', 'ArrowUp']) {
    await page.keyboard.down(k === 'W' ? 'w' : k === 'W' ? 'w' : k); break;
  }
  await page.waitForTimeout(6000);
  await page.keyboard.up('w');

  const stats = await page.evaluate((want) => {
    const w = window.__windows.slice(-want);
    const t = w.map(x => x.tri).sort((a, b) => a - b);
    const c = w.map(x => x.calls).sort((a, b) => a - b);
    const dts = [];
    for (let i = 1; i < w.length; i++) if (w[i].t - w[i - 1].t > 0) dts.push(w[i].t - w[i - 1].t);
    dts.sort((a, b) => a - b);
    const med = a => a.length ? a[Math.floor(a.length / 2)] : 0;
    const qs = document.getElementById('qs');
    return {
      frames: w.length,
      triMedian: Math.round(med(t)), triMin: Math.round(t[0] || 0), triMax: Math.round(t[t.length - 1] || 0),
      callsMedian: med(c), callsMax: c[c.length - 1] || 0,
      frameMsMedian: +med(dts).toFixed(1),
      quality: qs ? qs.textContent : null,
      speed: (document.getElementById('sv') || {}).textContent,
      hookErr: window.__hookErr
    };
  }, FRAMES);

  console.log('url        ' + URL);
  console.log('started    ' + started);
  console.log('quality    ' + stats.quality);
  console.log('frames     ' + stats.frames + '   frame time (median) ' + stats.frameMsMedian + ' ms  [software GL, not a perf verdict]');
  console.log('triangles  median ' + stats.triMedian.toLocaleString('en-US') +
    '   min ' + stats.triMin.toLocaleString('en-US') + '   max ' + stats.triMax.toLocaleString('en-US'));
  console.log('draw calls median ' + stats.callsMedian + '   max ' + stats.callsMax);
  if (stats.hookErr) console.log('hook error ' + stats.hookErr);
  console.log('errors     ' + (errs.length ? errs.slice(0, 5).join(' | ') : 'none'));
  if (SHOT) { await page.screenshot({ path: SHOT }); console.log('screenshot ' + SHOT); }
  await browser.close();
})().catch(e => { console.error('perf-probe failed: ' + e.message); process.exit(1); });
