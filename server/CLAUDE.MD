# Nidalheim Server — Claude.md

## Project overview

Nidalheim is a Nordic-themed semi-open world action-adventure game built in Unreal Engine 5.
This monorepo contains the backend infrastructure: an auth service and an AI-powered game API
that handles NPC dialogue generation, dynamic quests, and game logic via WebSockets and REST.

---

## Monorepo structure

```
nidalheim-server/
├── packages/
│   ├── auth/              # JWT auth service (port 3001)
│   │   ├── src/
│   │   │   ├── routes/    # POST /login, POST /refresh, POST /register
│   │   │   ├── services/  # JWT signing, bcrypt, user logic
│   │   │   └── index.js
│   │   └── package.json
│   │
│   └── game-api/          # AI game API — WebSocket + REST (port 3000)
│       ├── src/
│       │   ├── ws/        # WebSocket handlers, auth middleware
│       │   ├── ai/        # NPC dialogue, quest generation, AI prompts
│       │   ├── routes/    # REST endpoints
│       │   └── index.js
│       └── package.json
│
├── shared/
│   ├── db/                # PostgreSQL connection, migrations (pg / drizzle)
│   ├── models/            # Shared types and schemas
│   └── utils/             # Common helpers
│
├── keys/                  # RSA key files — git-ignored, never commit
├── .env                   # Environment variables — git-ignored
├── docker-compose.yml
└── package.json           # npm workspaces root
```

---

## Tech stack

- **Runtime**: Node.js 20+, ES modules
- **Language**: JavaScript (no TypeScript unless added later)
- **Package manager**: npm workspaces
- **Auth**: JWT (RS256) — asymmetric RSA-2048 keys
- **WebSockets**: `ws` library
- **Database**: PostgreSQL (prod) / SQLite (dev) via `pg` or Drizzle ORM
- **Cache / sessions**: Redis — refresh tokens (TTL 7d), active socket sessions
- **AI**: Anthropic Claude API (`@anthropic-ai/sdk`) for NPC and quest generation
- **Password hashing**: bcrypt (cost factor 12)
- **Environment**: `.env` via `dotenv`

---

## Authentication architecture

### Auth Service (`packages/auth`) — port 3001
- Owns the **RSA private key** — never shared with other services
- Issues signed JWTs: `{ sub: playerId, username, role, iat, exp }`
- Exposes:
  - `POST /register` — create account, bcrypt hash password
  - `POST /login` — verify password, return `{ accessToken, refreshToken }`
  - `POST /refresh` — validate refresh token in Redis, issue new access token
  - `POST /logout` — revoke refresh token in Redis
  - `GET /.well-known/jwks.json` — expose public key in JWKS format

### Game API (`packages/game-api`) — port 3000
- Holds only the **RSA public key** (loaded at startup from env or JWKS endpoint)
- Verifies JWTs with `jsonwebtoken.verify(token, publicKey, { algorithms: ['RS256'] })`
- First WebSocket message must be `{ type: "auth", token: "<JWT>" }`
- Unauthenticated sockets are closed with code `4001`

```js
// WebSocket auth handshake pattern
wss.on('connection', (ws) => {
  ws.on('message', async (raw) => {
    const msg = JSON.parse(raw);
    if (msg.type === 'auth') {
      try {
        const payload = jwt.verify(msg.token, PUBLIC_KEY, { algorithms: ['RS256'] });
        ws.playerId = payload.sub;
        ws.playerName = payload.username;
        ws.send(JSON.stringify({ type: 'auth_ok' }));
      } catch {
        ws.close(4001, 'Unauthorized');
      }
      return;
    }
    if (!ws.playerId) return ws.close(4001, 'Not authenticated');
    handleMessage(ws, msg);
  });
});
```

---

## Database schema

```sql
-- Authentication
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(50) UNIQUE NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          VARCHAR(20) DEFAULT 'player',
  created_at    TIMESTAMP DEFAULT NOW()
);

-- Game state & NPC context
CREATE TABLE player_profiles (
  user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  xp            INTEGER DEFAULT 0,
  level         INTEGER DEFAULT 1,
  faction       VARCHAR(50),
  reputation    JSONB DEFAULT '{}',   -- { "vikings": 10, "sorciers": -5 }
  quests_done   UUID[],
  updated_at    TIMESTAMP DEFAULT NOW()
);
```

---

## Key storage rules

| Secret | Where | Rule |
|---|---|---|
| RSA private key | `.env` or `/etc/nidalheim/keys/private.pem` | Never in DB, never in Git |
| RSA public key | RAM (loaded at boot) + JWKS endpoint | Safe to expose |
| Passwords | PostgreSQL `users.password_hash` | bcrypt only, never plaintext |
| Refresh tokens | Redis `refresh:{userId}:{tokenId}` TTL 7d | Revocable on logout/ban |
| Active WS sessions | Redis `session:{socketId}` TTL 1h | Ephemeral |
| NPC active context | In-memory Map in game-api | Per-session, not persisted |

---

## AI prompt conventions (`packages/game-api/src/ai/`)

- Every AI call must include player context: `{ playerId, username, level, faction, reputation, quests_done }`
- System prompt lives in `src/ai/prompts/` — one file per feature (npc-dialogue, quest-gen, etc.)
- Always stream responses for dialogue (use `stream: true` with Anthropic SDK)
- NPC responses must stay in character — never break Norse/Viking setting
- Max tokens per NPC turn: `400` for dialogue, `800` for quest generation
- Include `playerId` in all Anthropic API calls metadata for tracing

```js
// Standard AI call pattern
const stream = await anthropic.messages.stream({
  model: 'claude-opus-4-5',
  max_tokens: 400,
  system: npcSystemPrompt(npc, playerProfile),
  messages: conversationHistory,
});
```

---

## Environment variables

```env
# Auth Service
PORT=3001
JWT_PRIVATE_KEY_PATH=/etc/nidalheim/keys/private.pem
JWT_ACCESS_TOKEN_EXPIRY=15m
JWT_REFRESH_TOKEN_EXPIRY=7d

# Game API
PORT=3000
JWT_PUBLIC_KEY_PATH=/etc/nidalheim/keys/public.pem

# Shared
DATABASE_URL=postgresql://user:pass@localhost:5432/nidalheim
REDIS_URL=redis://localhost:6379
ANTHROPIC_API_KEY=sk-ant-...
NODE_ENV=development
```

---

## Coding conventions

- ES modules (`import/export`), no CommonJS
- `async/await` everywhere, no raw Promise chains
- Errors thrown as `new Error('message')` with meaningful messages — no silent catches
- Database queries go in `shared/db/` — no raw SQL in route handlers
- AI prompts are strings returned by functions, not inline template literals in handlers
- No `console.log` in production paths — use a logger (e.g. `pino`)
- WebSocket message types use snake_case strings: `auth`, `auth_ok`, `npc_dialogue`, `quest_update`

---

## What NOT to do

- Never put the RSA private key in `shared/` or `game-api/`
- Never store passwords in plaintext or use MD5/SHA1 for hashing
- Never trust a WebSocket message before `ws.playerId` is set
- Never hardcode `ANTHROPIC_API_KEY` in source files
- Never commit the `keys/` folder or `.env`
- Never bypass JWT verification in game-api, even for dev convenience
