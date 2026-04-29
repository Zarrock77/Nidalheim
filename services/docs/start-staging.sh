#!/bin/bash
set -e
export PATH="$HOME/.local/share/pnpm:$PATH"
cd "$(dirname "$0")"
pnpm install --frozen-lockfile
set -a && . /home/ubuntu/Nidalheim/infra/.env && set +a
AUTH_API_URL="https://api-auth-staging.nidalheim.com" \
AUTH_URL="https://docs-staging.nidalheim.com" \
AUTH_TRUST_HOST=true \
exec pnpm dev --port 3014
