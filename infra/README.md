# infra

Configuration d'infrastructure pour Nidalheim.

La production tourne en Docker Compose. La staging tourne en process host, lancee manuellement via les scripts `start-staging.sh`, et nginx route les domaines staging vers `host.docker.internal`.

## Production Docker

| Service | Image | Port host | Description |
|---------|-------|-----------|-------------|
| `postgres` | `postgres:16-alpine` | `5432` | Postgres partage prod/staging, bases separees |
| `redis` | `redis:7-alpine` | `6379` | Redis prod + Redis DB 1 pour staging auth |
| `api-auth` | GHCR | interne `3001` | API d'authentification |
| `api-game` | GHCR | interne `3002` | API de jeu WebSocket |
| `nidalheim-site` | GHCR | interne `3000` | Site vitrine |
| `nidalheim-docs` | GHCR | interne `3000` | Documentation |
| `db-migrate` | GHCR | run once | Migrations Drizzle |
| `nginx` | `nginx:stable-alpine` | `80`, `443` | Reverse proxy + TLS direct pour api-game |
| `certbot` | `certbot/certbot` | aucun | Renouvellement Let's Encrypt |

## Staging host-process

| Script | Port host | Domaine |
|--------|-----------|---------|
| `services/api-auth/start-staging.sh` | `3011` | `api-auth-staging.nidalheim.com` |
| `services/api-game/start-staging.sh` | `3012` | `api-game-staging.nidalheim.com` |
| `services/site/start-staging.sh` | `3013` | `www-staging.nidalheim.com` |
| `services/docs/start-staging.sh` | `3014` | `docs-staging.nidalheim.com` |

Les scripts doivent etre lances depuis le checkout `~/Nidalheim-staging` pour que la branche `staging` puisse etre deployee sans toucher au checkout prod `~/Nidalheim`.

## Nginx

Production :

| Domaine | Upstream | TLS |
|---------|----------|-----|
| `www.nidalheim.com` | `nidalheim-site:3000` | Cloudflare proxied |
| `nidalheim.com` | redirect vers `www.` | Cloudflare proxied |
| `docs.nidalheim.com` | `nidalheim-docs:3000` | Cloudflare proxied |
| `api-auth.nidalheim.com` | `nidalheim-api-auth:3001` | Cloudflare proxied |
| `api-game.nidalheim.com` | `nidalheim-api-game:3002` | VPS direct Let's Encrypt |

Staging :

| Domaine | Upstream | TLS |
|---------|----------|-----|
| `www-staging.nidalheim.com` | `host.docker.internal:3013` | Cloudflare proxied |
| `docs-staging.nidalheim.com` | `host.docker.internal:3014` | Cloudflare proxied |
| `api-auth-staging.nidalheim.com` | `host.docker.internal:3011` | Cloudflare proxied |
| `api-game-staging.nidalheim.com` | `host.docker.internal:3012` | VPS direct Let's Encrypt |

`api-game` et `api-game-staging` restent en DNS-only sur Cloudflare pour eviter les limites WebSocket/audio de Cloudflare free.

## Commandes

```bash
# Dev local : DB + cache seulement
docker compose up -d postgres redis

# Deploiement production manuel
docker compose pull
docker compose up -d --remove-orphans
docker compose run --rm db-migrate

# Logs production
docker compose logs -f api-auth
docker compose logs -f api-game
docker compose logs -f nginx

# Lancer un service staging manuel
cd ~/Nidalheim-staging/services/api-game
./start-staging.sh
```

## Bootstrap Let's Encrypt

Production :

```bash
chmod +x init-letsencrypt.sh
./init-letsencrypt.sh
```

Staging :

```bash
chmod +x init-letsencrypt-staging.sh
./init-letsencrypt-staging.sh
```

Ces scripts creent un certificat dummy pour permettre a nginx de demarrer, demandent ensuite le vrai certificat Let's Encrypt, puis reload nginx.

## Option systemd staging

```bash
chmod +x setup-staging-systemd.sh
./setup-staging-systemd.sh
```

Le workflow GitHub Actions ne restart pas ces units. Elles sont conservees comme option si on veut plus tard remplacer le demarrage manuel par un demarrage supervise.

## Variables

`infra/.env` est genere par le workflow sur le VPS.

Variables principales :

| Variable | Description |
|----------|-------------|
| `POSTGRES_USER` | Utilisateur PostgreSQL |
| `POSTGRES_PASSWORD` | Mot de passe PostgreSQL |
| `POSTGRES_DB` | Base production, la staging utilise `${POSTGRES_DB}_staging` |
| `OPENAI_API_KEY` | Cle API OpenAI |
| `DEEPGRAM_API_KEY` | Cle API Deepgram |
| `LLM_API_KEY` | Cle LLM provider |
| `LLM_BASE_URL` | URL compatible OpenAI |
| `LLM_MODEL` | Modele LLM |
| `CARTESIA_API_KEY` | Cle Cartesia |
| `CARTESIA_VOICE_ID` | Voix Cartesia |
| `AUTH_SECRET` | Secret NextAuth |
| `JWT_SECRET` | Secret JWT partage api-auth/api-game |

## Volumes persistants

- `postgres-data` : donnees Postgres
- `redis-data` : donnees Redis
- `./certbot/conf` : certificats Let's Encrypt et config
- `./certbot/www` : webroot HTTP-01
