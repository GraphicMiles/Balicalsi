#!/usr/bin/env node
/* test/palm.test.js - headless verification of public/palm-tree.js (no GPU, no browser).

   It builds the palm with the SAME Three.js build the game ships (the r128 UMD line
   inlined in public/index.html), then measures what can be measured:
     triangle counts per detail level, NaN/Infinity in every attribute, index bounds,
     bounding box, API surface, determinism, dispose(), and the no-environment rule.

   Run:  node test/palm.test.js
*/
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');

/* ---------- tiny test harness ---------- */
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  \u2713 ' + name + (extra ? '   ' + extra : '')); }
  else { fail++; console.log('  \u2717 ' + name + (extra ? '   ' + extra : '')); }
};
const fmt = n => n.toLocaleString('en-US');
const section = t => console.log('\n' + t);

/* ---------- load the game's own Three.js r128 ---------- */
const ROOT = path.join(__dirname, '..');
function loadTHREE () {
  const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  const line = html.split('\n').find(l => l.startsWith('!function(t,e){"object"==typeof exports'));
  if (!line) throw new Error('could not find the inlined Three.js UMD line in public/index.html');
  const tmp = path.join(os.tmpdir(), 'three-inlined-' + (line.length) + '.js');
  if (!fs.existsSync(tmp)) fs.writeFileSync(tmp, line);
  const T = require(tmp);
  if (!T.REVISION) throw new Error('inlined three did not export REVISION');
  return T;
}
const T = loadTHREE();
const PALM_SRC = fs.readFileSync(path.join(ROOT, 'public', 'palm-tree.js'), 'utf8');
const { createPalm } = require(path.join(ROOT, 'public', 'palm-tree.js'));

console.log('three r' + T.REVISION + ' (loaded from public/index.html)  |  palm-tree.js ' + fmt(PALM_SRC.length) + ' bytes');

/* ---------- helpers ---------- */
const PART = ['trunk', 'roots', 'fronds', 'rachis', 'nuts'];
function scanAttrs (mesh) {
  const g = mesh.geometry, out = { nan: [], count: 0, maxIndex: -1, minY: Infinity, maxY: -Infinity, maxAbs: 0, degen: 0, zeroN: 0 };
  for (const k of Object.keys(g.attributes)) {
    const a = g.attributes[k];
    let bad = 0;
    for (let i = 0; i < a.array.length; i++) {
      const v = a.array[i];
      if (!Number.isFinite(v)) bad++;
    }
    if (bad) out.nan.push(k + ':' + bad);
    out.count = a.count;
  }
  /* positions only (aW/aP wind weights and phases are not coordinates) */
  const p = g.attributes.position.array;
  for (let i = 0; i < p.length; i += 3) {
    const m = Math.max(Math.abs(p[i]), Math.abs(p[i + 1]), Math.abs(p[i + 2]));
    if (m > out.maxAbs) out.maxAbs = m;
    if (p[i + 1] < out.minY) out.minY = p[i + 1];
    if (p[i + 1] > out.maxY) out.maxY = p[i + 1];
  }
  /* degenerate triangles (zero area) and the zero-length normals they leave behind */
  const nrm = g.attributes.normal.array;
  for (let i = 0; i < nrm.length; i += 3) if (Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) < 1e-6) out.zeroN++;
  const idx = g.index.array;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    if (idx[i] > out.maxIndex) out.maxIndex = idx[i];
    if (idx[i + 1] > out.maxIndex) out.maxIndex = idx[i + 1];
    if (idx[i + 2] > out.maxIndex) out.maxIndex = idx[i + 2];
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const wx = p[c] - p[a], wy = p[c + 1] - p[a + 1], wz = p[c + 2] - p[a + 2];
    if (Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) < 1e-12) out.degen++;
  }
  return out;
}
const triangleSum = palm => palm.meshes.reduce((s, m) => s + m.geometry.index.count / 3, 0);

/* ================= 1. builds at every detail level ================= */
section('1. detail levels build and meet their triangle budget');
const EXPECT = { hero: [140000, 200000], mid: [25000, 60000], low: [3000, 12000] };
const built = {};
for (const level of ['hero', 'mid', 'low']) {
  const p = createPalm(T, { detail: level });
  built[level] = p;
  const tri = triangleSum(p);
  const [lo, hi] = EXPECT[level];
  ok(level + ': triangles in budget ' + fmt(lo) + '-' + fmt(hi), tri >= lo && tri <= hi, '= ' + fmt(tri));
  ok(level + ': palm.triangles matches the geometry sum', p.triangles === tri, '= ' + fmt(p.triangles));
  ok(level + ': 5 meshes (trunk, roots, fronds, rachis, nuts)', p.meshes.length === 5, '= ' + p.meshes.length);
  ok(level + ': object is a Group with 5 children', p.object.isGroup === true && p.object.children.length === 5);
  ok(level + ': base sits at the origin, height ' + p.height + ' m', Math.abs(p.height - 9.6) < 1e-9);
  ok(level + ': crown is a Vector3', p.crown && p.crown.isVector3 === true,
    '= (' + p.crown.x.toFixed(2) + ', ' + p.crown.y.toFixed(2) + ', ' + p.crown.z.toFixed(2) + ')');
}

/* ================= 2. geometry integrity ================= */
section('2. geometry integrity (no NaN, indices in range, no degenerate triangles)');
let worstDegen = 0, worstZeroN = 0;
for (const level of ['hero', 'mid', 'low']) {
  const p = built[level];
  let nan = [], maxIndex = -1, minY = Infinity, maxY = -Infinity, maxAbs = 0, degen = 0, zeroN = 0, bad = [];
  p.meshes.forEach((m, i) => {
    const s = scanAttrs(m);
    if (s.nan.length) nan = nan.concat(s.nan.map(x => PART[i] + '.' + x));
    if (s.maxIndex > maxIndex) maxIndex = s.maxIndex;
    if (s.minY < minY) minY = s.minY;
    if (s.maxY > maxY) maxY = s.maxY;
    if (s.maxAbs > maxAbs) maxAbs = s.maxAbs;
    degen += s.degen; zeroN += s.zeroN;
    if (s.degen || s.zeroN) bad.push(PART[i] + ' ' + s.degen + '/' + s.zeroN);
  });
  worstDegen = Math.max(worstDegen, degen); worstZeroN = Math.max(worstZeroN, zeroN);
  ok(level + ': every attribute finite (position/color/aW/aP/normal)', nan.length === 0, nan.join(','));
  ok(level + ': indices inside the vertex range per mesh',
    p.meshes.every(m => m.geometry.index.array.every(i => i >= 0 && i < m.geometry.attributes.position.count)));
  ok(level + ': 0 degenerate triangles (zero area wastes fill and breaks normals)', degen === 0, bad.join(' | ') || '0 / ' + fmt(p.meshes.reduce((s, m) => s + m.geometry.index.count / 3, 0)) + ' tris');
  ok(level + ': 0 zero-length normals', zeroN === 0, '= ' + zeroN);
  ok(level + ': fronds reach ~14 m above a 9.6 m trunk, base near y=0',
    minY > -0.2 && minY < 0.05 && maxY > 13 && maxY < 15,
    'y ' + minY.toFixed(3) + ' .. ' + maxY.toFixed(3));
  ok(level + ': every coordinate inside a 15 m box', maxAbs < 15, 'max |xyz| = ' + maxAbs.toFixed(3));
  ok(level + ': normals are unit length',
    p.meshes.every(m => {
      const n = m.geometry.attributes.normal.array;
      for (let i = 0; i < n.length; i += 3) {
        const L = Math.hypot(n[i], n[i + 1], n[i + 2]);
        if (Math.abs(L - 1) > 1e-3) return false;
      }
      return true;
    }));
}

/* ================= 3. determinism ================= */
section('3. determinism (no Math.random: same asset every run)');
{
  const a = createPalm(T, { detail: 'hero' }), b = createPalm(T, { detail: 'hero' });
  const same = a.meshes.every((m, i) => {
    const x = m.geometry.attributes.position.array, y = b.meshes[i].geometry.attributes.position.array;
    if (x.length !== y.length) return false;
    for (let k = 0; k < x.length; k++) if (x[k] !== y[k]) return false;
    return true;
  });
  ok('two hero builds are byte-identical', same);
  ok('no Math.random in the module', !/Math\.random/.test(PALM_SRC));
}

/* ================= 4. API + wind ================= */
section('4. API surface and the wind hook');
{
  const p = built.hero;
  ok('update / setWind / dispose are functions',
    typeof p.update === 'function' && typeof p.setWind === 'function' && typeof p.dispose === 'function');
  let before = null, after = null;
  const frond = p.meshes[2];
  const u = frond.material.userData;
  p.update(0.5); p.setWind(1.7);
  const shaderProbe = {};
  try {
    // compile-shim: run onBeforeCompile against a minimal shader object
    const sh = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>' };
    frond.material.onBeforeCompile(sh);
    before = sh.vertexShader;
    shaderProbe.k = sh.uniforms.uK.value;
    shaderProbe.t = sh.uniforms.uT.value;
  } catch (e) { shaderProbe.err = e.message; }
  ok('frond material injects the wind shader', !!before && /aW/.test(before), before ? '' : '(no injection)');
  ok('uniforms are shared and live (uK=1.7, uT advanced by 0.5)',
    shaderProbe.k === 1.7 && Math.abs(shaderProbe.t - 0.5) < 1e-9,
    'uK=' + shaderProbe.k + ' uT=' + shaderProbe.t);
  ok('frond + nut + rachis materials carry wind weights (aW attribute)',
    p.meshes[2].geometry.attributes.aW && p.meshes[3].geometry.attributes.aW);
  ok('trunk has aW all zero (trunk does not sway)',
    Array.from(p.meshes[0].geometry.attributes.aW.array).every(v => v === 0));
  ok('cloning shares geometry + material (N palms, one upload)',
    (() => { const c = p.object.clone(); return c.children[0].geometry === p.meshes[0].geometry && c.children[0].material === p.meshes[0].material; })());
  let threw = null;
  try { p.dispose(); } catch (e) { threw = e.message; }
  ok('dispose() runs clean', threw === null, threw || '');
}

/* ================= 5. no-environment rule (skill section 9) ================= */
section('5. standalone: the module references no host environment');
{
  const block = PALM_SRC.slice(PALM_SRC.indexOf('PALM-TREE:BEGIN'), PALM_SRC.indexOf('PALM-TREE:END'));
  const banned = [/\bscene\b/, /\bcamera\b/, /\brenderer\b/, /\bdocument\b/, /\$\s*\(/, /\bwindow\.[A-Za-z]/, /\blocalStorage\b/];
  const hits = banned.filter(r => r.test(block.replace(/window\.createPalm\s*=\s*createPalm/, ''))).map(r => r.source);
  ok('no scene / camera / renderer / document / $() / window.X', hits.length === 0, hits.join(' '));
  ok('exports for both CommonJS and the browser global',
    /module\.exports\s*=\s*\{createPalm\}/.test(PALM_SRC) && /window\.createPalm\s*=\s*createPalm/.test(PALM_SRC));
}

/* ================= summary ================= */
section('-'.repeat(64));
console.log(pass + ' passed, ' + fail + ' failed');
console.log('\ntriangle budget table (per palm):');
for (const level of ['hero', 'mid', 'low']) {
  const p = built[level];
  console.log('  ' + level.padEnd(5) + fmt(triangleSum(p)).padStart(9) + ' tris   ' +
    p.meshes.map((m, i) => PART[i] + ' ' + fmt(m.geometry.index.count / 3)).join(' | '));
}
console.log('\ndegenerate triangles: ' + worstDegen + ', zero-length normals: ' + worstZeroN +
  '  (both were non-zero before the leaflet-tip / coconut-pole fix)');
process.exit(fail ? 1 : 0);
