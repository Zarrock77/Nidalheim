# Nidalheim

Backend monorepo pour le jeu Nidalheim (UE5) : authentification JWT, API temps-reel WebSocket avec PNJ IA, site vitrine, documentation et infrastructure Docker.

## Architecture

```
nidalheim/
├── services/
│   ├── api-auth/      # API REST d'authentification (Express, JWT RS256)
│   ├── api-game/      # API WebSocket temps-reel (OpenAI, PNJ IA)
│   ├── db/            # Schema PostgreSQL et migrations (Drizzle ORM)
│   └── p4d/           # Serveur Perforce (gestion d'assets UE5)
├── web/
│   ├── site/          # Site vitrine (Next.js 16, Tailwind)
│   └── docs/          # Documentation API et guides (Nextra)
└── infra/
    ├── docker-compose.yml
    ├── nginx/         # Reverse proxy
    └── .env.example
```

## Stack technique

| Couche | Technologies |
|--------|-------------|
| Runtime | Node.js 22, TypeScript |
| Backend | Express 5, WebSocket (ws), OpenAI API |
| Frontend | Next.js 16, React 19, Tailwind CSS 4, Nextra |
| Base de donnees | PostgreSQL 16, Redis 7 |
| ORM | Drizzle ORM |
| Auth | JWT RS256, bcrypt |
| Infra | Docker, Nginx, GitHub Actions |

## Demarrage rapide

### Pre-requis

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Node.js 22+](https://nodejs.org/)
- [pnpm](https://pnpm.io/)

### Lancer l'environnement local

```bash
# 1. Configurer les variables d'environnement
cp infra/.env.example infra/.env
# Editer infra/.env avec vos valeurs

# 2. Lancer PostgreSQL et Redis
cd infra
docker compose up -d postgres redis

# 3. Executer les migrations
cd ../services/db
pnpm install
pnpm migrate

# 4. Lancer un service en dev
cd ../api-auth
pnpm install
pnpm dev        # http://localhost:3001

cd ../api-game
pnpm install
pnpm start      # ws://localhost:3002
```

### Deploiement complet (Docker)

```bash
cd infra
docker compose build
docker compose up -d
docker compose run --rm db-migrate
```

## Domaines (production)

| Domaine | Service |
|---------|---------|
| `www.nidalheim.com` | Site vitrine |
| `docs.nidalheim.com` | Documentation |
| `api-auth.nidalheim.com` | API Auth (REST) |
| `api-game.nidalheim.com` | API Game (WebSocket) |

## CI/CD

Le workflow GitHub Actions (`.github/workflows/deploy.yml`) deploie automatiquement sur le VPS a chaque push sur `main` :

1. SSH sur le VPS
2. `git pull` + generation du `.env` depuis les secrets GitHub
3. Build et restart des containers Docker
4. Execution des migrations

## Base de donnees

Deux tables principales gerees par Drizzle ORM :

- **users** : comptes joueurs (id, username, email, password_hash, role)
- **player_profiles** : donnees de jeu (xp, level, faction, reputation, quests_done)

```bash
# Generer une migration apres modification du schema
cd services/db && pnpm generate

# Appliquer les migrations
pnpm migrate

# Interface Drizzle Studio
pnpm studio
```

## Connexion locale

```
PostgreSQL : postgresql://nidalheim:changeme@localhost:5432/nidalheim
Redis      : redis://localhost:6379
```
