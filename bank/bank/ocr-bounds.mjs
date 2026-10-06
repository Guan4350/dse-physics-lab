#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   ocr-bounds.mjs — 用 OCR 行座標，為每條 MC 題目定位精確 y 範圍
   ──────────────────────────────────────────────────────────────────────
   原理：題號行（例如「14. <HKAL 1993 Paper I - 4>」）嘅 OCR bbox
         x 座標明顯靠左（約 73px），而且文字含來源標籤或單獨題號。
         用呢個特徵搵出每題起點，再以「下一題起點」做終點。
   輸出： bank/mc-bounds.json  { "<id>": { img, y0, y1 } }   (PDF points)
   用法： node bank/ocr-bounds.mjs
   ══════════════════════════════════════════════════════════════════════ */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createWorker } from 'tesseract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const IMGDIR = path.join(ROOT, '上傳用', 'bank-img');
const LANG = path.join(ROOT, '_work', 'tessdata');

/* 裁圖時嘅參數（同 build-images.mjs 一致） */
const Z = 1.9, CROP_Y0 = 18, CROP_Y1 = 578, COLH = CROP_Y1 - CROP_Y0;
const PAD = 7;                 /* PDF pt：每題上下留白 */

/* 每個 MC 欄位：圖檔 + 該欄嘅題目 id（由銀行順序） */
const COLS = [
  ['FM6-p01-left.jpg',  ['PM-M01','PM-M02']],
  ['FM6-p01-right.jpg', ['PM-M03','PM-M04','PM-M05','PM-M06']],
  ['FM6-p02-left.jpg',  ['PM-M07','PM-M08','PM-M09','PM-M10']],
  ['FM6-p02-right.jpg', ['PM-M11','PM-M12','PM-M13','PM-M14']],
  ['FM6-p03-left.jpg',  ['PM-M15','PM-M16','PM-M17']],
  ['FM6-p03-right.jpg', ['PM-M18','PM-M19','PM-M20','PM-M21']],
  ['FM6-p04-left.jpg',  ['PM-M22','PM-M23','PM-M24','PM-M25','PM-M26','PM-M27']],
  ['FM6-p04-right.jpg', ['PM-M28','PM-M29','PM-M30']],
  ['FM6-p05-left.jpg',  ['PM-M31','PM-M32','PM-M33']],
  ['FM7-p01-right.jpg', ['CM-M01','CM-M02','CM-M03','CM-M04']],
  ['FM7-p02-left.jpg',  ['CM-M05','CM-M06','CM-M07','CM-M08']],
  ['FM7-p02-right.jpg', ['CM-M09','CM-M10','CM-M11']],
  ['FM7-p03-left.jpg',  ['CM-M12','CM-M13','CM-M14']],
  ['FM7-p03-right.jpg', ['CM-M15','CM-M16','CM-M17']],
  ['FM7-p04-left.jpg',  ['CM-M18','CM-M19','CM-M20','CM-M21','CM-M22','CM-M23']],
  ['FM7-p04-right.jpg', ['CM-M24','CM-M25','CM-M26','CM-M27']],
  ['FM7-p05-left.jpg',  ['CM-M28','CM-M29','CM-M30']],
  ['FM7-p05-right.jpg', ['CM-M31','CM-M32']],
  ['FM7-p17-right.jpg', ['CM-M34']]
];

/* ── 收集行 ── */
function collectLines(data) {
  const out = [];
  function walk(n) {
    if (!n) return;
    if (n.blocks) { n.blocks.forEach(walk); return; }
    if (n.paragraphs) { n.paragraphs.forEach(walk); return; }
    if (n.lines) { n.lines.forEach(walk); return; }
    if (n.words) { out.push({ text: (n.text || '').trim(), bbox: n.bbox }); }
  }
  (data.blocks || []).forEach(walk);
  return out;
}

/* ── 題號行判斷（順序配對法） ──
   唔靠通用 regex，而係「只搵下一個預期題號」：
   欄位嘅題目順序已知（例如 PM-M15→16→17），所以只需要由 OCR 行入面
   依序搵出「15 …」「16 …」「17 …」嘅起點，誤判機會極低。
   題號行特徵：x 座標靠左（各欄 50–115 不等）。 */
function stripLead(t) {
  return String(t || '').replace(/^\s*[\|liI]\s*/, '').trim();
}
function matchNumber(text, n) {
  const t = stripLead(text);
  const A = new RegExp('^' + n + '(?!\\d)(\\s*[.,])?\\s*(<|$)');   /* 15. <HKAL… ／ 1 <HKAL… ／ 20. */
  const B = new RegExp('^' + n + '\\s*[.,]\\s*\\S');               /* 21. = ／ 5. A small marble… */
  return A.test(t) || B.test(t);
}
/* 來源標籤（<HKAL 1984 Paper I-4> 之類）只會出現喺題目頭一行，
   所以含標籤嘅行幾乎必定係題號行 —— 就算 OCR 讀錯題號數字都用得。 */
function hasSourceTag(text) {
  return /<\s*HKA?L|<\s*HKCEE|<\s*HKDSE/i.test(String(text || ''));
}

const worker = await createWorker('eng', 1,
  { langPath: LANG, cachePath: LANG, gzip: false, logger: () => {} });

const result = {};
let warn = 0;

for (const [file, ids] of COLS) {
  const full = path.join(IMGDIR, file);
  if (!fs.existsSync(full)) { console.log('❌ 缺圖', file); warn++; continue; }
  const { data } = await worker.recognize(full, {}, { blocks: true });
  const lines = collectLines(data).filter(function (l) { return l.bbox; });
  const nums = ids.map(function (id) { return parseInt(/M(\d+)/.exec(id)[1], 10); });

  /* 第一輪：嚴格順序配對（靠來源標籤 + 題號） */
  function passStrict() {
    const ys = []; let k = 0;
    for (const l of lines) {
      if (k >= nums.length) break;
      if (l.bbox.x0 >= 145) continue;
      if (hasSourceTag(l.text) || matchNumber(l.text, nums[k])) { ys.push(l.bbox.y0); k++; }
    }
    return ys;
  }
  /* 第二輪（後備）：通用題號行判斷，純按出現順序配對。
     OCR 可能讀錯數字（22→20、1→Lo），但只要行數對就用得。 */
  function passGeneric() {
    const ys = [];
    for (const l of lines) {
      if (!l.bbox || l.bbox.x0 >= 145) continue;
      const t = String(l.text || '');
      if (hasSourceTag(t) || /^\W{0,3}\d{1,2}\s*[.,]\s*\S/.test(t)) ys.push(l.bbox.y0);
    }
    return ys;
  }

  let uniqY = passStrict();
  let how = 'strict';
  if (uniqY.length !== ids.length) {
    const g = passGeneric();
    if (g.length === ids.length) { uniqY = g; how = 'generic'; }
  }

  const maxY1 = lines.reduce(function (m, l) { return Math.max(m, l.bbox.y1); }, 0);

  console.log(file.padEnd(20), '需要', ids.length, '題 ｜ OCR 偵測到', uniqY.length, '個題號行',
              uniqY.length === ids.length ? ('✓ ' + how) : '✗ 唔匹配');
  if (uniqY.length !== ids.length) {
    warn++;
    console.log('     y =', uniqY.join(', '));
    continue;
  }
  ids.forEach(function (id, i) {
    const yStartPx = uniqY[i];
    const yEndPx = (i + 1 < uniqY.length) ? uniqY[i + 1] : maxY1 + 8;
    result[id] = {
      img: file,
      y0: +(CROP_Y0 + Math.max(0, yStartPx / Z - PAD)).toFixed(1),
      y1: +(CROP_Y0 + Math.min(COLH, yEndPx / Z - PAD)).toFixed(1)
    };
  });
}

await worker.terminate();
fs.writeFileSync(path.join(__dirname, 'mc-bounds.json'), JSON.stringify(result, null, 1) + '\n');
console.log('\n✔ 已寫入 bank/mc-bounds.json，共', Object.keys(result).length, '題');
if (warn) console.log('⚠ 有', warn, '欄唔匹配，需要人手處理');
