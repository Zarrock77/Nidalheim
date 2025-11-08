# ---------------- Base ----------------
FROM node:22-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable

# ---------------- Dependencies ----------------
FROM base AS dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---------------- Build ----------------
FROM base AS build
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

# ---------------- Runtime ----------------
FROM node:22-slim AS run
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

# User non-root
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs \
 && mkdir .next && chown nextjs:nodejs .next

# Copie du standalone (plus léger)
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/public ./public
COPY --from=build /app/.next/static ./.next/static

USER nextjs

# Variables dynamiques à l'exécution (runtime)
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
