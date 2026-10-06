#!/usr/bin/env node
/* 題庫工具：
 *   1. 正規化 cross（跨章）欄位 → 固定詞彙表
 *   2. 合併批次檔 → bank/pm-mc.json
 *   用法： node bank/tools.js merge
 *          node bank/tools.js check  <file...>
 */
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const CROSS_VOCAB = ['Energy', 'Momentum', 'Force and Motion', 'Vectors'];

/* 把任意寫法嘅跨章標籤映射到固定詞彙表；認唔到就當唔係跨章 */
function canonCross(v) {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : [v];
  const out = [];
  arr.forEach(function (s) {
    if (typeof s !== 'string') return;
    const k = s.toLowerCase();
    let hit = null;
    if (k.indexOf('momentum') >= 0 || k.indexOf('collision') >= 0 || k.indexOf('impulse') >= 0) hit = 'Momentum';
    else if (k.indexOf('energy') >= 0 || k.indexOf('work') >= 0 || k.indexOf('power') >= 0) hit = 'Energy';
    else if (k.indexOf('newton') >= 0 || k.indexOf('friction') >= 0 || k.indexOf('force') >= 0 ||
             k.indexOf('air resistance') >= 0 || k.indexOf('equilibrium') >= 0 || k.indexOf('terminal') >= 0) hit = 'Force and Motion';
    else if (k.indexOf('vector') >= 0) hit = 'Vectors';
    /* kinematics / 運動學 屬於本題庫母章，唔算跨章 → 丟棄 */
    if (hit && out.indexOf(hit) < 0) out.push(hit);
  });
  return out;
}

/* ── 以 taxonomy.json 為唯一真相，正規化 grp / sub ──
 * 注意：唔同 Topic 各自有 A/B/C… 代碼，所以命名空間要按 Topic 分開 */
const TAX = JSON.parse(fs.readFileSync(path.join(DIR, 'taxonomy.json'), 'utf8'));
const GRP_BY_TOPIC = {};
const SUB_BY_TOPIC = {};
TAX.topics.forEach(function (t) {
  const g = {}, s = {};
  t.groups.forEach(function (gr) {
    g[gr.id] = gr.name;
    gr.subs.forEach(function (sb) { s[sb.code] = sb.code + ' ' + sb.name; });
  });
  GRP_BY_TOPIC[t.name] = g;
  SUB_BY_TOPIC[t.name] = s;
});
/* 反查：代碼 → Topic（用嚟喺缺 t 時做 fallback） */

function canonGrp(v, topic) {
  const map = GRP_BY_TOPIC[topic] || {};
  const m = /^([A-Z])(?![0-9])/.exec(String(v || '').trim());
  if (m && map[m[1]]) return map[m[1]];
  return v;
}

function canonSub(v, topic) {
  const map = SUB_BY_TOPIC[topic] || {};
  const m = /^([A-Z][0-9]+)/.exec(String(v || '').trim());
  if (m && map[m[1]]) return map[m[1]];
  return v;
}

/* 選填欄位：mc 專用 o/ci；long 專用 stem */
const OPT = ['o', 'ci', 'stem', 'note', 'img'];

function normalise(obj) {
  obj.cross = canonCross(obj.cross);
  obj.grp = canonGrp(obj.grp, obj.t);
  obj.sub = canonSub(obj.sub, obj.t);
  if (obj.sub === undefined && obj.grp !== undefined) obj.sub = '';
  if (obj.part === undefined) obj.part = '';
  const order = ['id','kind','src','yr','pp','qn','part','marks','sect','t','grp','sub','l','freq','freqEv','cross',
                 'stem','q','fig','img','o','ci','first','kw','rs','ms','tr','st','note'];
  const out = {};
  order.forEach(function (k) { if (k in obj) out[k] = obj[k]; });
  Object.keys(obj).forEach(function (k) { if (!(k in out)) out[k] = obj[k]; });
  return out;
}

function readJsonArray(f) {
  if (!fs.existsSync(f)) return [];
  const txt = fs.readFileSync(f, 'utf8').trim();
  if (!txt) return [];
  const v = JSON.parse(txt);
  if (!Array.isArray(v)) throw new Error(f + ' 唔係 JSON array');
  return v;
}

function numOf(id) {
  const m = /M(\d+)/.exec(id || '');
  return m ? parseInt(m[1], 10) : 999;
}

const cmd = process.argv[2] || 'merge';

/* ── 合併規格：每個指令 → 輸出檔 + 來源批次 + 要由 pm-samples.json 取入嘅示範題 ── */
const PM_SAMPLE_LONG = ['PM-L5a','PM-L5b','PM-L5c','PM-L5d','PM-L9a1','PM-L9a2','PM-L9a3','PM-L9b'];
const MERGE_SPEC = {
  'merge-mc':      { out: 'pm-mc.json',   src: ['_b1.json','_b2.json','_b3.json'], sampleIds: ['PM-M31'] },
  'merge-long':    { out: 'pm-long.json', src: ['_b4.json','_b5.json'],            sampleIds: PM_SAMPLE_LONG },
  'merge-cm-mc':   { out: 'cm-mc.json',   src: ['_c1.json','_c2.json'],            sampleIds: [] },
  'merge-cm-long': { out: 'cm-long.json', src: ['_c3.json','_c4.json'],            sampleIds: [] },
  'merge-all':     { out: 'bank.json',    src: ['_b1.json','_b2.json','_b3.json','_b4.json','_b5.json',
                                                '_c1.json','_c2.json','_c3.json','_c4.json'],
                     sampleIds: ['PM-M31'].concat(PM_SAMPLE_LONG) }
};
if (cmd === 'merge') cmd = 'merge-mc';

if (MERGE_SPEC[cmd]) {
  const spec = MERGE_SPEC[cmd];
  let all = [];
  spec.src.map(function (f) { return path.join(DIR, f); }).forEach(function (f) {
    if (!fs.existsSync(f)) { console.log('⚠ 未產生，已跳過：', path.basename(f)); return; }
    const a = readJsonArray(f);
    console.log('讀入', path.basename(f), '→', a.length, '題');
    all = all.concat(a);
  });
  /* pm-samples.json 係唯一來源嘅示範題（避免重複輸入） */
  const samples = readJsonArray(path.join(DIR, 'pm-samples.json'));
  const fromSamples = samples.filter(function (x) { return spec.sampleIds.indexOf(x.id) >= 0; });
  if (spec.sampleIds.length) console.log('由 pm-samples.json 取入 →', fromSamples.length, '題');
  all = all.concat(fromSamples);

  const seen = {};
  const uniq = [];
  all.forEach(function (x) {
    if (seen[x.id]) { console.log('⚠ 重複 id 已跳過：', x.id); return; }
    seen[x.id] = 1;
    uniq.push(normalise(x));
  });
  /* 排序：MC 按題號；long 按 (Topic, 原卷題號, 小題) */
  uniq.sort(function (a, b) {
    if (a.kind === 'mc' && b.kind === 'mc') return numOf(a.id) - numOf(b.id);
    if (a.t !== b.t) return String(a.t).localeCompare(String(b.t));
    if (a.kind !== b.kind) return a.kind === 'mc' ? -1 : 1;
    const ka = String(a.qn) + String(a.part), kb = String(b.qn) + String(b.part);
    return ka.localeCompare(kb, undefined, { numeric: true });
  });

  fs.writeFileSync(path.join(DIR, spec.out), JSON.stringify(uniq, null, 2) + '\n');
  console.log('\n✔ 寫入 bank/' + spec.out + '，共', uniq.length, '題');
}

if (cmd === 'norm') {
  const files = process.argv.slice(3);
  files.forEach(function (f) {
    const a = readJsonArray(f);
    const out = a.map(normalise);
    fs.writeFileSync(f, JSON.stringify(out, null, 2) + '\n');
    console.log('✔ 正規化', path.basename(f), '→', out.length, '題');
  });
}

/* ── 字串感知嘅括號掃描：避開 ms 字串入面嘅 [1] 之類 ── */
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

if (cmd === 'inject') {
  const target = process.argv[3] || path.join(DIR, '..', '上傳用', 'exam-bank.html');
  if (!fs.existsSync(target)) { console.error('搵唔到目標檔：' + target); process.exit(1); }
  const bank = readJsonArray(path.join(DIR, 'bank.json'));
  const html = fs.readFileSync(target, 'utf8');
  const start = html.indexOf('const BANK = [');
  if (start < 0) { console.error('目標檔冇 "const BANK = ["，唔似 exam-bank 頁面'); process.exit(1); }
  const arrOpen = html.indexOf('[', start);
  const arrClose = findArrayEnd(html, arrOpen);
  if (arrClose < 0) { console.error('括號唔配對，中止'); process.exit(1); }
  const json = JSON.stringify(bank, null, 1);
  const out = html.slice(0, start) + 'const BANK = ' + json + html.slice(arrClose + 1);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const bak = target + '.bak-' + stamp;
  fs.writeFileSync(bak, html);
  fs.writeFileSync(target, out);
  console.log('✔ 已注入', bank.length, '個物件 →', path.relative(process.cwd(), target));
  console.log('  舊檔備份：', path.relative(process.cwd(), bak));
  console.log('  檔案大細：', Math.round(html.length / 1024) + 'KB →', Math.round(out.length / 1024) + 'KB');
}

if (cmd === 'check') {
  const files = process.argv.slice(3);
  const REQ = ['id','kind','src','yr','pp','qn','part','marks','sect','t','grp','sub','l','freq','freqEv','cross','q','fig','first','kw','rs','ms','tr','st'];
  let bad = 0;
  files.forEach(function (f) {
    const a = readJsonArray(f);
    console.log('\n=== ' + path.basename(f) + ' (' + a.length + ' 題) ===');
    const ids = {};
    let fileBad = 0;
    a.forEach(function (x) {
      const miss = REQ.filter(function (k) { return !(k in x); });
      const extra = Object.keys(x).filter(function (k) { return REQ.indexOf(k) < 0 && OPT.indexOf(k) < 0; });
      const errs = [];
      if (miss.length) errs.push('缺 ' + miss.join(','));
      if (extra.length) errs.push('多 ' + extra.join(','));
      if (x.kind === 'mc') {
        if (!Array.isArray(x.o) || x.o.length !== 4) errs.push('o 唔係 4 個選項');
        if (typeof x.ci !== 'number' || x.ci < 0 || x.ci > 3) errs.push('ci 越界');
        if (x.src !== 'Supplemental' && !/^\d{4}$|^Practice Paper$|^Sample Paper$/.test(String(x.yr))) errs.push('yr 格式可疑：' + x.yr);
      }
      if (x.kind === 'long' && !x.stem) errs.push('long 題缺 stem');
      if (x.kind === 'long' && (x.o || x.ci !== undefined)) errs.push('long 題不應有 o/ci');
      (x.cross || []).forEach(function (c) { if (CROSS_VOCAB.indexOf(c) < 0) errs.push('cross 非標準值：' + c); });
      if (x.grp && canonGrp(x.grp, x.t) !== x.grp) errs.push('grp 非 taxonomy 標準值：' + x.grp);
      if (x.sub && canonSub(x.sub, x.t) !== x.sub) errs.push('sub 非 taxonomy 標準值：' + x.sub);
      if (ids[x.id]) errs.push('id 重複');
      ids[x.id] = 1;
      if (errs.length) { bad++; fileBad++; console.log('  ❌', x.id, '→', errs.join('；')); }
    });
    if (!fileBad) console.log('  ✓ 全部通過 (' + a.length + ' 題)');
  });
  console.log('\n總問題數：', bad);
  process.exit(bad ? 1 : 0);
}
