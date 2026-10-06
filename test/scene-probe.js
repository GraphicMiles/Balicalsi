#!/usr/bin/env node
/* test/scene-probe.js - inspects the running game's scene and per-pass GPU load.

   The game keeps its renderer, scene and vegetation in closure scope, so nothing is
   reachable from the console. This fetches public/index.html, injects a small probe
   between the inlined Three.js and the game script, and serves it straight to the
   browser. The probe wraps the Scene / InstancedMesh / WebGLRenderer constructors,
   so afterwards every one of them can be listed and measured.

   Reported:
     - every InstancedMesh: base triangles, live count, capacity, shadow flags
     - every plain Mesh: triangles, and the total scene triangle cost
     - per-render-pass stats (the environment probe renders 6 extra faces per capture,
       so the main pass is reported separately from the pass count)
     - optional screenshot of the running game

   Usage: node test/scene-probe.js [--shot out.png] [--wait 12000] [--json out.json]
   Needs: playwright + chromium.
*/
'use strict';
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const SHOT = arg('shot', null), JSONOUT = arg('json', null);
const WAIT = parseInt(arg('wait', '12000'), 10);
const ROOT = path.join(__dirname, '..');

const PROBE = `
(() => {
  const T = window.THREE; if (!T) { window.__probeErr = 'no THREE'; return; }
  window.__inst = []; window.__scenes = []; window.__renderers = []; window.__passes = []; window.__shots = [];
  const S = T.Scene;
  T.Scene = function () { const s = new S(...arguments); window.__scenes.push(s); return s; };
  T.Scene.prototype = S.prototype;
  const I = T.InstancedMesh;
  T.InstancedMesh = function () { const m = new I(...arguments); window.__inst.push(m); return m; };
  T.InstancedMesh.prototype = I.prototype;
  const W = T.WebGLRenderer;
  T.WebGLRenderer = function () {
    const r = new W(...arguments); window.__renderers.push(r);
    /* the shadow map is rendered inside render(), so split its cost out of the pass total */
    if (r.shadowMap) {
      const sm = r.shadowMap, origShadow = sm.render.bind(sm);
      sm.render = function () {
        const t0 = r.info.render.triangles, c0 = r.info.render.calls;
        const out = origShadow.apply(sm, arguments);
        window.__shadow = { tri: r.info.render.triangles - t0, calls: r.info.render.calls - c0 };
        return out;
      };
    }
    const orig = r.render;
    r.render = function (sc, cam) {
      window.__scene = sc; window.__cam = cam;
      const out = orig.apply(r, arguments);
      window.__passes.push({ tri: r.info.render.triangles, calls: r.info.render.calls, cube: !!(cam && cam.parent && cam.parent.isCubeCamera) });
      window.__info = window.__passes[window.__passes.length - 1];
      return out;
    };
    return r;
  };
  T.WebGLRenderer.prototype = W.prototype;
})();
`;

const boot = async () => {
  const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  /* inject the probe just before the game script (the last <script> before </body>) */
  const at = html.lastIndexOf('<script>');
  if (at < 0) throw new Error('could not find the game script tag');
  return html.slice(0, at) + '<script>' + PROBE + '</script>' + html.slice(at);
};

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
  await page.setContent(await boot(), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(WAIT);
  await page.evaluate(() => {
    const c = [...document.querySelectorAll('button,div,span')]
      .filter(e => /free drive/i.test(e.textContent || '')).filter(e => e.offsetParent);
    if (c[0]) c[0].click();
  });
  await page.waitForTimeout(6000);
  await page.keyboard.down('w'); await page.waitForTimeout(6000); await page.keyboard.up('w');
  await page.waitForTimeout(1500);

  const dump = await page.evaluate(() => {
    const s = window.__scene;
    const tri = g => g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    const meshes = [], inst = [];
    if (s) s.traverse(o => {
      if (o.isInstancedMesh) inst.push({ geo: Math.round(tri(o.geometry)), count: o.count, cap: o.instanceMatrix.count, cast: o.castShadow, cull: o.frustumCulled, visible: o.visible });
      else if (o.isMesh) meshes.push({ tri: Math.round(tri(o.geometry)), cast: o.castShadow, visible: o.visible, name: o.name || '' });
    });
    const sceneTris = meshes.reduce((a, m) => a + m.tri, 0) + inst.reduce((a, m) => a + m.geo * Math.max(1, m.count), 0);
    const passes = window.__passes.slice(-40);
    const main = passes.filter(p => !p.cube);
    const med = a => a.length ? a.sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0;
    const qs = document.getElementById('qs');
    return {
      instanced: inst.sort((a, b) => b.geo * b.count - a.geo * a.count).slice(0, 14),
      instCount: inst.length, meshCount: meshes.length,
      bigMeshes: meshes.sort((a, b) => b.tri - a.tri).slice(0, 8),
      sceneTris: Math.round(sceneTris),
      passCountLast40: passes.length,
      cubePasses: passes.filter(p => p.cube).length,
      mainPassTris: med(main.map(p => p.tri)), mainPassCalls: med(main.map(p => p.calls)),
      shadow: window.__shadow || null,
      quality: qs ? qs.textContent : null,
      speed: (document.getElementById('sv') || {}).textContent,
      cam: window.__cam ? { far: window.__cam.far, x: Math.round(window.__cam.position.x), y: Math.round(window.__cam.position.y), z: Math.round(window.__cam.position.z) } : null,
      err: window.__probeErr || null
    };
  });

  console.log('quality      ' + dump.quality + '   speed ' + dump.speed + ' km/h   cam ' + JSON.stringify(dump.cam));
  console.log('scene        ' + dump.sceneTris.toLocaleString('en-US') + ' triangles across ' +
    dump.instCount + ' instanced meshes + ' + dump.meshCount + ' meshes');
  console.log('main pass    ' + dump.mainPassTris.toLocaleString('en-US') + ' triangles, ' + dump.mainPassCalls +
    ' draw calls (median of last ' + (dump.passCountLast40 - dump.cubePasses) + ' frames)');
  console.log('render calls per window of 40: ' + dump.passCountLast40 + ' (' + dump.cubePasses + ' are cube/env faces)');
  console.log('shadow pass  ' + (dump.shadow ? dump.shadow.tri.toLocaleString('en-US') + ' triangles, ' + dump.shadow.calls + ' draw calls (inside the main pass above)' : 'not captured'));
  console.log('\ninstanced meshes (top by cost):');
  dump.instanced.forEach(m => console.log('  ' + String(m.geo).padStart(7) + ' tris x ' + String(m.count).padStart(5) + '/' + String(m.cap).padStart(5) +
    '  = ' + String(Math.round(m.geo * m.count)).padStart(9) + '   castShadow=' + m.cast + ' frustumCulled=' + m.cull + ' visible=' + m.visible));
  console.log('\nbiggest plain meshes:');
  dump.bigMeshes.forEach(m => console.log('  ' + String(m.tri).padStart(8) + ' tris  castShadow=' + m.cast + ' ' + m.name));
  if (dump.err) console.log('\nprobe error: ' + dump.err);
  console.log('\nerrors ' + (errs.length ? errs.slice(0, 4).join(' | ') : 'none'));
  if (SHOT) { await page.screenshot({ path: SHOT }); console.log('screenshot ' + SHOT); }
  if (JSONOUT) { fs.writeFileSync(JSONOUT, JSON.stringify(dump, null, 2)); console.log('json ' + JSONOUT); }
  await browser.close();
})().catch(e => { console.error('scene-probe failed: ' + e.message); process.exit(1); });
