#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
if [ "$(uname -s)" = Darwin ] && [ -z "${NODE_EXTRA_CA_CERTS:-}" ] && [ -r /etc/ssl/cert.pem ]; then
 export NODE_EXTRA_CA_CERTS=/etc/ssl/cert.pem
fi
exec node --env-file=server/.env.auth.local server/auth.mjs
