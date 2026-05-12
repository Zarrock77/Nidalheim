#!/bin/bash
set -e
export PATH="$HOME/.local/share/pnpm:$PATH"
SERVICE_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="${NIDALHEIM_ROOT:-$(cd "$SERVICE_DIR/../.." && pwd)}"
cd "$SERVICE_DIR"
npm install --no-audit --no-fund
set -a && . "$ROOT_DIR/infra/.env" && set +a
PORT=3011 \
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}_staging" \
REDIS_URL="redis://localhost:6379/1" \
CORS_ORIGINS="https://www-staging.nidalheim.com,https://docs-staging.nidalheim.com" \
DEVICE_VERIFICATION_BASE_URL="https://www-staging.nidalheim.com" \
exec npm run dev
