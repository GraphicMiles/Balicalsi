/* In-game palm field verification (skill §8: replace sight with measurement).
   One real browser against the live server. Asserts: zero console errors
   (catches GLSL failures in the wind shader), field composition unchanged
   (~3600 palms), per-variant geometry sane (no NaN, expected tri counts),
   per-cell culling actually culls, quality cycling rescales the field, and
   saves a screenshot for pixel analysis. Exit 0 = pass. */
'use strict';
const { chromium } = require('playwright');

const BASE = 'http://localhost:3000';
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok  ' : ' FAIL ') + msg); if (!cond) fails++; };

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  console.log('booting (world gen + 2 palm variants + scatter)...');
  await page.goto(BASE, { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => window.net && window.net.ok === true, null, { timeout: 300000 });
  await page.waitForTimeout(3000);
  ok(errs.length === 0, `page boots with zero console errors${errs.length ? ' — ' + errs[0] : ''}`);

  /* --- field composition + geometry sanity --- */
  const field = await page.evaluate(() => {
    const wood = PALMS.filter(m => m.userData.part === 'wood');
    const total = wood.reduce((a, m) => a + m.userData.total, 0);
    const counts = wood.reduce((a, m) => a + m.count, 0);
    const spheres = PALMS.map(m => m.geometry.boundingSphere);
    const sphereOk = spheres.every(s => s && isFinite(s.center.x + s.center.y + s.center.z) && s.radius > 20 && s.radius < 2000);
    const variants = [palmVar[0], palmVar[1]].map(v => ({
      wood: v.wood.index.count / 3, leaf: v.leaf.index.count / 3,
      nanPos: !v.wood.attributes.position.array.some(isNaN) && !v.leaf.attributes.position.array.some(isNaN),
      nanCol: !v.wood.attributes.color.array.some(isNaN) && !v.leaf.attributes.color.array.some(isNaN),
      wind: v.leaf.attributes.aW.array.some(x => x > .5) && !v.leaf.attributes.aW.array.some(isNaN) && !v.leaf.attributes.aP.array.some(isNaN),
      minY: Math.min(...v.wood.attributes.position.array.filter((_, i) => i % 3 === 1)),
      maxY: Math.max(...v.wood.attributes.position.array.filter((_, i) => i % 3 === 1)),
      leafVerts: v.leaf.attributes.position.count, woodVerts: v.wood.attributes.position.count
    }));
    return { cells: PALMS.length, total, counts, sphereOk, variants, allCastShadow: PALMS.every(m => m.castShadow) };
  });
  ok(field.cells >= 24 && field.cells <= 90, `palm field split into ${field.cells} cell meshes (2 per cell)`);
  ok(Math.abs(field.total - 3600) < 90, `placement unchanged: ${field.total} palms scattered (was 3600)`);
  ok(field.counts === field.total, 'all cell instances active at AUTO/high');
  ok(field.sphereOk, 'every cell has a sane hand-set bounding sphere');
  ok(field.allCastShadow, 'palms cast shadows at high tier');
  for (let v = 0; v < 2; v++) {
    const q = field.variants[v], tris = q.wood + q.leaf;
    ok(tris > 3200 && tris < 7000, `variant ${v}: ${Math.round(tris)} tris/tree (wood ${Math.round(q.wood)} + leaflets ${Math.round(q.leaf)})`);
    ok(q.nanPos && q.nanCol, `variant ${v}: no NaN in positions/colours`);
    ok(q.wind, `variant ${v}: wind weights+phases present and finite`);
    ok(q.minY < 0.3 && q.maxY > 10.5, `variant ${v}: spans ground to crown (${q.minY.toFixed(2)}..${q.maxY.toFixed(2)} m)`);
  }

  /* --- culling: measure the palm draw contribution directly (toggle
     visibility and diff the counters). r128 defaults InstancedMesh to
     frustumCulled=false — the cells must opt back in for their hand-set
     spheres to matter. --- */
  const cull = await page.evaluate(() => {
    R.shadowMap.autoUpdate = false;
    const measure = () => {
      PALMS.forEach(m => m.visible = false); R.render(S, cam);
      const base = { c: R.info.render.calls, t: R.info.render.triangles };
      PALMS.forEach(m => m.visible = true); R.render(S, cam);
      return { calls: R.info.render.calls - base.c, tris: R.info.render.triangles - base.t, base: base.c };
    };
    cam.position.set(-2700, 90, -2700); cam.lookAt(-6000, 0, -6000);
    const sea = measure();
    cam.position.set(1483, 14, 459); cam.lookAt(0, 60, 0);
    const island = measure();
    R.shadowMap.autoUpdate = true;
    return { sea, island };
  });
  ok(cull.sea.calls <= 2, `looking at open sea: ${cull.sea.calls} palm cell draws (was 60 before the culling fix)`);
  ok(cull.sea.base < 14, `sea scene sans palms stays lean: ${cull.sea.base} draws`);
  ok(cull.island.calls > 20, `looking inland: ${cull.island.calls} palm cell draws, ${(cull.island.tris / 1e6).toFixed(1)}M palm tris`);
  ok(cull.island.tris > 8e6, `palm field carries real geometry in view (${(cull.island.tris / 1e6).toFixed(1)}M tris)`);

  /* --- quality cycling: veg scaling + shadow toggle --- */
  const quality = await page.evaluate(() => {
    const wood = () => PALMS.filter(m => m.userData.part === 'wood');
    cycleQuality(); cycleQuality(); cycleQuality();          // AUTO -> HIGH -> MED -> LOW
    const low = { total: wood().reduce((a, m) => a + m.count, 0), shadow: PALMS.every(m => !m.castShadow) };
    cycleQuality();                                          // LOW -> AUTO
    const auto = { total: wood().reduce((a, m) => a + m.count, 0), shadow: PALMS.every(m => m.castShadow) };
    return { low, auto };
  });
  ok(Math.abs(quality.low.total - field.total * .5) < 90, `LOW tier halves the field (${quality.low.total} palms, veg .5)`);
  ok(quality.low.shadow === true, 'LOW tier disables palm shadows');
  ok(quality.auto.total === field.total && quality.auto.shadow, 'AUTO tier restores full field + shadows');

  /* --- wind: SWAY advances and the sway patch is live in the material --- */
  const wind = await page.evaluate(() => ({ t: SWAY.t.value, patched: palmLeafM.onBeforeCompile === palmSway && palmDepthM.onBeforeCompile === palmSway }));
  ok(wind.t > 0 && wind.patched, `wind clock running (t=${wind.t.toFixed(1)}), sway patch on render + depth materials`);

  ok(errs.length === 0, `no console errors across the whole session${errs.length ? ' — ' + errs[0] : ''}`);

  /* --- visual evidence: render two views (crown closeup + whole tree) and
     classify pixels straight off the framebuffer. A broken wind/vertex shader
     would show as black or empty; a lost crown as missing greens. --- */
  const views = await page.evaluate(() => {
    const gl = R.getContext();
    const classify = () => {
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let green = 0, wood = 0, sky = 0, dark = 0, n = 0;
      for (let i = 0; i < px.length; i += 4 * 3) {
        const R = px[i], G = px[i + 1], B = px[i + 2]; n++;
        const mx = Math.max(R, G, B), mn = Math.min(R, G, B), v = mx / 255, s = mx ? (mx - mn) / mx : 0;
        let hu = 0; if (mx !== mn) { const dr = (mx - R) / (mx - mn), dg = (mx - G) / (mx - mn), db = (mx - B) / (mx - mn);
          hu = mx === R ? 60 * (db - dg) : mx === G ? 60 * (2 + dr - db) : 60 * (4 + dg - dr); if (hu < 0) hu += 360; }
        if (v < .12) dark++;
        else if (hu > 65 && hu < 175 && s > .18) green++;
        else if (hu >= 175 && hu < 260 && v > .4) sky++;
        else if (hu >= 10 && hu < 65 && s > .10 && v > .2 && v < .85) wood++;
      }
      return { green: +(green / n * 100).toFixed(1), wood: +(wood / n * 100).toFixed(1), sky: +(sky / n * 100).toFixed(1), dark: +(dark / n * 100).toFixed(1) };
    };
    // pick the palm nearest the race start
    let best = null, bd = 1e18;
    for (const m of PALMS) {
      const a = m.instanceMatrix.array;
      for (let i = 0; i < m.count; i++) {
        const x = a[i * 16 + 12], y = a[i * 16 + 13], z = a[i * 16 + 14];
        const d = (x - 1483) ** 2 + (z - 459) ** 2;
        if (d < bd) { bd = d; best = { x, y, z }; }
      }
    }
    camU = () => {};                       // freeze the chase camera
    window.__palmBest = best;
    const out = { best };
    cam.position.set(best.x + 13, best.y + 7.5, best.z + 15); cam.lookAt(best.x, best.y + 6.5, best.z);
    R.render(S, cam); out.closeup = classify();
    cam.position.set(best.x + 20, best.y + 2.2, best.z + 24); cam.lookAt(best.x, best.y + 5.5, best.z);
    R.render(S, cam); out.whole = classify();
    // restore the framing to the closeup for the saved screenshot
    cam.position.set(best.x + 13, best.y + 7.5, best.z + 15); cam.lookAt(best.x, best.y + 6.5, best.z);
    return out;
  });
  ok(views.closeup.green > 25, `crown closeup: ${views.closeup.green}% crown green pixels`);
  ok(views.closeup.dark < 2, `crown closeup: ${views.closeup.dark}% near-black (no dead shader)`);
  ok(views.whole.green > 8 && views.whole.wood >= 1.5, `whole tree: ${views.whole.green}% green + ${views.whole.wood}% trunk/wood visible`);
  ok(views.closeup.sky > 5 && views.whole.sky > 5, `background reads through: sky ${views.closeup.sky}% / ${views.whole.sky}%`);

  /* --- screenshots for human eyes (chase camera stays frozen) --- */
  await page.setViewportSize({ width: 960, height: 540 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'test/palm-closeup.png', timeout: 180000 });
  await page.evaluate(() => { const b = window.__palmBest; if (b) { cam.position.set(b.x + 20, b.y + 2.2, b.z + 24); cam.lookAt(b.x, b.y + 5.5, b.z); } });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'test/palm-whole.png', timeout: 180000 });
  console.log('saved test/palm-closeup.png + test/palm-whole.png');

  await browser.close();
  console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('aborted:', e); process.exit(1); });
