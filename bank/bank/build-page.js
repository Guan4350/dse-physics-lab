#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   build-page.js — 生成 上傳用/exam-bank.html
   ──────────────────────────────────────────────────────────────────────
   永遠由「乾淨嘅 v1 模板」（bank/template-v1.html）生成，
   唔會讀已經改造過嘅成品，所以可以無限次重跑都保持一致（idempotent）。

   模板嘅 <style> 同 HTML 結構一個字都唔改；只做四件事：
     1. 換走模板最後一個 <script> 區塊（題庫邏輯），並注入 bank/bank.json
     2. 喺 </head> 前插入一個額外 <style>（新元件用，唔覆蓋原有 class）
     3. 把 .filters 內容清空（交由 JS 動態產生多層篩選）
     4. 更新 <p class="lede"> 說明文字

   用法： node bank/build-page.js
   ══════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT   = path.join(__dirname, '..');
const SRC    = path.join(__dirname, 'template-v1.html');   /* 乾淨模板 */
const OUT    = path.join(ROOT, '上傳用', 'exam-bank.html');
const SCRIPT = path.join(__dirname, 'page-v2.js');
const BANK   = path.join(__dirname, 'bank.json');

/* ── 字串感知括號掃描：避開字串入面嘅 [1] 之類 ── */
function findArrayEnd(s, openIdx) {
  let depth = 0, inStr = false, q = '';
  for (let i = openIdx; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (ch === '\\') { i++; continue; }
      if (ch === q) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = true; q = ch; continue; }
    if (ch === '[') depth++;
    else if (ch === ']') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/* ── v2 額外 CSS（只新增 class，唔覆蓋原檔任何規則） ── */
const EXTRA_CSS = `
<style>
/* ══ Exam Bank v2 追加樣式（只新增，唔改原有規則） ══ */
.chipbox{flex:1 1 340px;min-width:0;display:flex;flex-wrap:wrap;gap:6px;
  max-height:128px;overflow-y:auto;padding:8px 10px;background:#fcfcfe;
  border:1px dashed #e2e2e8;border-radius:10px}
.chipbox .chk{font-size:11.6px;padding:3px 10px}
.chip-kind{font-size:10.5px;font-weight:800;letter-spacing:.1em;padding:3px 10px;border-radius:20px;border:1px solid}
.chip-kind.k-mc{color:#3a5a8c;border-color:rgba(58,90,140,.35);background:rgba(58,90,140,.09)}
.chip-kind.k-long{color:#7a4a1f;border-color:rgba(140,90,40,.35);background:rgba(160,110,50,.10)}
.chip-src{font-size:11px;font-weight:650;color:#6b6b73;background:#f7f7f9;
  border:1px solid #e8e8ec;border-radius:20px;padding:3px 10px;letter-spacing:.02em}
.chip-sub{font-size:11.5px;font-weight:650;color:var(--gold-deep);background:rgba(201,162,39,.11);
  border:1px solid rgba(184,134,11,.28);border-radius:20px;padding:3px 11px}
.chip-freq{font-size:11.5px;font-weight:700;color:#8f2f28;background:rgba(192,69,95,.07);
  border:1px solid rgba(192,69,95,.26);border-radius:20px;padding:3px 10px;cursor:help}
.chip-cross{display:inline-block;font-size:11px;font-weight:650;color:#1f6b4a;
  background:rgba(47,158,111,.09);border:1px solid rgba(47,158,111,.3);
  border-radius:20px;padding:2px 10px;margin-right:6px}
.crossline{margin:10px 0 0;font-size:11.5px;color:#8c8c93}
.qstem{color:#5a5a62;background:#fafafc;border-left:3px solid #e2e2e8;
  border-radius:0 8px 8px 0;padding:11px 15px;font-size:13.6px}
.qask{margin-top:9px}
.qpart{color:var(--gold-deep);font-weight:800;margin-right:3px}
.figline{margin:9px 0 0;font-size:12.4px;line-height:1.8;color:#8c8c93;
  background:#fbfbfd;border:1px dashed #e6e6ea;border-radius:8px;padding:8px 12px}
.figline b{color:#6b6b73}
.blk .line{display:block;margin:6px 0;font-size:13.4px;line-height:1.9;color:#4a4a52}
.msblk .line{background:#fbf8ef;border-left:3px solid var(--gold);border-radius:0 7px 7px 0;
  padding:8px 13px;font-size:13.1px;color:#5a4a10}
.rsblk .line{border-left:3px solid #e6e2d2;padding-left:12px}
.stblk .line{font-variant-numeric:tabular-nums}
.firstblk{background:#fbf8ef;border:1px solid #ece7d6;border-left:3px solid var(--gold);
  border-radius:0 9px 9px 0;padding:11px 15px;font-size:13.6px;line-height:1.9;color:#5a4a10}
.longans{color:var(--gold-deep);background:rgba(201,162,39,.10);border-left-color:var(--gold)}
.noteline{margin-top:11px;font-size:12.2px;line-height:1.8;color:#78787f;
  background:#f7f7f9;border:1px dashed #e0e0e6;border-radius:8px;padding:9px 13px}
.noteline b{color:#5a5a62}

/* ── 搜索框 + 關鍵詞彈出 ── */
.searchwrap{position:relative;flex:1 1 360px;min-width:0}
.kwinput{width:100%;box-sizing:border-box;font-family:inherit;font-size:13.4px;color:#2b2b30;
  background:#fbfbfd;border:1px solid var(--line);border-radius:9px;padding:9px 36px 9px 13px;
  transition:.18s;outline:none}
.kwinput:focus{border-color:var(--gold-bright);background:#fff;
  box-shadow:0 0 0 3px rgba(201,162,39,.13)}
.kwinput::placeholder{color:#b0b0b8}
.kwclear{position:absolute;right:7px;top:50%;transform:translateY(-50%);cursor:pointer;
  border:0;background:transparent;color:#b0b0b8;font-size:14px;line-height:1;padding:5px 7px;border-radius:6px}
.kwclear:hover{color:var(--gold-deep);background:rgba(201,162,39,.12)}
.kwdrop{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:40;background:#fff;
  border:1px solid var(--line);border-radius:10px;box-shadow:0 12px 30px rgba(60,60,67,.14);
  padding:6px;max-height:266px;overflow-y:auto}
.kwitem{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;
  cursor:pointer;font-family:inherit;font-size:12.8px;color:#3a3a42;text-align:left;
  background:transparent;border:0;border-radius:7px;padding:8px 11px;transition:.14s}
.kwitem:hover{background:rgba(201,162,39,.13);color:var(--gold-deep)}
.kwitem em{font-style:normal;font-size:10.5px;font-weight:700;color:#a8a8b0;
  background:#f4f4f6;border-radius:20px;padding:2px 8px}

/* ── 可點選項（互動答題） ── */
.opts li.opt{cursor:pointer;transition:.16s;user-select:none}
.opts li.opt:hover{border-color:var(--gold-bright);background:#fff;transform:translateX(2px)}
.opts li.opt.right{border-color:rgba(47,158,111,.55);background:rgba(47,158,111,.11);
  color:#1f6b4a;font-weight:650}
.opts li.opt.right .k{background:#2f9e6f;color:#fff}
.opts li.opt.wrong{border-color:rgba(192,69,95,.5);background:rgba(192,69,95,.08);
  color:#a8443a;text-decoration:line-through}
.opts li.opt.wrong .k{background:#c0455f;color:#fff}
.opts li.opt.locked{cursor:default;transform:none}
.opts li.opt.locked:hover{border-color:inherit}
.hint{margin:9px 0 0;font-size:11.8px;color:#a8a8b0}
.scorebox{color:var(--gold-deep);font-weight:650}
.scorebox b{font-size:15px}

/* ── 原題掃描圖（可摺疊） ── */
.figwrap{margin:13px 0 0}
.figtoggle{display:flex;align-items:center;gap:8px;width:100%;cursor:pointer;
  font-family:inherit;font-size:12.6px;font-weight:650;color:#6b6b73;text-align:left;
  background:#f7f7f9;border:1px solid #e8e8ec;border-radius:9px;padding:9px 13px;transition:.16s}
.figtoggle:hover{border-color:var(--gold-bright);color:var(--gold-deep);
  background:rgba(201,162,39,.08)}
.figarrow{margin-left:auto;font-size:15px;color:#b0b0b8}
.figwrap .qfig{display:none;margin:10px 0 0;padding:0}
.figwrap.open .qfig{display:block}
.qfig a{display:block;line-height:0}
.qfig img{display:block;width:100%;height:auto;max-height:70vh;object-fit:contain;
  object-position:top;border:1px solid var(--line);border-radius:9px;background:#fff}
.qfig figcaption{margin-top:6px;font-size:11px;letter-spacing:.06em;color:#a8a8b0;text-align:right}
</style>
`;

/* ── 1. 讀來源 ── */
let html = fs.readFileSync(SRC, 'utf8');
const bank = JSON.parse(fs.readFileSync(BANK, 'utf8'));
const script = fs.readFileSync(SCRIPT, 'utf8');

/* ── 2. 換走最後一個 <script>（題庫邏輯），同時在開頭放入 BANK 資料 ── */
const anchor = html.indexOf('/* ══════════ 題庫');
if (anchor < 0) throw new Error('搵唔到題庫 script 起點');
const sTag = html.lastIndexOf('<script>', anchor);
const eTag = html.indexOf('</script>', anchor);
if (sTag < 0 || eTag < 0) throw new Error('script 標籤唔配對');
html = html.slice(0, sTag) +
  '<script>\n/* ══════════ 題庫資料（由 bank/bank.json 自動注入，勿手改） ══════════ */\n' +
  'const BANK = ' + JSON.stringify(bank, null, 1) + ';\n\n' +
  script.trimEnd() + '\n</script>' +
  html.slice(eTag + '</script>'.length);
console.log('✔ 已換走題庫 script 區塊，並注入', bank.length, '個物件');

/* ── 3. 插入 v2 追加 CSS ── */
if (html.indexOf('Exam Bank v2 追加樣式') < 0) {
  html = html.replace('</head>', EXTRA_CSS + '</head>');
  console.log('✔ 已插入 v2 追加 CSS（原有 <style> 未改動）');
}

/* ── 4. 清空 .filters（改由 JS 動態產生） ── */
const FILTERS_OLD = `        <div class="filters">
          <div class="frow">
            <span class="fl">Topic</span>
            <span id="topicBox"></span>
          </div>
          <div class="frow">
            <span class="fl">難度</span>
            <span id="lvBox"></span>
          </div>
          <div class="frow">
            <span class="fl">抽題數</span>
            <span id="numBox"></span>
          </div>
        </div>`;
if (html.indexOf(FILTERS_OLD) >= 0) {
  html = html.replace(FILTERS_OLD, '        <div class="filters"></div>');
  console.log('✔ 已清空 .filters（四層篩選交由 JS 產生）');
} else {
  html = html.replace(/<div class="filters">[\s\S]*?<\/div>\s*<\/div>/,
    '<div class="filters"></div>');
  console.log('⚠ 用 fallback regex 清空 .filters');
}

/* ── 5. 更新說明文字（功能描述已變） ── */
html = html.replace(
  /<p class="lede">[\s\S]*?<\/p>/,
  '<p class="lede">可以用搜索框打關鍵詞（會彈出建議），或者用四層篩選 —— ' +
  '<b>Section → Topic → 分類 → 子Topic</b>，亦可以只抽 MC 或只抽長題。<br>' +
  '<b>MC 可以直接撳 A／B／C／D 作答</b>，即刻知對錯。每題附原題掃描圖、' +
  '「見到題目第一步諗咩」、關鍵字對應公式、<b>推理路徑</b>、' +
  '<b>MS 拿分點</b>、最終解答步驟同扣分位。MC 選項次序會隨機排列，避免背答案。</p>'
);
console.log('✔ 已更新說明文字');

/* ── 6. 寫檔 + 驗證 ── */
fs.writeFileSync(OUT, html);
console.log('\n✔ 已寫入', path.relative(process.cwd(), OUT), '（' + Math.round(html.length / 1024) + 'KB）');

let ok = true;
[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach(function (m, i) {
  try { new Function(m[1]); console.log('   script #' + i + ' ✓ 語法正確 (' + Math.round(m[1].length / 1024) + 'KB)'); }
  catch (e) { ok = false; console.log('   script #' + i + ' ❌ ' + e.message); }
});
process.exit(ok ? 0 : 1);
