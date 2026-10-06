#!/usr/bin/env node
/* tools/inline-palm.js - syncs the palm sources into the single-file game.

   The game ships as ONE self-contained HTML file (no CDN, no extra requests), so two
   blocks live in two places by necessity. This script is the only writer of the copies
   inside public/index.html, which keeps them from ever diverging:

     public/palm-tree.js   -->  PALM-TREE:BEGIN  ... PALM-TREE:END    (the asset itself)
     tools/palm-field.js   -->  PALM-FIELD:BEGIN ... PALM-FIELD:END   (the island scatter +
                                                                      per-LOD detail pools)
   The block boundaries are the marker comments above, present in both files.

   Running it twice is safe: it replaces what is between the markers instead of appending.

   Usage:
     node tools/inline-palm.js            # inject / refresh both blocks
     node tools/inline-palm.js --check    # verify they match, exit 1 if not (CI)
*/
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const DST = path.join(ROOT, 'public', 'index.html');
const PAIRS = [
  { src: path.join(ROOT, 'public', 'palm-tree.js'), tag: 'PALM-TREE' },
  { src: path.join(ROOT, 'tools', 'palm-field.js'), tag: 'PALM-FIELD' }
];
const check = process.argv.includes('--check');

const extract = (text, tag, where, required) => {
  const begin = '/* ==== ' + tag + ':BEGIN ==== */', end = '/* ==== ' + tag + ':END ==== */';
  const b = text.indexOf(begin), e = text.indexOf(end);
  if (b < 0 || e < 0) {
    if (!required) return null;
    throw new Error(tag + ' markers not found in ' + where + '\n  expected: ' + begin + ' ... ' + end);
  }
  if (e < b) throw new Error(tag + ': END marker before BEGIN in ' + where);
  return { block: text.slice(b, e + end.length), start: b, end: e + end.length, begin };
};

let dst = fs.readFileSync(DST, 'utf8');
let changed = 0, inSync = 0, missing = [];

for (const { src, tag } of PAIRS) {
  const s = extract(fs.readFileSync(src, 'utf8'), tag, path.relative(ROOT, src), true);
  const cur = extract(dst, tag, 'public/index.html', false);
  if (!cur) {
    if (check) { console.error('inline-palm: public/index.html has no ' + tag + ' markers yet.'); process.exit(1); }
    missing.push(tag + ' (insert the marker lines where the block belongs, then re-run)');
    continue;
  }
  if (cur.block === s.block) { inSync++; continue; }
  if (check) { console.error('inline-palm: ' + tag + ' OUT OF SYNC - run: node tools/inline-palm.js'); process.exit(1); }
  dst = dst.slice(0, cur.start) + s.block + dst.slice(cur.end);
  changed++;
  console.log('  ' + tag + ': wrote ' + s.block.length.toLocaleString('en-US') + ' bytes from ' +
    path.relative(ROOT, src));
}

if (!check && changed) { fs.writeFileSync(DST, dst); console.log('inline-palm: public/index.html updated'); }
else if (check) console.log('inline-palm: both blocks in sync');
else if (!changed) console.log('inline-palm: already in sync (' + inSync + ' blocks)');
if (missing.length) console.log('inline-palm: missing ' + missing.join(', '));
