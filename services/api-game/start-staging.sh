#!/bin/bash
set -e
export PATH="$HOME/.local/share/pnpm:$PATH"
cd "$(dirname "$0")"
pnpm install --frozen-lockfile
set -a && . /home/ubuntu/Nidalheim/infra/.env && set +a
PORT=3012 \
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}_staging" \
exec pnpm start
