#!/bin/bash
set -e
export PATH="$HOME/.local/share/pnpm:$PATH"
SERVICE_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="${NIDALHEIM_ROOT:-$(cd "$SERVICE_DIR/../.." && pwd)}"
cd "$SERVICE_DIR"
pnpm install --frozen-lockfile
set -a && . "$ROOT_DIR/infra/.env" && set +a
PORT=3012 \
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}_staging" \
exec pnpm dev
