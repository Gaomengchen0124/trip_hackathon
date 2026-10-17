#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
if [ "$(uname -s)" = Darwin ] && [ -z "${NODE_EXTRA_CA_CERTS:-}" ] && [ -r /etc/ssl/cert.pem ]; then
 export NODE_EXTRA_CA_CERTS=/etc/ssl/cert.pem
fi
# 本地开发默认接受 vite dev server 的来源；生产由 systemd 注入正式站点来源
if [ -z "${CONTENT_ORIGIN:-}" ]; then
 export CONTENT_ORIGIN=http://localhost:5173
fi
# AI 配置（server/.env.ai.local，不存在则跳过）；真实 key 只留在服务端
if [ -f server/.env.ai.local ]; then
 exec node --env-file=server/.env.ai.local server/content.mjs
fi
exec node server/content.mjs
