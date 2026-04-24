# Nidalheim

Backend monorepo du jeu **Nidalheim** (UE5, dark fantasy nordique) : authentification JWT, API WebSocket temps-réel avec PNJ IA (voice + text), site vitrine, documentation interne et infrastructure Docker.

## Architecture

```
nidalheim/
├── services/
│   ├── api-auth/      # API REST d'authentification (Express 5, JWT HS256, Postgres, Redis)
│   ├── api-game/      # API WebSocket temps-réel (PNJ IA text + voice)
│   └── db/            # Schéma PostgreSQL et migrations (Drizzle ORM)
├── web/
│   ├── site/          # Site vitrine + register/login (Next.js 16, Tailwind 4)
│   └── docs/          # Documentation interne (Nextra 4, admin-only)
└── infra/
    ├── docker-compose.yml
    ├── nginx/         # Reverse proxy (4 sous-domaines)
    ├── p4d/           # Serveur Perforce (assets UE5) — stack Docker séparé
    └── .env.example
```

## Stack

| Couche | Technologies |
|--------|--------------|
| Runtime | Node.js 22, TypeScript (api-auth, db, web/*), JavaScript ESM (api-game) |
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
cd web/site           && pnpm install && pnpm dev       # :3000
cd web/docs           && pnpm install && pnpm dev       # :3000 (ou premier port libre)
```

> `web/site` et `web/docs` veulent tous les deux le port `3000`. Lance le second avec `--port 3001` (attention au conflit avec `api-auth`) ou un port libre :
> ```bash
> cd web/docs && pnpm dev --port 3004
> ```

### 5 — S'enregistrer + devenir admin

1. Register sur http://localhost:3000/register (sur `web/site`)
2. Passer son user en admin pour accéder à `web/docs` :
   ```sql
   UPDATE users SET role = 'admin' WHERE username = 'ton_username';
   ```
   (via `pnpm studio` dans `services/db` ou `docker compose exec postgres psql`)

## Domaines (production)

| Domaine | Service |
|---------|---------|
| `www.nidalheim.com` | Site vitrine |
| `docs.nidalheim.com` | Documentation interne (admin-only) |
| `api-auth.nidalheim.com` | API Auth (REST) |
| `api-game.nidalheim.com` | API Game (WebSocket) |

## CI/CD

Le workflow `.github/workflows/deploy.yml` sur push `main` :

1. **Build matrix** : build et push de 5 images Docker vers `ghcr.io/epitechpromo2027/nidalheim-<service>:{sha,latest}` en parallèle, avec cache GH Actions.
2. **Deploy** : SSH sur le VPS, génération de `infra/.env` depuis les GitHub Secrets, `docker login ghcr.io`, `docker compose pull && up -d`, puis `docker compose run --rm db-migrate`.

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

Une fois `web/docs` lancé et ton compte passé en `admin`, la doc complète (architecture, API, auth, voice pipeline, deploy) est sur http://localhost:3000/docs.

## Licence

Propriétaire — Epitech EIP 2027.
