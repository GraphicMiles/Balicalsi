#!/usr/bin/env node
/* tools/inline-palm.js - copies the palm block from public/palm-tree.js into public/index.html.

   The game ships as ONE self-contained file (no CDN, no extra requests), so the palm
   module lives in two places by necessity. This script is the only writer of the copy
   inside index.html, which keeps the two from ever diverging:

     - public/palm-tree.js                     source of truth (reusable standalone module)
     - public/index.html  <-- between markers --> inline copy the game actually runs

   The block is delimited by  ==== PALM-TREE:BEGIN ====  /  ==== PALM-TREE:END ====
   in both files. Running the script twice is safe: it replaces what is between the
   markers instead of appending.

   Usage:
     node tools/inline-palm.js            # inject / refresh
     node tools/inline-palm.js --check    # verify they match, exit 1 if not (CI)
*/
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'public', 'palm-tree.js');
const DST = path.join(ROOT, 'public', 'index.html');
const BEGIN = '/* ==== PALM-TREE:BEGIN ==== */', END = '/* ==== PALM-TREE:END ==== */';

const extract = (text, where, required) => {
  const b = text.indexOf(BEGIN), e = text.indexOf(END);
  if (b < 0 || e < 0) {
    if (!required) return null;
    throw new Error('markers not found in ' + where);
  }
  if (e < b) throw new Error('END marker before BEGIN in ' + where);
  return { block: text.slice(b, e + END.length), start: b, end: e + END.length };
};

const src = fs.readFileSync(SRC, 'utf8');
const dst = fs.readFileSync(DST, 'utf8');
const s = extract(src, 'public/palm-tree.js', true);
const cur = extract(dst, 'public/index.html', false);
const check = process.argv.includes('--check');

if (!cur) {
  console.error('inline-palm: public/index.html has no PALM-TREE markers yet.\n' +
    '             Insert the two marker lines where the palm block belongs, then re-run:\n' +
    '               ' + BEGIN + '\n               ' + END);
  process.exit(check ? 1 : 2);
}
const out = dst.slice(0, cur.start) + s.block + dst.slice(cur.end);

if (check) {
  if (cur.block === s.block) { console.log('inline-palm: in sync (' + s.block.length + ' bytes)'); process.exit(0); }
  console.error('inline-palm: OUT OF SYNC - run: node tools/inline-palm.js');
  process.exit(1);
}
if (out === dst) { console.log('inline-palm: already in sync (' + s.block.length + ' bytes)'); process.exit(0); }
fs.writeFileSync(DST, out);
console.log('inline-palm: wrote ' + s.block.length + ' bytes from public/palm-tree.js into public/index.html');
