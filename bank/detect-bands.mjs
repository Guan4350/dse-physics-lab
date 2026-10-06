#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   detect-bands.js — 偵測 PDF 每一頁每一欄嘅「題目區塊」y 範圍
   用法： node bank/detect-bands.js <pdf> <page> <left|right> [gapPx]
   ══════════════════════════════════════════════════════════════════════ */
import fs from 'fs';
import * as mupdf from 'mupdf';

const [,, src, pageStr, col, gapStr] = process.argv;
const Z = 2;                       /* render 倍率 */
const GAP = parseInt(gapStr || '14', 10);   /* 連續空白行數 ≥ 此值 ⇒ 視為分隔 */
const MINH = 22;                   /* 最短區塊高度（px @Z=2） */

/* 欄位 x 範圍（PDF points） */
const COLX = {
  left:  [26, 412],
  right: [424, 818]
};

const doc = mupdf.Document.openDocument(fs.readFileSync(src), 'application/pdf');
const p = doc.loadPage(parseInt(pageStr, 10) - 1);
const pm = p.toPixmap(mupdf.Matrix.scale(Z, Z), mupdf.ColorSpace.DeviceGray, false, true);
const W = pm.getWidth(), H = pm.getHeight(), stride = pm.getStride();
const px = Uint8Array.from(pm.getPixels());

const [x0p, x1p] = COLX[col];
const x0 = Math.round(x0p * Z), x1 = Math.round(x1p * Z);
const THR = 150;   /* < THR 視為有墨 */

/* 每行嘅墨量 */
const rows = new Int32Array(H);
for (let y = 0; y < H; y++) {
  let c = 0;
  const off = y * stride;
  for (let x = x0; x < x1; x++) if (px[off + x] < THR) c++;
  rows[y] = c;
}

/* 有墨行 = count >= 2（避開單點雜訊） */
const inked = new Uint8Array(H);
for (let y = 0; y < H; y++) inked[y] = rows[y] >= 2 ? 1 : 0;

/* 找連續有墨段，並合併相距 < GAP 嘅段 */
let bands = [], y = 0;
while (y < H) {
  if (!inked[y]) { y++; continue; }
  let s = y;
  while (y < H && inked[y]) y++;
  bands.push([s, y - 1]);
}
let merged = [];
bands.forEach(function (b) {
  const last = merged[merged.length - 1];
  if (last && b[0] - last[1] - 1 < GAP) last[1] = b[1];
  else merged.push([b[0], b[1]]);
});
merged = merged.filter(function (b) { return b[1] - b[0] + 1 >= MINH; });

console.log('頁 ' + pageStr + ' / ' + col + ' 欄 ｜ 圖 ' + W + 'x' + H +
            ' ｜ x ' + x0 + '-' + x1);
console.log('偵測到 ' + merged.length + ' 個區塊：');
merged.forEach(function (b, i) {
  const y0 = (b[0] / Z).toFixed(1), y1 = ((b[1] + 1) / Z).toFixed(1);
  console.log('  #' + String(i + 1).padStart(2) + '  y ' + y0.padStart(6) + ' – ' +
              y1.padStart(6) + '  高 ' + ((b[1] - b[0] + 1) / Z).toFixed(1) + ' pt');
});
