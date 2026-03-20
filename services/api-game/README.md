# api-game

API WebSocket temps-reel pour les interactions avec les PNJ du jeu Nidalheim, propulsee par OpenAI.

## Stack

- **ws** — serveur WebSocket
- **openai** — client OpenAI (chat completions + Realtime API)
- **Node.js 22**

## Fonctionnalites

### Chat textuel (`/text-chat`)

Connexion WebSocket pour discuter avec les PNJ du village de Nidalheim. Utilise le modele `o3-mini` avec un systeme de prompt en francais decrivant le village et ses habitants.

```
ws://localhost:3002/text-chat?apiKey=YOUR_KEY
```

**Messages :**
- Envoi : `{ "message": "Bonjour, forgeron !" }`
- Reception : `{ "response": "..." }`

### Audio temps-reel (`/audio`)

WebSocket pour interactions vocales avec les PNJ via l'API Realtime d'OpenAI.

```
ws://localhost:3002/audio?apiKey=YOUR_KEY
```

- Entree : audio PCM16 en base64
- Sortie : audio PCM16 en base64 (voix "ash")
- Transcription automatique via Whisper

### Heartbeat

Ping/pong toutes les 30 secondes pour maintenir les connexions actives.

## Lancer en dev

```bash
pnpm install
pnpm start    # nodemon, port 3002
```

## Variables d'environnement

| Variable | Description |
|----------|-------------|
| `PORT` | Port du serveur (defaut : `3002`) |
| `OPENAI_API_KEY` | Cle API OpenAI |
| `NIDALHEIM_API_KEY` | Cle API pour authentifier les clients |
