FROM node:22-slim AS base
WORKDIR /app
RUN corepack enable

FROM base AS dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM node:22-slim AS run
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3002
EXPOSE 3002

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 appuser

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

USER appuser

CMD ["node", "src/index.js"]
