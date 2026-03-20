# db

Schema PostgreSQL et systeme de migrations pour Nidalheim, base sur Drizzle ORM.

## Stack

- **Drizzle ORM 0.39** — ORM TypeScript
- **Drizzle Kit** — generation et gestion des migrations
- **pg** — driver PostgreSQL (node-postgres)
- **TypeScript** + **tsx**

## Schema

### users

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | `uuid` (PK) | Identifiant unique, auto-genere |
| `username` | `varchar(50)` | Nom d'utilisateur, unique |
| `email` | `varchar(255)` | Email, unique |
| `password_hash` | `text` | Mot de passe hache (bcrypt) |
| `role` | `varchar(20)` | Role (`player` par defaut) |
| `created_at` | `timestamp` | Date de creation |

### player_profiles

| Colonne | Type | Description |
|---------|------|-------------|
| `user_id` | `uuid` (PK, FK) | Reference vers `users.id` (cascade delete) |
| `xp` | `integer` | Points d'experience (defaut : 0) |
| `level` | `integer` | Niveau du joueur (defaut : 1) |
| `faction` | `varchar(50)` | Faction du joueur |
| `reputation` | `jsonb` | Reputation aupres des factions |
| `quests_done` | `jsonb` | Liste des quetes terminees |
| `updated_at` | `timestamp` | Derniere mise a jour |

## Scripts

```bash
# Generer une migration apres modification du schema
pnpm generate

# Appliquer les migrations
pnpm migrate

# Ouvrir Drizzle Studio (interface web)
pnpm studio

# Pousser le schema directement (sans migration)
pnpm push
```

## Configuration

Le fichier `drizzle.config.ts` lit les credentials depuis `infra/.env` ou les variables d'environnement :

| Variable | Defaut |
|----------|--------|
| `POSTGRES_USER` | `nidalheim` |
| `POSTGRES_PASSWORD` | `changeme` |
| `POSTGRES_HOST` | `localhost` |
| `POSTGRES_PORT` | `5432` |
| `POSTGRES_DB` | `nidalheim` |

Ou directement via `DATABASE_URL`.
