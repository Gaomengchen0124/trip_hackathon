#!/usr/bin/env bash
# ============================================================
# 一键部署到首尔服务器（43.128.143.196）
# 用法：bash scripts/deploy.sh
# 流程：本地构建 → tar 流上传 → 服务器端原子切换（更新期间不中断访问）
# 前置：本机 SSH 私钥已加入服务器的 ubuntu 用户 authorized_keys
# ============================================================
set -e

cd "$(dirname "$0")/.."

echo "① 本地构建..."
npm run build

echo "② 上传并原子切换..."
tar czf - -C dist . | ssh -o BatchMode=yes ubuntu@43.128.143.196 '
  sudo bash -c "
    rm -rf /var/www/trip-web.new
    mkdir -p /var/www/trip-web.new
    tar xzf - -C /var/www/trip-web.new
    rm -rf /var/www/trip-web.old
    mv /var/www/trip-web /var/www/trip-web.old 2>/dev/null || true
    mv /var/www/trip-web.new /var/www/trip-web
    rm -rf /var/www/trip-web.old
  "
'

echo "✅ 部署完成 → http://43.128.143.196/"
echo "   验证：curl -s -o /dev/null -w '%{http_code}' http://43.128.143.196/"
