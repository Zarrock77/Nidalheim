# Nidalheim

Backend monorepo du jeu **Nidalheim** (UE5, dark fantasy nordique) : authentification JWT, API WebSocket temps-réel avec PNJ IA (voice + text), site vitrine, documentation interne et infrastructure Docker.

## Architecture

```
nidalheim/
├── services/
│   ├── api-auth/             # API REST d'authentification (Express 5, JWT HS256, Postgres, Redis)
│   ├── api-game/             # API WebSocket temps-réel (PNJ IA text + voice)
│   ├── db/                   # Schéma PostgreSQL et migrations (Drizzle ORM)
│   ├── site/                 # Site vitrine + register/login (Next.js 16, Tailwind 4)
│   └── docs/                 # Documentation interne (Nextra 4, admin-only)
└── infra/
    ├── docker-compose.yml
    ├── nginx/                # Reverse proxy (4 sous-domaines + TLS direct api-game)
    ├── init-letsencrypt.sh   # Bootstrap Let's Encrypt (1× sur le VPS)
    ├── p4d/                  # Serveur Perforce (assets UE5) — stack Docker séparé
    └── .env.example
```

## Stack

| Couche | Technologies |
|--------|--------------|
| Runtime | Node.js 22, TypeScript (api-auth, db, site, docs), JavaScript ESM (api-game) |
| Backend | Express 5, `ws` (WebSocket) |
| Frontend | Next.js 16, React 19, Tailwind CSS 4, Nextra 4 (docs) |
| Auth | JWT HS256, bcrypt 12 rounds, refresh tokens en Redis |
| Base de données | PostgreSQL 16 (via Drizzle ORM), Redis 7 |
| IA — text chat | Groq (Llama 3.1 8B) via API OpenAI-compatible |
| IA — voice chat | Deepgram (STT) → Groq Llama 3.3 70B (LLM) → Cartesia ou ElevenLabs (TTS) |
| Infra | Docker Compose, Nginx, GitHub Actions, GHCR |

## Démarrage rapide

### Prérequis

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Node.js 22+](https://nodejs.org/)
- [pnpm 10+](https://pnpm.io/)
- `npm` (pour `services/api-auth` uniquement)

### 1 — Variables d'environnement

```bash
cp infra/.env.example infra/.env
# Remplir OPENAI_API_KEY, DEEPGRAM_API_KEY, LLM_API_KEY (Groq),
# CARTESIA_API_KEY + CARTESIA_VOICE_ID, POSTGRES_*, AUTH_SECRET, JWT_SECRET.
```

Génère un `JWT_SECRET` aléatoire :
```bash
openssl rand -base64 64
```

### 2 — Infra locale

```bash
cd infra
docker compose up -d postgres redis
```

### 3 — Migrations DB

```bash
cd services/db
pnpm install
pnpm migrate
```

### 4 — Lancer les services (chacun dans son terminal)

```bash
cd services/api-auth  && npm install  && npm run dev    # :3001
cd services/api-game  && pnpm install && pnpm start     # :3002
cd services/site      && pnpm install && pnpm dev       # :3000
cd services/docs      && pnpm install && pnpm dev       # :3000 (ou premier port libre)
```

> `services/site` et `services/docs` veulent tous les deux le port `3000`. Lance le second avec `--port 3001` (attention au conflit avec `api-auth`) ou un port libre :
> ```bash
> cd services/docs && pnpm dev --port 3004
> ```

### 5 — S'enregistrer + devenir admin

1. Register sur http://localhost:3000/register (sur `services/site`)
2. Passer son user en admin pour accéder à `services/docs` :
   ```sql
   UPDATE users SET role = 'admin' WHERE username = 'ton_username';
   ```
   (via `pnpm studio` dans `services/db` ou `docker compose exec postgres psql`)

## Domaines (production)

| Domaine | Service | Terminaison TLS |
|---------|---------|-----------------|
| `www.nidalheim.com` | Site vitrine | Cloudflare (proxied) |
| `docs.nidalheim.com` | Documentation interne (admin-only) | Cloudflare (proxied) |
| `api-auth.nidalheim.com` | API Auth (REST) | Cloudflare (proxied) |
| `api-game.nidalheim.com` | API Game (WebSocket) | **VPS direct (Let's Encrypt)** |

`api-game` bypass volontairement Cloudflare (DNS-only) pour éviter le cap WebSocket free. Cert auto-renouvelé par le service `certbot` du compose, bootstrap initial via `infra/init-letsencrypt.sh`. Détails : [docs/deploy](https://docs.nidalheim.com/docs/backend/deploy#reverse-proxy-nginx).

## Domaines (staging)

| Domaine | Service | Runtime |
|---------|---------|---------|
| `www-staging.nidalheim.com` | Site vitrine | Process host `pnpm dev` port `3013` |
| `docs-staging.nidalheim.com` | Documentation | Process host `pnpm dev` port `3014` |
| `api-auth-staging.nidalheim.com` | API Auth | Process host `npm run dev` port `3011` |
| `api-game-staging.nidalheim.com` | API Game | Process host `pnpm dev` port `3012`, TLS direct VPS |

La staging utilise un checkout VPS separe : `~/Nidalheim-staging`.
Les services staging sont lances manuellement via les scripts `start-staging.sh` et utilisent la base `${POSTGRES_DB}_staging`.

## CI/CD

Le workflow `.github/workflows/deploy.yml` :

- Push sur `main` : build/push des images Docker vers GHCR puis deploiement production via `docker compose`.
- Push sur `staging` : mise a jour de `~/Nidalheim-staging`, installation des deps, migration de la DB staging. Aucun restart automatique des scripts staging.

Rollback en une ligne :
```bash
ssh vps "cd ~/Nidalheim/infra && IMAGE_TAG=<sha-antérieur> docker compose up -d"
```

## Base de données

| Table | Description |
|-------|-------------|
| `users` | Comptes joueurs (id, username, email, password_hash, role) |
| `player_profiles` | Données de jeu (xp, level, faction, reputation, quests_done) |
| `chat_messages` | Historique NPC (user_id, role, content, channel) |

```bash
cd services/db
pnpm generate    # générer une migration après modif du schema
pnpm migrate     # appliquer les migrations
pnpm studio      # Drizzle Studio
pnpm push        # sync direct (dev uniquement)
```

## Documentation développeur

Une fois `services/docs` lancé et ton compte passé en `admin`, la doc complète (architecture, API, auth, voice pipeline, deploy) est sur http://localhost:3000/docs.

## Licence

Propriétaire — Epitech EIP 2027.
