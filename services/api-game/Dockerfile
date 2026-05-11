FROM node:22-slim AS base
WORKDIR /app
RUN corepack enable

FROM base AS dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM base AS build
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

FROM node:22-slim AS run
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3002
EXPOSE 3002

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 appuser

COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

USER appuser

CMD ["node", "dist/index.js"]
