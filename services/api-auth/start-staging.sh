#!/bin/bash
set -e
cd "$(dirname "$0")"
set -a && . /home/ubuntu/Nidalheim/infra/.env && set +a
PORT=3011 \
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}_staging" \
REDIS_URL="redis://localhost:6379/1" \
CORS_ORIGINS="https://www-staging.nidalheim.com,https://docs-staging.nidalheim.com" \
DEVICE_VERIFICATION_BASE_URL="https://www-staging.nidalheim.com" \
exec npm run dev
