# CLAUDE.md

## Projet

Nidalheim — monorepo backend pour un jeu UE5 (dark fantasy nordique). Auth JWT, API WebSocket avec PNJ IA (OpenAI), site vitrine Next.js, docs Nextra.

## Structure

```
services/api-auth/   # API REST auth (Express 5, JWT RS256, bcrypt, Redis, PostgreSQL)
services/api-game/   # API WebSocket temps-reel (ws, OpenAI, JavaScript)
services/db/         # Schema + migrations PostgreSQL (Drizzle ORM)
services/p4d/        # Serveur Perforce (assets UE5)
web/site/            # Site vitrine (Next.js 16, React 19, Tailwind 4)
web/docs/            # Documentation (Nextra 4.6, pagefind)
infra/               # Docker Compose, Nginx, .env
```

## Commandes

```bash
# Infra locale
cd infra && docker compose up -d postgres redis

# Migrations
cd services/db && pnpm migrate

# Dev services
cd services/api-auth && npm run dev     # :3001
cd services/api-game && pnpm start      # :3002
cd web/site && pnpm dev                 # :3000
cd web/docs && pnpm dev                 # :3000

# DB
cd services/db
pnpm generate    # generer migration apres modif schema
pnpm migrate     # appliquer migrations
pnpm studio      # interface Drizzle Studio

# Lint (web uniquement)
cd web/site && pnpm lint
cd web/docs && pnpm lint

# Build
cd services/api-auth && npm run build
cd web/site && pnpm build
```

## Conventions de code

- **Quotes** : double quotes (`"`)
- **Semicolons** : oui, toujours
- **Indentation** : 2 espaces
- **TypeScript strict** : active partout
- **Imports backend** : relatifs avec extension `.js` (`import foo from './routes/register.js'`)
- **Imports frontend** : alias `@/` vers `src/` (`import { X } from "@/components/X"`)
- **Composants React** : PascalCase, server components par defaut, `"use client"` si necessaire
- **Variables/fonctions** : camelCase
- **Fichiers schema DB** : kebab-case (`player-profiles.ts`)

## Package managers

- **pnpm** : `web/site`, `web/docs`, `services/api-game`, `services/db`
- **npm** : `services/api-auth`

Pas de workspace racine. Chaque service gere ses deps independamment.

## Git

- Branche principale : `main` (auto-deploy sur push)
- Commits : conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`)
- Ne pas committer : `.env`, `keys/`, `node_modules/`, `dist/`, `.next/`, `.claude/`

## Variables d'environnement

Toutes chargees via `dotenv`. Fichier principal : `infra/.env` (copie de `infra/.env.example`).

| Variable | Usage |
|----------|-------|
| `POSTGRES_USER` / `PASSWORD` / `DB` | PostgreSQL |
| `OPENAI_API_KEY` | PNJ IA (api-game) |
| `NIDALHEIM_API_KEY` | Auth clients WebSocket |
| `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` | Supabase (site, docs) |

Connexion locale : `postgresql://nidalheim:changeme@localhost:5432/nidalheim`

## Architecture des services

### api-auth (Express 5 + TypeScript)
- Routes : `src/routes/` (register, login, refresh, logout, jwks)
- Services : `src/services/` (jwt.ts, redis.ts, user.ts, db.ts)
- Auth : JWT RS256 avec cles dans `keys/` (generer via `npm run generate-keys`)
- Refresh tokens stockes dans Redis
- Donnees utilisateurs dans PostgreSQL (meme base que services/db)

### api-game (WebSocket + JavaScript)
- Point d'entree unique : `src/index.js`
- Endpoints WS : `/text-chat` (o3-mini), `/audio` (gpt-4o-realtime, Whisper)
- Auth par query param `?apiKey=`
- Heartbeat ping/pong toutes les 30s

### db (Drizzle ORM)
- Schema dans `src/schema/` : `users.ts`, `player-profiles.ts`
- Migrations dans `migrations/`
- Config : `drizzle.config.ts` (lit `infra/.env`)

### web/site et web/docs (Next.js 16)
- App Router, Tailwind CSS 4, TypeScript
- Site : Framer Motion, MDX pour patch notes
- Docs : Nextra theme, pagefind pour la recherche

## CI/CD

GitHub Actions (`.github/workflows/deploy.yml`) :
1. Push sur `main` → SSH sur VPS
2. `git pull` + generation `.env` depuis secrets GitHub
3. `docker compose build && up -d`
4. `docker compose run --rm db-migrate`

## Domaines (production)

- `www.nidalheim.com` → site
- `docs.nidalheim.com` → docs
- `api-auth.nidalheim.com` → auth REST
- `api-game.nidalheim.com` → game WebSocket

## Points d'attention

- Pas de tests configures — pas de framework de test en place
- ESLint uniquement sur web/site et web/docs, pas sur les backends
- Pas de Prettier configure
- Line endings mixtes (LF/CRLF)
