#!/bin/bash
set -e
export PATH="$HOME/.local/share/pnpm:$PATH"
cd "$(dirname "$0")"
pnpm install --frozen-lockfile
NEXT_PUBLIC_API_AUTH_URL="https://api-auth-staging.nidalheim.com" \
exec pnpm dev --port 3013
