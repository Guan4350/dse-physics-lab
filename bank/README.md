# 題庫維護指南（bank/）

> 呢個資料夾係題庫嘅**唯一真相（source of truth）**。
> `上傳用/exam-bank.html` 係由呢度**自動生成**嘅成品 —— 唔好直接改 HTML。

---

## 🗂 檔案角色

### 核心資料（一定要保留）

| 檔案 | 角色 |
|---|---|
| `bank.json` | **總題庫**（147 個物件）。所有批次合併後嘅結果，網頁就係用佢生成 |
| `taxonomy.json` | **分類樹**。官方 syllabus + 每個 Topic 嘅 Group／Sub-topic 定義 |
| `mc-bounds.json` | MC 題目嘅**精準裁圖範圍**（由 OCR 定位，PDF points） |
| `mc-bounds` 對應嘅 `src/FM6.pdf`、`src/FM7.pdf` | 原始掃描檔（裁圖用） |

### 批次來源（保留做審計軌跡，可重新合併）

| 檔案 | 內容 |
|---|---|
| `_b1.json`–`_b5.json` | Projectile Motion（MC 3 批 + 長題 2 批） |
| `_c1.json`–`_c4.json` | Circular Motion（MC 2 批 + 長題 2 批） |
| `pm-samples.json` | 風格樣板（同時係 PM-M31 同 8 個長題小題嘅來源） |
| `cm-pagemap.json` | CM PDF 頁序對照表 + 34 題答案表 |
| `gaps.json` | 缺口登記（已知缺失題目、原檔矛盾） |

### 永久模板（**唔好改**）

| 檔案 | 角色 |
|---|---|
| `template-v1.html` | 你原本嘅 exam-bank.html，未改造嘅乾淨版本 |
| `page-v2.js` | 頁面渲染邏輯（篩選、互動答題、搜索、圖片） |

### 工具

| 指令 | 作用 |
|---|---|
| `node bank/tools.js merge-all` | 合併所有批次 → `bank.json` |
| `node bank/tools.js check <file>` | 驗證欄位、型別、分類值、答案索引 |
| `node bank/tools.js norm <file>` | 用 taxonomy 正規化 grp／sub／cross |
| `node bank/ocr-bounds.mjs` | OCR 定位 MC 題號行 → `mc-bounds.json` |
| `node bank/build-images.mjs` | 由 PDF 裁圖 → `上傳用/bank-img/` |
| `node bank/build-page.js` | 生成 `上傳用/exam-bank.html` |
| `node bank/get-tessdata.sh` | 下載 OCR 語言資料（23MB，唔入 repo） |

---

## 🚀 日常工作流

### 平時重新生成頁面（最常用）

```bash
node bank/build-page.js
```

### 加新題目之後

```bash
node bank/tools.js merge-all   # 合併批次 → bank.json
node bank/build-images.mjs     # 裁圖（新 MC 題要先跑 ocr-bounds）
node bank/build-page.js        # 生成頁面
```

### 新 MC 題目要精準裁圖

```bash
node bank/get-tessdata.sh      # 只需做一次
node bank/ocr-bounds.mjs       # OCR 定位 → mc-bounds.json
node bank/build-images.mjs
```

---

## 📐 題目物件 Schema

```js
{
  id:    'PM-M15',            // 唯一 id
  kind:  'mc' | 'long',       // 題型
  src:   'HKAL' | 'HKDSE' | 'Supplemental',
  yr:    '2008',              // 年份（'Practice Paper' / 'Sample Paper' 亦可）
  pp:    'Paper II',          // 卷別
  qn:    '7',                 // 原卷題號
  part:  '',                  // 長題小題編號，例如 '(a)(i)'
  marks: 1,                   // 分數（MC 一律 1）

  sect:  'B Force and Motion',// 官方 Section
  t:     'Projectile Motion', // 官方 Topic
  grp:   'G 邊界投射',         // 中分類
  sub:   'G1 投射至垂直牆',     // 子Topic（按 MS 判分技術）
  l:     'd',                 // 難度 b=基礎 d=DSE標準 c=挑戰
  freq:  '中',                // 考試出現頻率（舊制寫 'N/A（舊制）'）
  freqEv:'DSE 曾考：2014 IA-10…',
  cross: ['Energy'],          // 跨章（只可 Energy/Momentum/Force and Motion/Vectors）

  stem:  '…',                 // 長題共用題幹（僅 long）
  q:     '…',                 // 題目文字
  fig:   '…',                 // 圖說（文字描述）
  img:   'bank-img/PM-M15.jpg',// 原題掃描圖
  o:     ['A','B','C','D'],   // 選項（僅 mc）
  ci:    1,                   // 正確答案索引（僅 mc）
  note:  '…',                 // 備註（原檔矛盾、非官方解法等）

  first: '…',                 // 第一眼切入
  kw:    '…',                 // 關鍵字 → 公式
  rs:    ['…'],               // 推理路徑（5–7 步）
  ms:    ['…'],               // MS 拿分點（逐個 [1]）
  tr:    '…',                 // 常見失分陷阱
  st:    ['…']                // 最終解答步驟（尾行 '答案：X'）
}
```

---

## ⚠️ 注意事項

1. **唔好直接改 `上傳用/exam-bank.html`** —— 下次 build 會被覆蓋。要改就改 `bank.json`。
2. **`grp` / `sub` 一定要同 `taxonomy.json` 一字不差**，否則 `tools.js check` 會報錯。
3. **字串內唔准用 ASCII 雙引號 `"`**，要用中文引號「」。頁面會自動轉義 `<` `>` `&`。
4. **圖片用相對路徑** `bank-img/xxx.jpg` —— 上傳網站時一定要連 `bank-img/` 一齊。
5. `build-page.js` 係 **idempotent**（重複跑輸出完全一樣），可以放心重跑。
