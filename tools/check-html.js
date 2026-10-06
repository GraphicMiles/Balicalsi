#!/usr/bin/env node
/* tools/check-html.js - syntax-checks every inline <script> in public/index.html.

   The game is one self-contained HTML file, so a typo in the game script only shows up
   as a blank screen in the browser. This extracts each inline script (skipping src= ones)
   and runs node --check on it, so a syntax error is caught before it ships.

   Usage: node tools/check-html.js [file]
*/
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const FILE = process.argv[2] || path.join(__dirname, '..', 'public', 'index.html');
const html = fs.readFileSync(FILE, 'utf8');

/* collect <script>...</script> blocks that have no src attribute */
const blocks = [];
const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let m;
while ((m = re.exec(html))) {
  const attrs = m[1] || '';
  if (/\bsrc\s*=/.test(attrs)) continue;
  if (!m[2].trim()) continue;
  blocks.push({ body: m[2], line: html.slice(0, m.index).split('\n').length });
}
if (!blocks.length) { console.error('check-html: no inline scripts found in ' + FILE); process.exit(1); }

let bad = 0, total = 0;
blocks.forEach((b, i) => {
  const tmp = path.join(os.tmpdir(), 'check-html-' + process.pid + '-' + i + '.js');
  fs.writeFileSync(tmp, b.body);
  total += b.body.length;
  try {
    execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
    console.log('  \u2713 script ' + (i + 1) + ' (starts at line ' + b.line + ', ' + b.body.length.toLocaleString('en-US') + ' bytes)');
  } catch (e) {
    bad++;
    const out = (e.stderr || '').toString().split('\n').slice(0, 6).join('\n');
    console.log('  \u2717 script ' + (i + 1) + ' (starts at line ' + b.line + ')\n' + out);
  } finally { fs.unlinkSync(tmp); }
});
console.log((blocks.length - bad) + '/' + blocks.length + ' inline scripts parse (' +
  total.toLocaleString('en-US') + ' bytes checked)');
process.exit(bad ? 1 : 0);
