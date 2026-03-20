FROM node:22-slim AS base
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json drizzle.config.ts ./
COPY src ./src
COPY migrations ./migrations

CMD ["npx", "tsx", "src/migrate.ts"]
