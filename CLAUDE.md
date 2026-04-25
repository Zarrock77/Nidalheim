# CLAUDE.md

## Projet

Nidalheim — monorepo backend pour un jeu UE5 (dark fantasy nordique). Auth JWT HS256, API WebSocket temps-réel avec PNJ IA (text + voice), site vitrine Next.js, docs Nextra admin-only.

## Structure

```
services/api-auth/   # API REST auth (Express 5, JWT HS256, bcrypt, Redis, PostgreSQL)
services/api-game/   # API WebSocket temps-réel (ws, Groq LLM, Deepgram STT, Cartesia TTS)
services/db/         # Schema + migrations PostgreSQL (Drizzle ORM)
web/site/            # Site vitrine + register/login (Next.js 16, React 19, Tailwind 4)
web/docs/            # Documentation interne (Nextra 4, admin-only)
infra/               # Docker Compose, Nginx reverse proxy, .env
infra/p4d/           # Serveur Perforce (assets UE5) — stack Docker séparé
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
cd web/docs && pnpm dev --port 3004     # :3000 conflict avec site, utiliser un autre port

# DB
cd services/db
pnpm generate    # générer migration après modif schema
pnpm migrate     # appliquer migrations
pnpm studio      # interface Drizzle Studio
pnpm push        # sync direct (dev uniquement, bypass migrations)

# Lint (web uniquement)
cd web/site && pnpm lint
cd web/docs && pnpm lint

# Build
cd services/api-auth && npm run build
cd web/site && pnpm build
cd web/docs && pnpm build   # génère aussi l'index pagefind via postbuild
```

## Conventions de code

- **Quotes** : double quotes (`"`)
- **Semicolons** : oui, toujours
- **Indentation** : 2 espaces
- **TypeScript strict** : activé partout sauf `services/api-game` (JavaScript ESM pur)
- **Imports backend** : relatifs avec extension `.js` (`import foo from './routes/register.js'`)
- **Imports frontend** : alias `@/` vers `src/` (`import { X } from "@/components/X"`)
- **Composants React** : PascalCase, server components par défaut, `"use client"` si nécessaire
- **Variables/fonctions** : camelCase
- **Fichiers schema DB** : kebab-case (`player-profiles.ts`)

## Package managers

- **pnpm** : `web/site`, `web/docs`, `services/api-game`, `services/db`
- **npm** : `services/api-auth`

Pas de workspace racine. Chaque service gère ses deps indépendamment.

## Git

- Branche principale : `main` (auto-deploy sur push)
- Commits : conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`)
- Ne pas committer : `.env`, `keys/`, `node_modules/`, `dist/`, `.next/`, `.claude/`

## Variables d'environnement

Source de vérité : `infra/.env` (copié depuis `infra/.env.example`, gitignored). Les services `api-auth`, `api-game` et `db` chargent ce fichier via `config({ path: "../../infra/.env" })`.

| Variable | Utilisateur | Description |
|----------|-------------|-------------|
| `POSTGRES_USER` / `PASSWORD` / `DB` | postgres, services | Credentials DB |
| `DATABASE_URL` | api-auth, api-game, db-migrate | Connexion Postgres (construit depuis `POSTGRES_*` dans le compose) |
| `REDIS_URL` | api-auth | Connexion Redis (default `redis://localhost:6379`) |
| `JWT_SECRET` | api-auth, api-game | Secret HS256 partagé entre les deux services |
| `JWT_ACCESS_TOKEN_EXPIRY` / `REFRESH_TOKEN_EXPIRY` | api-auth | Durées tokens (`15m` / `7d` par défaut) |
| `CORS_ORIGINS` | api-auth | Liste séparée par virgules (default `https://www.nidalheim.com,http://localhost:3000`) |
| `AUTH_SECRET` | web/docs | Secret NextAuth |
| `AUTH_API_URL` | web/docs | URL de api-auth (default `http://localhost:3001`) |
| `NEXT_PUBLIC_API_AUTH_URL` | web/site | URL de api-auth, inliné au build (default fallback `https://api-auth.nidalheim.com`) |
| `OPENAI_API_KEY` | api-game | Clé OpenAI (fallback LLM, jamais utilisé en pratique) |
| `DEEPGRAM_API_KEY` | api-game | Speech-to-text (voice pipeline) |
| `LLM_API_KEY` | api-game | Clé Groq (text + voice chat) |
| `LLM_BASE_URL` / `LLM_MODEL` | api-game | Override LLM (default Groq + llama-3.1-8b-instant) |
| `TTS_PROVIDER` | api-game | `cartesia` (default) ou `elevenlabs` |
| `CARTESIA_API_KEY` / `CARTESIA_VOICE_ID` / `CARTESIA_MODEL` | api-game | Provider TTS principal |
| `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` | api-game | Provider TTS fallback (optionnel) |
| `TTS_LANGUAGE_CODE` | api-game | Default `fr` |

Connexion locale par défaut : `postgresql://nidalheim:<password>@localhost:5432/nidalheim`.

## Architecture des services

### api-auth (Express 5 + TypeScript + npm)
- Routes REST classiques : `POST /register`, `POST /login`, `POST /refresh`, `POST /logout`, `GET /health`
- Routes Device Authorization Grant (RFC 8628) pour le client UE5 :
  - `POST /device/authorize` (no auth) → `{ device_code, user_code, verification_uri, ... }`
  - `POST /device/lookup` (Bearer auth) → metadata pour la page d'approbation
  - `POST /device/approve` (Bearer auth) → mint un nouveau couple de tokens pour le device
  - `POST /device/deny` (Bearer auth) → refuse l'autorisation
  - `POST /device/token` (no auth) → poll, retourne tokens si approved
  - State Redis avec TTL 10 min, user_code 8 chars sur alphabet sans I/O/0/1
- Login accepte **username ou email** comme identifiant
- JWT **HS256** avec `JWT_SECRET` partagé (le endpoint JWKS a été retiré)
- Refresh tokens stockés dans Redis avec rotation (TTL 7 jours)
- bcrypt 12 rounds
- Users et `player_profiles` dans PostgreSQL (schéma partagé avec `services/db`)

### api-game (WebSocket + JavaScript ESM + pnpm)
- Endpoints WS : `/text` (chat LLM simple) et `/audio` (pipeline voice streaming)
- Auth par query param `?token=<JWT>` (vérif HS256 avec `JWT_SECRET`)
- Sélection du PNJ via query param `?npc=<id>` (fallback `default` si absent ou inconnu)
- Heartbeat ping/pong toutes les 30s
- **`/text`** : Groq Llama 3.1 8B par défaut, historique persistant (table `chat_messages` scopée par `(user_id, npc_id)`)
- **`/audio`** : Deepgram STT → Groq Llama 3.3 70B (streaming) → Cartesia TTS (streaming, persistent WS) ou ElevenLabs (per-turn)
- Client envoie `audio_config` pour régler le sample rate STT, `COMMIT` pour finaliser une utterance
- Historique conversationnel par PNJ partagé entre `/text` et `/audio` via `ConversationStore` (Postgres)
- Chaque PNJ a son propre `system_prompt` + `voice_id` + `llm_model` dans la table `npcs` (cache mémoire process via `npcStore`)

### db (Drizzle ORM + pnpm)
- Schéma dans `src/schema/` : `users.ts`, `player-profiles.ts`, `chat-messages.ts`, `npcs.ts`
- Migrations dans `migrations/` ; le seed du NPC `default` est inclus dans `0002_*` (INSERT ... ON CONFLICT DO NOTHING)
- Config : `drizzle.config.ts` (lit `../../infra/.env`)

### web/site (Next.js 16 App Router)
- Register, login, UI vitrine, framer-motion, MDX patch notes
- Appelle `api-auth` via `NEXT_PUBLIC_API_AUTH_URL` (inliné au build, fallback prod hardcodé)

### web/docs (Nextra 4.6 + NextAuth)
- Next 16 App Router avec catch-all route `src/app/docs/[[...mdxPath]]/page.tsx`
- Contenu MDX dans `content/` (racine du package docs)
- Proxy/middleware auth : refuse tout user dont `role !== "admin"`
- Search désactivée (nécessite build pagefind)

## Auth — flow complet

1. `web/site` → `POST /register` ou `POST /login` sur `api-auth`
2. `api-auth` renvoie `{ accessToken, refreshToken, user }`
3. Le client stocke les tokens (UE5 via `NidalheimAuthStorage`, web via NextAuth session)
4. UE5 connecte `api-game` via `wss://api-game.nidalheim.com/text?token=<accessToken>`
5. `api-game` vérifie le JWT avec `JWT_SECRET` (HS256) — même secret que `api-auth`
6. Refresh : `POST /refresh` avec le refresh token → rotation en Redis

## CI/CD — registry-based

Workflow `.github/workflows/deploy.yml` sur push `main` :

1. **Job `build`** (matrix sur 5 services) :
   - `docker build` + `docker push` vers `ghcr.io/epitechpromo2027/nidalheim-<service>:{sha,latest}`
   - Cache GH Actions (`type=gha`) par service
2. **Job `deploy`** (après build) :
   - SSH sur VPS via `appleboy/ssh-action`
   - Écrit `infra/.env` depuis les GH Secrets
   - `docker login ghcr.io` avec `GHCR_PULL_TOKEN`
   - `docker compose pull && up -d --remove-orphans`
   - `docker compose run --rm db-migrate`
   - `docker image prune -f`

### Secrets GH requis
- `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` — accès SSH
- `GHCR_PULL_TOKEN` — PAT classique scope `read:packages` pour pull côté VPS (inutile si repo public)
- `OPENAI_API_KEY`, `DEEPGRAM_API_KEY`, `LLM_API_KEY`, `CARTESIA_API_KEY`, `CARTESIA_VOICE_ID`
- `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` (optionnels, peuvent être vides)
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- `AUTH_SECRET`, `JWT_SECRET`

## Domaines (production)

- `www.nidalheim.com` → site
- `docs.nidalheim.com` → docs (admin-only)
- `api-auth.nidalheim.com` → auth REST
- `api-game.nidalheim.com` → game WebSocket (nginx avec `proxy_read_timeout 86400s`)

## Points d'attention

- Pas de tests configurés — pas de framework de test en place
- ESLint uniquement sur `web/site` et `web/docs`, pas sur les backends
- Pas de Prettier configuré
- Line endings mixtes (LF/CRLF)
- Le `NEXT_PUBLIC_API_AUTH_URL` de `web/site` n'est pas passé au build Docker (utilise le fallback prod hardcodé)
- `web/docs` utilise `src/proxy.ts` (renommé depuis `middleware.ts` en Next 16)
