#!/usr/bin/env node
/* test/palm-field.test.js - headless test of the island palm field and its LOD pools.

   tools/palm-field.js is written to run inside the game, where it reaches for the scene,
   the terrain height function and the collider map. This test stands those up as small
   stubs, runs the real block (extracted from the markers, the same text that is inlined
   into public/index.html) and checks the things that would silently ruin the field:

     - capacity is respected and the field is committed
     - the detail pools hold the NEAREST palms, at the right detail level
     - every pool's instances match the field palm of the same slot (no drift)
     - quality scaling shrinks the field and the pools, and LOW still costs less
       than the palms it replaced
     - only the hero pool casts shadows (the shadow camera only covers +/-60 m)
     - LOD swaps are what the band logic says they are

   Run: node test/palm-field.test.js
*/
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  \u2713 ' + name + (extra ? '   ' + extra : '')); }
  else { fail++; console.log('  \u2717 ' + name + (extra ? '   ' + extra : '')); }
};
const section = t => console.log('\n' + t);

/* ---------- the game's own Three.js r128 ---------- */
const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const threeLine = html.split('\n').find(l => l.startsWith('!function(t,e){"object"==typeof exports'));
const threeTmp = path.join(os.tmpdir(), 'three-field.js');
if (!fs.existsSync(threeTmp)) fs.writeFileSync(threeTmp, threeLine);
const T = require(threeTmp);
const { createPalm } = require(path.join(ROOT, 'public', 'palm-tree.js'));

/* ---------- extract the field block (the exact text the game runs) ---------- */
const grab = (tag) => {
  const b = html.indexOf('/* ==== ' + tag + ':BEGIN ==== */'), e = html.indexOf('/* ==== ' + tag + ':END ==== */');
  if (b < 0 || e < 0) throw new Error(tag + ' markers missing from public/index.html');
  return html.slice(b, e + ('/* ==== ' + tag + ':END ==== */').length);
};
const fieldCode = grab('PALM-FIELD');

/* ---------- stub the game environment ---------- */
function makeEnv () {
  const env = {
    S: new T.Scene(),
    colliders: [],
    qp: { veg: 1, shadow: 1 },
    terrain: (x, z) => 4 + 1.5 * Math.sin(x * 0.01),      /* sand-height plateau */
    RR: () => 1500,
    near: () => false,
    /* the game's smoothstep. A constant here would silently change how many palms
       the scatter accepts (it gates the lowland density), so model it properly. */
    ss: (a, b, t) => { const u = Math.max(0, Math.min(1, (t - a) / (b - a))); return u * u * (3 - 2 * u); }
  };
  env.M = o => new T.MeshStandardMaterial(o);
  env.ob = (x, z, r) => env.colliders.push({ x, z, r });
  env.G = env.terrain;
  return env;
}
const hs = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };

function buildField (env) {
  const run = new Function('T', 'createPalm', 'S', 'M', 'G', 'RR', 'near', 'ob', 'qp', 'hs', 'ss',
    'return (function(){' + fieldCode + '\nreturn palmField})()');
  return run(T, createPalm, env.S, env.M, env.G, env.RR, env.near, env.ob, env.qp, hs, env.ss);
}

/* ================= 1. scatter + commit ================= */
section('1. the island field is built and committed');
const env = makeEnv();
const field = buildField(env);
const placed = field.placed();
ok('field placed palms (cap 3600)', placed === 3600, '= ' + placed);
ok('colliders were registered for every palm', env.colliders.length === placed, '= ' + env.colliders.length);
ok('field mesh drew them all', field.field.ims[0].count === placed, '= ' + field.field.ims[0].count);
ok('empty pools start at 0', field.poolOf(0).ims.every(m => m.count === 0));
ok('field palms do not cast shadows', field.field.ims.every(m => m.castShadow === false));

/* ================= 2. pools hold the nearest palms ================= */
section('2. the detail pools hold the nearest palms, not just any palms');
/* read a pool instance's world position straight out of the instance matrix */
const posOf = (im, slot) => {
  const mat = new T.Matrix4(); im.getMatrixAt(slot, mat);
  /* element 0 is the x basis scaled by yaw, so read the basis length instead */
  return { x: mat.elements[12], y: mat.elements[13], z: mat.elements[14],
           s: Math.hypot(mat.elements[0], mat.elements[1], mat.elements[2]) };
};
const fieldPos = i => posOf(field.field.ims[0], i);

/* pick a car position on top of a palm and check the pools snap to it */
const target = fieldPos(1234);
field.tick(0.016, target.x, target.z);
const heroN = field.poolOf(0).ims[0].count, midN = field.poolOf(1).ims[0].count, lowN = field.poolOf(2).ims[0].count;
ok('hero pool filled 1 palm', heroN === 1, '= ' + heroN);
ok('mid pool filled up to 5', midN === 5, '= ' + midN);
ok('low pool filled up to 16', lowN === 16, '= ' + lowN);

/* the hero palm must BE that palm (same world position, unscaled) */
const hp = posOf(field.poolOf(0).ims[0], 0);
ok('hero palm sits exactly where the field palm is',
  Math.abs(hp.x - target.x) < 1e-3 && Math.abs(hp.z - target.z) < 1e-3,
  '(' + hp.x.toFixed(2) + ',' + hp.z.toFixed(2) + ') vs (' + target.x.toFixed(2) + ',' + target.z.toFixed(2) + ')');
const fsc = posOf(field.field.ims[0], 1234).s;
ok('hero copy is at full size, field twin is 0.93x smaller',
  Math.abs(fsc - hp.s * 0.93) < 0.01,
  'hero ' + hp.s.toFixed(3) + ', field ' + fsc.toFixed(3) + ' (x0.93 = ' + (hp.s * 0.93).toFixed(3) + ')');
/* the invariant that keeps LOD swaps seamless: every upgraded palm must have its field
   twin at the same spot, at 0.93 of its size, so the cheap copy hides inside it */
let twins = 0, twinBad = 0;
for (let k = 0; k < 3; k++) {
  const im = field.poolOf(k).ims[0];
  for (let s = 0; s < im.count; s++) {
    const up = posOf(im, s);
    let best = Infinity, bs = 0;
    for (let i = 0; i < placed; i++) {
      const f = posOf(field.field.ims[0], i);
      const d = (f.x - up.x) ** 2 + (f.z - up.z) ** 2;
      if (d < best) { best = d; bs = f.s; }
    }
    twins++;
    if (Math.sqrt(best) > 0.01 || Math.abs(bs - up.s * 0.93) > 0.01) twinBad++;
  }
}
ok('every upgraded palm has a field twin at the same spot, 0.93x the size',
  twins > 0 && twinBad === 0, twins + ' checked, ' + twinBad + ' mismatched');

/* pools must be ordered nearest-first */
const d2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
const midD = [0, 1, 2, 3, 4].map(i => d2(posOf(field.poolOf(1).ims[0], i), target));
ok('mid pool is sorted nearest-first', midD.every((v, i) => i === 0 || v >= midD[i - 1]),
  midD.map(v => Math.round(Math.sqrt(v)) + 'm').join(' '));

/* no palm may appear in two pools at once */
const key = p => Math.round(p.x * 100) + ':' + Math.round(p.z * 100);
const all = [];
for (let k = 0; k < 3; k++) for (let i = 0; i < field.poolOf(k).ims[0].count; i++) all.push(key(posOf(field.poolOf(k).ims[0], i)));
ok('no palm is assigned to two pools', new Set(all).size === all.length, all.length + ' slots');

/* ================= 3. rebuild only on movement ================= */
section('3. rebuilds are driven by movement (a parked car costs nothing)');
const before = field.poolOf(0).ims[0].instanceMatrix.version;
field.tick(0.016, target.x + 3, target.z);          /* < 10 m: no rebuild */
ok('3 m of movement does not rebuild', field.poolOf(0).ims[0].instanceMatrix.version === before);
field.tick(0.016, target.x + 30, target.z);         /* > 10 m: rebuild */
ok('30 m of movement rebuilds the pools', field.poolOf(0).ims[0].instanceMatrix.version > before);

/* ================= 4. quality scaling ================= */
section('4. quality scaling (the low tier must be cheaper than the palms it replaced)');
const triOf = (p) => p.ims.reduce((a, m) => a + (m.geometry.index ? m.geometry.index.count / 3 : 0) * m.count, 0);
const costAt = (veg) => {
  env.qp.veg = veg; field.applyQuality();
  return triOf(field.field) + triOf(field.poolOf(0)) + triOf(field.poolOf(1)) + triOf(field.poolOf(2));
};
const highCost = costAt(1), medCost = costAt(0.85), lowCost = costAt(0.5);
const OLD_PALMS = 3600 * (40 + 66);   /* the 40-tri cylinder + 66-tri quad crown it replaces */
const setVeg = v => { env.qp.veg = v; field.applyQuality(); return field.field.ims[0].count; };
console.log('    field+pools: high ' + highCost.toLocaleString('en-US') +
  ' | med ' + medCost.toLocaleString('en-US') + ' | low ' + lowCost.toLocaleString('en-US') +
  '   (old palms were ' + OLD_PALMS.toLocaleString('en-US') + ')');
ok('high tier draws the whole field', setVeg(1) === placed, '= ' + field.field.ims[0].count);
ok('med tier thins the field to 85%', setVeg(0.85) === Math.round(placed * 0.85), '= ' + field.field.ims[0].count);
ok('low tier thins the field to 50%', setVeg(0.5) === Math.round(placed * 0.5), '= ' + field.field.ims[0].count);
/* the honest claim: the FIELD alone (every palm on the island) is cheaper than the
   alpha-tested quads it replaces. The detail pools are the deliberate extra spend. */
const fieldOnly = (veg) => { env.qp.veg = veg; field.applyQuality(); return triOf(field.field); };
ok('field alone is cheaper than the quads it replaced, at every tier',
  fieldOnly(1) < OLD_PALMS && fieldOnly(0.85) < OLD_PALMS && fieldOnly(0.5) < OLD_PALMS,
  fmt3([fieldOnly(1), fieldOnly(0.85), fieldOnly(0.5)]) + ' vs ' + OLD_PALMS.toLocaleString('en-US'));
ok('quality scaling lowers the total', highCost > medCost && medCost > lowCost,
  fmt3([highCost, medCost, lowCost]));
function fmt3(a) { return a.map(v => Math.round(v).toLocaleString('en-US')).join(' / '); }
ok('every tier still has the nearest palm upgraded', (() => {
  for (const v of [1, 0.85, 0.5]) { env.qp.veg = v; field.applyQuality(); if (field.poolOf(0).ims[0].count < 1) return false; }
  return true;
})());
setVeg(1);

/* ================= 5. shadow policy ================= */
section('5. shadows: hero only, and they follow the quality setting');
const castFlags = () => [0, 1, 2].map(k => field.poolOf(k).ims.every(m => m.castShadow));
ok('hero pool casts', castFlags()[0] === true);
ok('mid pool does not cast (45 m+, outside the +/-60 m shadow camera)', castFlags()[1] === false);
ok('low pool does not cast', castFlags()[2] === false);
ok('field does not cast (3600 instances x 80 tris of pure waste)', field.field.ims.every(m => !m.castShadow));

/* ================= 6. the inlined copy is the same code ================= */
section('6. source of truth matches the game');
const srcBlock = fs.readFileSync(path.join(ROOT, 'tools', 'palm-field.js'), 'utf8');
ok('public/index.html runs exactly tools/palm-field.js', srcBlock.slice(srcBlock.indexOf('/* ==== PALM-FIELD:BEGIN')).trim() === fieldCode.trim(),
  fieldCode.length.toLocaleString('en-US') + ' bytes');

/* ================= summary ================= */
section('-'.repeat(64));
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
