# infra

Configuration d'infrastructure Docker pour le deploiement de Nidalheim.

## Services Docker

| Service | Image | Port | Description |
|---------|-------|------|-------------|
| `postgres` | `postgres:16-alpine` | `5432` | Base de donnees principale |
| `redis` | `redis:7-alpine` | `6379` | Stockage des sessions/tokens |
| `api-auth` | build local | `3001` (interne) | API d'authentification |
| `api-game` | build local | `3002` (interne) | API de jeu WebSocket |
| `nidalheim-site` | build local | `3000` (interne) | Site vitrine |
| `nidalheim-docs` | build local | `3000` (interne) | Documentation |
| `db-migrate` | build local | — | Migrations (run once) |
| `nginx` | `nginx:stable-alpine` | `80` | Reverse proxy |

## Nginx — Routage par domaine

| Domaine | Upstream |
|---------|----------|
| `www.nidalheim.com` | `nidalheim-site:3000` |
| `nidalheim.com` | redirect vers `www.` |
| `docs.nidalheim.com` | `nidalheim-docs:3000` |
| `api-auth.nidalheim.com` | `nidalheim-api-auth:3001` |
| `api-game.nidalheim.com` | `nidalheim-api-game:3002` (WebSocket) |

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
docker compose logs -f postgres
```

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
