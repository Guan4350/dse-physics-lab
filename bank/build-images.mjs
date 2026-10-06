#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   build-images.mjs — 由原始掃描 PDF 裁出「題目所在欄位」嘅圖，並寫入
                      bank.json 嘅 img 欄位
   ──────────────────────────────────────────────────────────────────────
   為何用「欄位」而唔係「逐題」：
     兩份掃描都係圖片磚合成，冇文字層，題目之間亦冇穩定嘅空白分隔
     （實測 band 偵測同一欄會得出 3–12 個區塊，唔可靠）。
     所以改用固定欄位裁切：
       • FM6 長題   1 欄 = 1 題        ⇒ 精準
       • FM6 MC     1 欄 = 3–6 題      ⇒ 顯示整欄，題目在內
       • FM7        1 欄 = 1 份原檔頁  ⇒ 顯示整欄，題目在內
   用法： node bank/build-images.mjs
   ══════════════════════════════════════════════════════════════════════ */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as mupdf from 'mupdf';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.join(__dirname, '..');
const OUT   = path.join(ROOT, '上傳用', 'bank-img');
const BANKJ = path.join(__dirname, 'bank.json');

const Z    = 1.9;      /* render 倍率 */
const QUAL = 74;       /* JPEG 質素 */
/* 每個掃描頁左右兩欄嘅 x 範圍（PDF points） */
const COLX = { left: [6, 421], right: [423, 841] };

/* ── PDF 檔案 ── */
const PDF = { FM6: path.join(__dirname, 'src', 'FM6.pdf'),
              FM7: path.join(__dirname, 'src', 'FM7.pdf') };

/* ── 題目 → (PDF, 頁, 欄) 對照表 ──
   FM6：p01–p05 = MC Q1–Q33；p09–p13 = 長題 Q1–Q9
   FM7：頁序亂序，見 bank/cm-pagemap.json                                    */
const MAP = {};

/* FM6 MC */
[['p01','left',  ['PM-M01','PM-M02']],
 ['p01','right', ['PM-M03','PM-M04','PM-M05','PM-M06']],
 ['p02','left',  ['PM-M07','PM-M08','PM-M09','PM-M10']],
 ['p02','right', ['PM-M11','PM-M12','PM-M13','PM-M14']],
 ['p03','left',  ['PM-M15','PM-M16','PM-M17']],
 ['p03','right', ['PM-M18','PM-M19','PM-M20','PM-M21']],
 ['p04','left',  ['PM-M22','PM-M23','PM-M24','PM-M25','PM-M26','PM-M27']],
 ['p04','right', ['PM-M28','PM-M29','PM-M30']],
 ['p05','left',  ['PM-M31','PM-M32','PM-M33']]
].forEach(function (r) { r[2].forEach(function (id) { MAP[id] = { pdf:'FM6', page:r[0], col:r[1] }; }); });

/* FM6 長題（1 欄 1 題） */
[['p09','left','PM-L1'], ['p09','right','PM-L2'],
 ['p10','left','PM-L3'], ['p10','right','PM-L4'],
 ['p11','left','PM-L5'], ['p11','right','PM-L6'],
 ['p12','left','PM-L7'], ['p12','right','PM-L8'],
 ['p13','right','PM-L9']
].forEach(function (r) {
  /* 用前綴配對：PM-L1 → PM-L1a / PM-L1b … */
  MAP['__LONG__' + r[2]] = { pdf:'FM6', page:r[0], col:r[1], prefix:r[2] };
});

/* FM7 MC */
[['p01','right', ['CM-M01','CM-M02','CM-M03','CM-M04']],
 ['p02','left',  ['CM-M05','CM-M06','CM-M07','CM-M08']],
 ['p02','right', ['CM-M09','CM-M10','CM-M11']],
 ['p03','left',  ['CM-M12','CM-M13','CM-M14']],
 ['p03','right', ['CM-M15','CM-M16','CM-M17']],
 ['p04','left',  ['CM-M18','CM-M19','CM-M20','CM-M21','CM-M22','CM-M23']],
 ['p04','right', ['CM-M24','CM-M25','CM-M26','CM-M27']],
 ['p05','left',  ['CM-M28','CM-M29','CM-M30']],
 ['p05','right', ['CM-M31','CM-M32']],
 ['p17','right', ['CM-M34']]
].forEach(function (r) { r[2].forEach(function (id) { MAP[id] = { pdf:'FM7', page:r[0], col:r[1] }; }); });

/* FM7 長題（1 欄 1 題） */
[['p13','right','CM-L1'], ['p12','left','CM-L2'], ['p12','right','CM-L3'],
 ['p11','left','CM-L4'],  ['p11','right','CM-L5'], ['p10','left','CM-L6'],
 ['p10','right','CM-L7'], ['p09','left','CM-L8'],  ['p09','right','CM-L9'],
 ['p08','left','CM-L10']
].forEach(function (r) { MAP['__LONG__' + r[2]] = { pdf:'FM7', page:r[0], col:r[1], prefix:r[2] }; });

/* PM-L9 跨欄：(a)(i) 在 p13 左欄，其餘小題在 p13 右欄 */
MAP['PM-L9a1'] = { pdf:'FM6', page:'p13', col:'left' };

/* ── 開檔 ── */
const docs = {};
Object.keys(PDF).forEach(function (k) {
  docs[k] = mupdf.Document.openDocument(fs.readFileSync(PDF[k]), 'application/pdf');
});

fs.mkdirSync(OUT, { recursive: true });

/* 快取：同一裁切範圍只做一次 */
const cache = {};
function crop(pdfKey, pageStr, col, yA, yB, outName) {
  const key = pdfKey + '|' + pageStr + '|' + col + '|' + (yA === undefined ? '' : yA + '-' + yB);
  if (cache[key]) return cache[key];
  const pageNo = parseInt(pageStr.replace(/\D/g, ''), 10);
  const p = docs[pdfKey].loadPage(pageNo - 1);
  const [x0, x1] = COLX[col];
  const y0 = (yA === undefined) ? 18  : yA;      /* 冇指定就用整欄（略去頁邊） */
  const y1 = (yB === undefined) ? 578 : yB;
  const pm = p.toPixmap(mupdf.Matrix.scale(Z, Z), mupdf.ColorSpace.DeviceRGB, false, true);
  const s = pm.getStride(), nc = pm.getNumberOfComponents();
  const buf = Uint8Array.from(pm.getPixels());
  const cx0 = Math.round(x0 * Z), cy0 = Math.round(y0 * Z);
  const cw = Math.round((x1 - x0) * Z), chh = Math.round((y1 - y0) * Z);
  const out = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, cw, chh], false);
  const dst = out.getPixels();
  const dstride = out.getStride();
  for (let y = 0; y < chh; y++) {
    const sOff = (cy0 + y) * s + cx0 * nc;
    dst.set(buf.subarray(sOff, sOff + cw * nc), y * dstride);
  }
  const name = (outName || (pdfKey + '-' + pageStr + '-' + col)) + '.jpg';
  const file = path.join(OUT, name);
  fs.writeFileSync(file, out.asJPEG(QUAL));
  const rel = 'bank-img/' + name;
  cache[key] = rel;
  return rel;
}

/* ── 逐題精準範圍（由 OCR 定位，見 bank/ocr-bounds.mjs） ── */
const BOUNDS_FILE = path.join(__dirname, 'mc-bounds.json');
const BOUNDS = fs.existsSync(BOUNDS_FILE)
  ? JSON.parse(fs.readFileSync(BOUNDS_FILE, 'utf8')) : {};
/* 圖檔名 → (pdf, page, col) 反查表 */
const COLOF = {};
[['FM6','p01','left'],['FM6','p01','right'],['FM6','p02','left'],['FM6','p02','right'],
 ['FM6','p03','left'],['FM6','p03','right'],['FM6','p04','left'],['FM6','p04','right'],
 ['FM6','p05','left'],
 ['FM7','p01','right'],['FM7','p02','left'],['FM7','p02','right'],['FM7','p03','left'],
 ['FM7','p03','right'],['FM7','p04','left'],['FM7','p04','right'],['FM7','p05','left'],
 ['FM7','p05','right'],['FM7','p17','right']
].forEach(function (r) { COLOF[r[0] + '-' + r[1] + '-' + r[2] + '.jpg'] = r; });

/* ── 套用 ── */
const bank = JSON.parse(fs.readFileSync(BANKJ, 'utf8'));
let hit = 0, precise = 0, miss = [];

bank.forEach(function (x) {
  /* 1. MC：有 OCR 精準範圍 ⇒ 逐題裁，檔名用 id */
  const b = BOUNDS[x.id];
  if (b && COLOF[b.img]) {
    const r = COLOF[b.img];
    x.img = crop(r[0], r[1], r[2], b.y0, b.y1, x.id);
    hit++; precise++;
    return;
  }
  /* 2. 其餘（長題）：用整欄 */
  let m = MAP[x.id];
  if (!m) {
    const pre = /^(PM|CM)-L\d+/.exec(x.id);
    if (pre) m = MAP['__LONG__' + pre[0]];
  }
  if (!m) { miss.push(x.id); return; }
  x.img = crop(m.pdf, m.page, m.col);
  hit++;
});

fs.writeFileSync(BANKJ, JSON.stringify(bank, null, 1) + '\n');

const files = fs.readdirSync(OUT);
const bytes = files.reduce(function (n, f) { return n + fs.statSync(path.join(OUT, f)).size; }, 0);
console.log('✔ 已裁出', files.length, '張圖（' + (bytes / 1048576).toFixed(1) + 'MB）→',
            path.relative(ROOT, OUT));
console.log('✔ 已為', hit, '/', bank.length, '個物件設定 img 欄位（其中', precise, '題係 OCR 逐題精準裁切）');
if (miss.length) console.log('⚠ 冇對照表嘅物件（' + miss.length + '）：', miss.slice(0, 20).join(', '));
