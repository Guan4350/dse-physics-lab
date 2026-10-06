#!/bin/sh
# 下載 tesseract 英文語言資料（23MB），供 bank/ocr-bounds.mjs 使用。
# 呢個檔案唔入 repo（見根目錄 .gitignore），需要時重新下載即可。
set -e

DIR="$(cd "$(dirname "$0")/.." && pwd)/_work/tessdata"
mkdir -p "$DIR"
cd "$DIR"

if [ -f eng.traineddata ]; then
  echo "✓ eng.traineddata 已存在（$(du -h eng.traineddata | cut -f1)），唔需要重新下載"
  exit 0
fi

echo "→ 下載 eng.traineddata…"
curl -sSL --max-time 180 -o eng.traineddata.gz \
  "https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz"
gunzip -f eng.traineddata.gz
echo "✓ 完成：$DIR/eng.traineddata（$(du -h eng.traineddata | cut -f1)）"
