#!/bin/bash
# ============================================================
# CoreAI 上游同步脚本
# 用法: bash scripts/sync-upstream.sh
#
# 作用:
#   1. 拉取官方仓库 (upstream) 最新代码
#   2. 将 main 分支快进到 upstream/main
#   3. 将上游更新合并到 dev 分支
#   4. 品牌定制文件自动保留本地版本（见 .gitattributes）
#   5. 如有其他冲突，暂停并提示手动解决
# ============================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── 配置品牌定制文件的 merge driver ─────────────────────────
# ours          : 完全保留本地版本（用于图标等二进制文件）
# keep-ours-on-conflict : 三方合并，冲突处保留本地，非冲突的上游改动正常合入
#                         适用于 package.json 等既有品牌定制又有功能性内容的文件
setup_merge_drivers() {
  if ! git config --local merge.ours.driver 'true' 2>/dev/null; then
    git config --local merge.ours.driver 'true'
  fi
  git config --local merge.ours.name 'Keep ours entirely (branding binary files)'

  git config --local merge.keep-ours-on-conflict.name 'Three-way merge, keep ours on conflict (branding text files)'
  git config --local merge.keep-ours-on-conflict.driver 'git merge-file --ours %A %O %B || true'
}

echo -e "${GREEN}[1/6] 检查工作区状态...${NC}"
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo -e "${RED}错误: 工作区有未提交的更改，请先提交或暂存${NC}"
  echo "  git stash  (暂存)"
  echo "  git stash pop  (恢复)"
  exit 1
fi

CURRENT_BRANCH=$(git branch --show-current)

echo -e "${GREEN}[2/6] 配置品牌定制 merge driver...${NC}"
setup_merge_drivers
echo -e "${CYAN}  ours                  → 图标文件完全保留本地${NC}"
echo -e "${CYAN}  keep-ours-on-conflict → 文本配置/i18n 三方合并，冲突处保留本地${NC}"

echo -e "${GREEN}[3/6] 拉取上游最新代码...${NC}"
git fetch upstream

UPSTREAM_HASH=$(git rev-parse upstream/main)
MAIN_HASH=$(git rev-parse main)

if [ "$UPSTREAM_HASH" = "$MAIN_HASH" ]; then
  echo -e "${YELLOW}main 已与 upstream/main 同步，无需更新${NC}"
  git checkout "$CURRENT_BRANCH" 2>/dev/null
  exit 0
fi

echo -e "${GREEN}[4/6] 更新 main 分支 (快进模式)...${NC}"
git checkout main
if ! git merge upstream/main --ff-only; then
  echo -e "${RED}错误: main 分支有本地提交，无法快进${NC}"
  echo "main 分支应只从 upstream 同步，不应有本地提交"
  git checkout "$CURRENT_BRANCH" 2>/dev/null
  exit 1
fi

echo -e "${GREEN}[5/6] 合并上游更新到 dev 分支...${NC}"
echo -e "${CYAN}  品牌定制文件将自动保留本地版本 (.gitattributes merge driver)${NC}"
git checkout dev
if git merge main -m "merge: 同步上游至 $(git describe --tags upstream/main 2>/dev/null || git rev-parse --short upstream/main)"; then
  echo -e "${GREEN}[6/6] 合并成功，推送到 origin...${NC}"
  git push origin main
  git push origin dev
  echo ""
  echo -e "${GREEN}同步完成!${NC}"
  echo "  upstream/main: $(git log upstream/main --oneline -1)"
  echo "  main:          $(git log main --oneline -1)"
  echo "  dev:           $(git log dev --oneline -1)"
else
  echo ""
  echo -e "${YELLOW}合并产生冲突，请手动解决:${NC}"
  echo -e "${CYAN}  品牌定制文件（图标/配置/i18n）已自动保留本地版本，以下冲突是其他文件:${NC}"
  echo ""
  git diff --name-only --diff-filter=U 2>/dev/null | while read -r f; do
    echo -e "  ${RED}冲突: $f${NC}"
  done
  echo ""
  echo "  1. 解决冲突文件"
  echo "  2. git add <冲突文件>"
  echo "  3. git commit"
  echo "  4. git push origin main && git push origin dev"
fi
