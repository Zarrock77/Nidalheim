# api-auth

Service d'authentification REST avec JWT RS256 pour le projet Nidalheim.

## Stack

- **Express 5.1** — framework HTTP
- **jsonwebtoken** — signature/verification JWT avec cles RSA
- **bcrypt** — hachage des mots de passe
- **ioredis** — stockage des refresh tokens dans Redis
- **better-sqlite3** — base locale SQLite (fallback)
- **TypeScript** + **tsx**

## Endpoints

| Methode | Route | Description |
|---------|-------|-------------|
| `POST` | `/register` | Inscription (username, email, password) |
| `POST` | `/login` | Connexion, retourne access + refresh tokens |
| `POST` | `/refresh` | Renouveler l'access token |
| `POST` | `/logout` | Deconnexion (invalide le refresh token) |
| `GET` | `/jwks` | Cles publiques JWKS |
| `GET` | `/health` | Health check |

## Lancer en dev

```bash
# Pre-requis : Redis et PostgreSQL en cours d'execution
pnpm install

# Generer les cles RSA (premiere fois)
pnpm generate-keys

# Lancer le serveur (hot-reload)
pnpm dev
```

Le serveur demarre sur le port `3001`.

## Variables d'environnement

| Variable | Description | Defaut |
|----------|-------------|--------|
| `PORT` | Port du serveur | `3001` |
| `JWT_PRIVATE_KEY_PATH` | Chemin vers la cle privee RSA | `keys/private.pem` |
| `JWT_PUBLIC_KEY_PATH` | Chemin vers la cle publique RSA | `keys/public.pem` |
| `JWT_ACCESS_TOKEN_EXPIRY` | Duree de l'access token | `15m` |
| `JWT_REFRESH_TOKEN_EXPIRY` | Duree du refresh token | `7d` |
| `REDIS_URL` | URL Redis | `redis://localhost:6379` |
| `DATABASE_URL` | URL PostgreSQL | — |

## Scripts

```bash
pnpm dev             # Dev avec hot-reload (tsx watch)
pnpm build           # Compilation TypeScript
pnpm start           # Production (node dist/)
pnpm generate-keys   # Generer les cles RSA
```

## Architecture

```
src/
├── index.ts          # Point d'entree, setup Express
├── routes/
│   ├── register.ts   # Inscription
│   ├── login.ts      # Connexion
│   ├── refresh.ts    # Refresh token
│   ├── logout.ts     # Deconnexion
│   └── jwks.ts       # Endpoint JWKS
├── services/
│   ├── db.ts         # Connexion SQLite
│   ├── user.ts       # Logique utilisateur
│   ├── jwt.ts        # Signature/verification JWT
│   └── redis.ts      # Gestion refresh tokens
└── scripts/
    └── generate-keys.ts
```
