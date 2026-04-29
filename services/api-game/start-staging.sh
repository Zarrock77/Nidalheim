#!/bin/bash
set -e
cd "$(dirname "$0")"
set -a && . /home/ubuntu/Nidalheim/infra/.env && set +a
PORT=3012 \
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}_staging" \
exec pnpm start
