#!/usr/bin/env node
/* test/palm-shot.js - renders public/palm-tree.js in headless Chromium and writes PNGs.

   Turns "I measured the triangles" into "I looked at it". The page is built here (no
   server needed) and reuses the exact Three.js r128 build inlined in public/index.html,
   with the game's render settings: sRGB output, ACES filmic, PCF soft shadows, and a
   PMREM environment generated from a gradient sky (PBR materials look dead without one).

   Output: test/shots/palm-hero-views.png   (2x2 panels: side, crown from below, trunk, frond)
           test/shots/palm-lod-compare.png   (hero / mid / low side by side, same camera)

   Usage:  node test/palm-shot.js
   Needs:  playwright + chromium (npm i -D playwright && npx playwright install chromium)
*/
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'shots');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.log('palm-shot: playwright not installed, skipping the render pass.'); process.exit(0); }

const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const three = html.split('\n').find(l => l.startsWith('!function(t,e){"object"==typeof exports'));
if (!three) { console.error('palm-shot: could not find the inlined Three.js line'); process.exit(1); }
const palm = fs.readFileSync(path.join(ROOT, 'public', 'palm-tree.js'), 'utf8');

const PAGE = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
  'html,body{margin:0;background:#000;overflow:hidden}canvas{display:block}</style></head>' +
  '<body><canvas id="c" width="1280" height="720"></canvas></body></html>';

const SETUP = `
window.__ready = false;
function build(opts){
  const T = THREE;
  const W = 1280, H = 720;
  const cv = document.getElementById('c');
  const renderer = new T.WebGLRenderer({canvas: cv, antialias: true, preserveDrawingBuffer: true});
  renderer.setSize(W, H, false);
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;

  const scene = new T.Scene();

  /* gradient sky -> PMREM environment (PBR needs an env or it looks flat) */
  const skyGeo = new T.SphereGeometry(60, 32, 20);
  const skyCols = new Float32Array(skyGeo.attributes.position.count * 3);
  const top = new T.Color(0x3f7fd0), hor = new T.Color(0xcfe6f2), gnd = new T.Color(0xb8a07a);
  for (let i = 0; i < skyGeo.attributes.position.count; i++) {
    const y = skyGeo.attributes.position.getY(i) / 60, c = new T.Color();
    if (y >= 0) c.copy(hor).lerp(top, Math.pow(Math.min(1, y * 1.3), 0.7));
    else c.copy(hor).lerp(gnd, Math.min(1, -y * 2.2));
    skyCols[i * 3] = c.r; skyCols[i * 3 + 1] = c.g; skyCols[i * 3 + 2] = c.b;
  }
  skyGeo.setAttribute('color', new T.Float32BufferAttribute(skyCols, 3));
  const skyMat = new T.MeshBasicMaterial({side: T.BackSide, vertexColors: true, depthWrite: false});
  const sky = new T.Mesh(skyGeo, skyMat);
  scene.add(sky);
  const pmrem = new T.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(scene, 0.04).texture;

  /* sand */
  const sand = new T.Mesh(new T.PlaneGeometry(70, 70, 1, 1).rotateX(-Math.PI / 2),
    new T.MeshStandardMaterial({color: 0xd9c39a, roughness: 1}));
  sand.receiveShadow = true;
  scene.add(sand);

  /* sun + bounce */
  const sun = new T.DirectionalLight(0xfff0d8, 3.1);
  sun.position.set(14, 22, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -11; sc.right = 11; sc.top = 11; sc.bottom = -11; sc.near = 1; sc.far = 80;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(new T.HemisphereLight(0xbfe3f5, 0xc9b48a, 0.55));

  const palms = [];
  function addPalm(x, z, detail, scale, spin){
    const p = createPalm(T, {detail: detail});
    p.object.position.set(x, 0, z);
    p.object.rotation.y = spin || 0;
    if (scale && scale !== 1) p.object.scale.setScalar(scale);
    scene.add(p.object);
    palms.push(p);
    return p;
  }
  window.__palmTris = 0;
  const cam = new T.PerspectiveCamera(34, W / H, 0.1, 400);

  function shoot(list, cols){
    cols = cols || 2;
    const n = list.length, rows = Math.ceil(n / cols);
    const pw = Math.floor(W / cols), phh = Math.floor(H / rows);
    /* clear the whole canvas first: with a scissor rect active, clear() only
       touches that rect, so without this the previous sheet stays on screen */
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, W, H);
    renderer.setScissor(0, 0, W, H);
    renderer.clear(true, true, true);
    renderer.setScissorTest(true);
    for (let i = 0; i < n; i++) {
      const v = list[i];
      const cx = (i % cols) * pw, cy = (rows - 1 - Math.floor(i / cols)) * phh;
      renderer.setViewport(cx, cy, pw, phh);
      renderer.setScissor(cx, cy, pw, phh);
      renderer.clear(true, true, true);
      cam.aspect = pw / phh; cam.updateProjectionMatrix();
      cam.position.set(v.pos[0], v.pos[1], v.pos[2]);
      cam.lookAt(new T.Vector3(v.tgt[0], v.tgt[1], v.tgt[2]));
      renderer.render(scene, cam);
    }
    renderer.setScissorTest(false);
    return cv.toDataURL('image/png').replace(/^data:image\\/png;base64,/, '');
  }
  window.__shoot = shoot;
  window.__scene = scene; window.__renderer = renderer; window.__cam = cam;
  window.__palms = palms; window.__addPalm = addPalm;
  window.__ready = true;
}
window.build = build;
`;

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.setContent(PAGE);
  await page.addScriptTag({ content: three });
  await page.addScriptTag({ content: palm });
  await page.addScriptTag({ content: SETUP });

  fs.mkdirSync(OUT, { recursive: true });

  /* ---- sheet 1: hero palm, four views ---- */
  const r1 = await page.evaluate(() => {
    build();
    const p = window.__addPalm(0, 0, 'hero', 1, 0.4);
    const views = [
      { pos: [17, 8.5, 17], tgt: [1.6, 7.2, 0.3] },      /* three-quarter, whole palm */
      { pos: [3.2, 1.1, 3.2], tgt: [3.26, 10.6, 0.47] }, /* from below: crown starburst */
      { pos: [2.4, 2.0, 2.6], tgt: [1.35, 6.2, 0.25] },  /* trunk: scars + cracks */
      { pos: [6.2, 11.4, 2.2], tgt: [3.6, 11.6, 0.6] }   /* frond: leaflets + twist */
    ];
    const b64 = window.__shoot(views, 2);
    return { b64, tris: p.triangles, calls: window.__renderer.info.render.calls };
  });
  fs.writeFileSync(path.join(OUT, 'palm-hero-views.png'), Buffer.from(r1.b64, 'base64'));
  console.log('hero: ' + r1.tris.toLocaleString('en-US') + ' tris | draw calls ' + r1.calls);

  /* ---- sheet 2: hero vs mid vs low, identical camera ---- */
  const r2 = await page.evaluate(() => {
    const sc = window.__scene;
    for (const p of window.__palms) sc.remove(p.object);
    window.__palms.length = 0;
    window.__addPalm(-7.5, 0, 'hero', 1, 0.4);
    window.__addPalm(0, 0, 'mid', 1, 0.4);
    window.__addPalm(7.5, 0, 'low', 1, 0.4);
    const b64 = window.__shoot([{ pos: [0, 9.5, 30], tgt: [0, 6.8, 0] }], 1);
    return { b64, calls: window.__renderer.info.render.calls };
  });
  fs.writeFileSync(path.join(OUT, 'palm-lod-compare.png'), Buffer.from(r2.b64, 'base64'));
  console.log('lod compare: hero | mid | low   draw calls ' + r2.calls);

  await browser.close();
  if (errors.length) { console.log('page errors:'); errors.slice(0, 10).forEach(e => console.log('  ' + e)); }
  else console.log('no page errors');
  console.log('wrote ' + path.relative(ROOT, OUT));
})().catch(e => { console.error('palm-shot failed: ' + e.message); process.exit(1); });
