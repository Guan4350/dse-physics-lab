#!/usr/bin/env node
/* 為題庫加入官方 syllabus Section 欄位 (sect)
 * 用法： node bank/add-sect.js <file...>
 */
const fs = require('fs');
const path = require('path');

/* 官方 HKDSE Physics syllabus：Topic → Section */
const SECT_OF_TOPIC = {
  'Projectile Motion': 'B Force and Motion',
  'Circular Motion':   'B Force and Motion',
  'Gravitation':       'B Force and Motion',
  'Force and Motion':  'B Force and Motion',
  'Mechanics':         'B Force and Motion',
  'Heat and Gases':    'A Heat and Gases',
  'Waves':             'C Wave Motion',
  'Wave Motion':       'C Wave Motion',
  'Electricity and Magnetism': 'D Electricity and Magnetism',
  'Radioactivity':     'E Radioactivity and Nuclear Energy',
  'Astronomy':         'Elective 1 Astronomy and Space Science'
};

const files = process.argv.slice(2);
let total = 0, unknown = 0;
files.forEach(function (f) {
  const a = JSON.parse(fs.readFileSync(f, 'utf8'));
  const out = a.map(function (x) {
    const s = SECT_OF_TOPIC[x.t];
    if (!s) { unknown++; console.log('  ⚠ 未知 Topic：', x.t, '(' + x.id + ')'); }
    /* 重建物件令 sect 緊接 t 之後 */
    const o = {};
    Object.keys(x).forEach(function (k) {
      if (k === 't') { o.sect = s || ''; }
      o[k] = x[k];
      if (k === 'sect') return;
    });
    if (!('sect' in o)) o.sect = s || '';
    return o;
  });
  fs.writeFileSync(f, JSON.stringify(out, null, 2) + '\n');
  total += out.length;
  console.log('✔', path.basename(f), '→', out.length, '題已加 sect');
});
console.log('\n合計', total, '題；未知 Topic', unknown, '個');
