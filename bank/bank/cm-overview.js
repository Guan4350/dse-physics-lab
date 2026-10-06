#!/usr/bin/env node
/* 由 CM 轉錄檔抽出精簡技術概覽：每題嘅題幹首句 + 正確答案 + MS 關鍵式
 * 用法： node bank/cm-overview.js [1-17] [18-27] [28-32]
 */
const fs = require('fs');
const path = require('path');
const DIR = '/Users/JACKY/Documents/deepseek-harness/DSE/_work/cm';
const t1 = fs.readFileSync(path.join(DIR, 'transcript_1.md'), 'utf8').split('\n');
const t2 = fs.readFileSync(path.join(DIR, 'transcript_2.md'), 'utf8').split('\n');

const q = {};   // n -> {src, stem[], opts[], ans, ms[]}

/* ---- 由題目檔抽題幹／選項 ---- */
let cur = null, mode = null;
t1.forEach(function (L) {
  const h = /^### Q(\d+)\s*(.*)$/.exec(L);
  if (h) { cur = +h[1]; q[cur] = q[cur] || { stem: [], opts: [], ms: [] };
           q[cur].src = (h[2] || '').trim(); mode = 'stem'; return; }
  if (cur === null) return;
  if (/^###/.test(L)) { cur = null; return; }
  if (/^[A-D]\.\s/.test(L.trim())) { q[cur].opts.push(L.trim()); mode = 'opt'; return; }
  const isQ = /^\s*(A|B|C|D)\.\s*$/.test(L);
  if (isQ) { mode = 'opt'; return; }
  if (mode === 'stem' && L.trim() && !/^\[/.test(L.trim()) && q[cur].stem.length < 4) q[cur].stem.push(L.trim());
});

/* ---- 由解法檔抽答案 + 關鍵式 ---- */
cur = null;
t2.forEach(function (L) {
  const h = /^### Q(\d+)\s*解法/.exec(L);
  if (h) { cur = +h[1]; if (!q[cur]) q[cur] = { stem: [], opts: [], ms: [] }; mode = 'ms'; return; }
  if (cur === null) return;
  if (/^###/.test(L) && !/解法/.test(L)) { mode = null; return; }
  const m = /^\s*(\d+)\.\s+([A-D])\s*$/.exec(L);
  if (m) { q[cur].ans = m[2]; return; }
  const t = L.trim();
  if (mode === 'ms' && t && !/^```/.test(t) && q[cur].ms.length < 3) {
    if (/[=√∝]|force|acceleration|centripetal|friction|tension|weight|velocity/i.test(t)) q[cur].ms.push(t.replace(/\s+/g, ' ').slice(0, 120));
  }
});

const groups = process.argv.slice(2);
const wanted = [];
groups.forEach(function (g) {
  const m = /^(\d+)-(\d+)$/.exec(g);
  if (m) { for (let i = +m[1]; i <= +m[2]; i++) wanted.push(i); }
});
if (!wanted.length) for (let i = 1; i <= 34; i++) wanted.push(i);

wanted.forEach(function (n) {
  const x = q[n]; if (!x) return;
  console.log('──────────────────────────────────────');
  console.log('Q' + n + '  [' + (x.src || '（無來源標籤）').replace(/[<>]/g, '').trim() + ']  答案=' + (x.ans || '?'));
  console.log('  題幹: ' + (x.stem[0] || '').slice(0, 145));
  if (x.stem[1]) console.log('        ' + x.stem[1].slice(0, 145));
  if (x.opts.length) console.log('  選項: ' + x.opts.map(function (o) { return o.slice(0, 26); }).join(' ／ '));
  if (x.ms.length) console.log('  MS  : ' + x.ms.join('\n        '));
});
