#!/bin/bash
# ============================================================
# CoreAI 图标一键替换
# 用法: bash scripts/generate-icons.sh <源图片路径>
#
# 从一张源图片自动生成所有平台所需的图标文件 (11 个)。
# 支持 JPG/PNG/WebP，建议正方形且不小于 1024x1024。
# ============================================================

set -e

if [ -z "$1" ]; then
  echo "用法: bash scripts/generate-icons.sh <源图片路径>"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "[1/3] 安装临时依赖..."
(cd "$ROOT" && bun add -d png2icons --silent 2>/dev/null)

echo "[2/3] 生成图标..."
node "$SCRIPT_DIR/generate-icons.mjs" "$1"

echo "[3/3] 清理临时依赖..."
(cd "$ROOT" && bun remove png2icons --silent 2>/dev/null)
