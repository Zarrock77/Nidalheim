#!/bin/bash
set -e
cd "$(dirname "$0")"
pnpm install
NEXT_PUBLIC_API_AUTH_URL="https://api-auth-staging.nidalheim.com" \
exec pnpm dev --port 3013
