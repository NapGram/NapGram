#!/bin/sh
set -eu

# Ensure we run from /app/main (script lives in ./tools)
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR/.."

# 适用于“历史用 prisma db push 初始化过数据库”的场景：
# - 先把旧枚举值 oicq 迁移为 napcat
# - 再用 db push --accept-data-loss 应用 schema（此处的 data loss 仅是移除枚举分支）

echo "[prisma] normalize legacy enum values..."
# Use ::text to avoid casting 'oicq' into enum when the variant is already removed.
echo "UPDATE \"public\".\"QqBot\" SET \"type\"='napcat' WHERE \"type\"::text='oicq';" | pnpm exec prisma db execute --stdin

echo "[prisma] db push (accept data loss)..."
pnpm exec prisma db push --accept-data-loss
