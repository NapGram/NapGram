#!/bin/bash
# 权限管理系统数据库迁移脚本
#  使用方法: ./migrate-permissions.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION_FILE="$SCRIPT_DIR/src/database/migrations/001_initial.sql"

echo "🔧 权限管理系统 - 数据库迁移"
echo "================================"
echo ""

# 检查环境变量
if [ -z "$DATABASE_URL" ]; then
  echo "❌ 错误: 未设置 DATABASE_URL 环境变量"
  echo ""
  echo "请设置数据库连接字符串:"
  echo "  export DATABASE_URL='postgresql://user:password@host:port/database'"
  exit 1
fi

echo "✓ 数据库连接: ${DATABASE_URL:0:30}..."
echo ""

# 检查迁移文件
if [ ! -f "$MIGRATION_FILE" ]; then
  echo "❌ 错误: 迁移文件不存在: $MIGRATION_FILE"
  exit 1
fi

echo "✓ 迁移文件: $MIGRATION_FILE"
echo ""

# 方法1: 使用docker运行postgres客户端（如果可用）
if command -v docker &> /dev/null; then
  echo "使用 Docker 执行迁移..."
  docker run --rm -i \
    -e PGPASSWORD="$(echo $DATABASE_URL | sed -n 's/.*:\/\/.*:\(.*\)@.*/\1/p')" \
    postgres:15 \
    psql "$DATABASE_URL" < "$MIGRATION_FILE"
  
  if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 数据库迁移成功完成！"
    echo ""
    echo "已创建的表:"
    echo "  • UserPermissions      - 用户权限表"
    echo "  • CommandPermissions   - 命令权限配置表"
    echo "  • PermissionAuditLogs  - 审计日志表"
    echo ""
    echo "已插入默认命令权限配置"
    exit 0
  else
    echo ""
    echo "❌ 迁移失败，请检查错误信息"
    exit 1
  fi
fi

# 方法2: 使用psql（如果可用）
if command -v psql &> /dev/null; then
  echo "使用 psql 执行迁移..."
  psql "$DATABASE_URL" -f "$MIGRATION_FILE"
  
  if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 数据库迁移成功完成！"
    exit 0
  else
    echo ""
    echo "❌ 迁移失败"
    exit 1
  fi
fi

# 如果都不可用
echo "❌ 错误: 未找到 docker 或 psql 命令"
echo ""
echo "请安装以下工具之一:"
echo "  • Docker (推荐)"
echo "  • PostgreSQL 客户端 (psql)"
echo ""
echo "或者手动执行迁移:"
echo "  psql \$DATABASE_URL -f $MIGRATION_FILE"
exit 1
