#!/bin/bash
set -e
export PATH="$HOME/.local/share/pnpm:$PATH"
SERVICE_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="${NIDALHEIM_ROOT:-$(cd "$SERVICE_DIR/../.." && pwd)}"
cd "$SERVICE_DIR"
pnpm install --frozen-lockfile
set -a && . "$ROOT_DIR/infra/.env" && set +a
AUTH_API_URL="https://api-auth-staging.nidalheim.com" \
AUTH_URL="https://docs-staging.nidalheim.com" \
AUTH_TRUST_HOST=true \
exec pnpm dev --port 3014
