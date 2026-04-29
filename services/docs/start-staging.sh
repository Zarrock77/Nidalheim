#!/bin/bash
set -e
cd "$(dirname "$0")"
pnpm install
set -a && . /home/ubuntu/Nidalheim/infra/.env && set +a
AUTH_API_URL="https://api-auth-staging.nidalheim.com" \
AUTH_URL="https://docs-staging.nidalheim.com" \
AUTH_TRUST_HOST=true \
exec pnpm dev --port 3014
