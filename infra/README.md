# infra

Configuration d'infrastructure Docker pour le deploiement de Nidalheim.

## Services Docker

| Service | Image | Port host | Description |
|---------|-------|-----------|-------------|
| `postgres` | `postgres:16-alpine` | `5432` | Base de donnees principale |
| `redis` | `redis:7-alpine` | `6379` | Stockage des sessions/tokens |
| `api-auth` | build local | `3001` (interne) | API d'authentification |
| `api-game` | build local | `3002` (interne) | API de jeu WebSocket |
| `nidalheim-site` | build local | `3000` (interne) | Site vitrine |
| `nidalheim-docs` | build local | `3000` (interne) | Documentation |
| `db-migrate` | build local | — | Migrations (run once) |
| `nginx` | `nginx:stable-alpine` | `80`, `443` | Reverse proxy + TLS direct pour `api-game` |
| `certbot` | `certbot/certbot` | — | Renouvellement auto Let's Encrypt (boucle 12h) |

## Nginx — Routage par domaine

| Domaine | Upstream | Terminaison TLS |
|---------|----------|-----------------|
| `www.nidalheim.com` | `nidalheim-site:3000` | Cloudflare (proxied) |
| `nidalheim.com` | redirect vers `www.` | Cloudflare (proxied) |
| `docs.nidalheim.com` | `nidalheim-docs:3000` | Cloudflare (proxied) |
| `api-auth.nidalheim.com` | `nidalheim-api-auth:3001` | Cloudflare (proxied) |
| `api-game.nidalheim.com` | `nidalheim-api-game:3002` (WebSocket) | **VPS direct (Let's Encrypt)** |

`api-game` est volontairement servi **sans Cloudflare** (DNS-only) pour éviter le cap WebSocket de Cloudflare free (idle timeout ~100s, buffering audio). Le VPS termine le TLS lui-même via un cert Let's Encrypt obtenu en HTTP-01 webroot.

## Commandes

```bash
# Dev local (DB + cache seulement)
docker compose up -d postgres redis

# Deploiement complet
docker compose build
docker compose up -d
docker compose run --rm db-migrate

# Voir les logs
docker compose logs -f api-auth
docker compose logs -f nginx
docker compose logs -f certbot
```

## Bootstrap Let's Encrypt — à faire une seule fois sur le VPS

```bash
chmod +x init-letsencrypt.sh
./init-letsencrypt.sh
```

Le script :
1. Crée un cert dummy temporaire (sinon nginx ne démarre pas avec `listen 443 ssl`)
2. Démarre nginx
3. Lance `certbot certonly --webroot` pour obtenir le vrai cert
4. Reload nginx avec le vrai cert

Après le bootstrap, le service `certbot` du compose tourne en boucle et appelle `certbot renew` toutes les 12h. Nginx se reload tout seul toutes les 6h pour prendre en compte les certs renouvelés.

> **Important** : ce bootstrap doit être fait **avant** le premier déploiement CI/CD qui inclut les changements TLS, sinon nginx crashera (cert manquant).

## Configuration

Copier `.env.example` vers `.env` et renseigner les valeurs :

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `POSTGRES_USER` | Utilisateur PostgreSQL |
| `POSTGRES_PASSWORD` | Mot de passe PostgreSQL |
| `POSTGRES_DB` | Nom de la base |
| `OPENAI_API_KEY` | Cle API OpenAI |
| `NIDALHEIM_API_KEY` | Cle d'authentification API interne |
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cle anonyme Supabase |

## Volumes persistants

- `postgres-data` (Docker volume) — données Postgres
- `redis-data` (Docker volume) — données Redis
- `./certbot/conf` (bind mount) — certs Let's Encrypt + config (gitignored)
- `./certbot/www` (bind mount) — webroot pour le challenge HTTP-01 (gitignored)
