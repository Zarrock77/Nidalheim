import WebSocket, { WebSocketServer } from "ws";
import http from "http";
import { config } from "dotenv";
import type { IncomingMessage } from "http";
import type { Duplex } from "stream";
import { AudioPipeline } from "./audioPipeline.js";
import { assertJwtSecretConfigured, userFromJwtPayload, verifyToken } from "./auth.js";
import { ConversationStore } from "./conversationStore.js";
import { HttpRouter, sendJson } from "./httpRouter.js";
import { getNpc } from "./npcStore.js";
import { ChatEngine } from "./providers/chatEngine.js";
import { buildSystemPrompt } from "./systemPrompt.js";
import { MISSION_VALIDATE_TOOL, MISSION_START_TOOL } from "./missionCatalog.js";
import { handleValidateMission, handleStartMission } from "./missionTool.js";
import { acquireMissionState, releaseMissionState, parseMissionSync, parseInventorySync, type MissionState } from "./missionState.js";
import { generateDungeonExtension, type CatalogItem } from "./dungeonExpansion.js";
import { QuestGenerator } from "./questGenerator.js";
import { registerQuestRoutes } from "./questRoutes.js";
import { QuestStore } from "./questStore.js";
import type { AuthenticatedUser, ChatMessage, Npc } from "./types.js";

config({ path: "../../infra/.env" });

assertJwtSecretConfigured();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Generation d'extension en cours par joueur (une seule a la fois, l'appel LLM prend plusieurs secondes).
const expansionInFlight = new Set<string>();

function startHeartbeat(ws: WebSocket): void {
  let interval: NodeJS.Timeout;
  ws.on("close", () => clearInterval(interval));

  interval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    } else {
      clearInterval(interval);
    }
  }, 30000);
}

// Moteur de chat unifie texte + vocal : Groq en primaire, OpenAI en fallback.
// Modele dedie au chat (function-calling fiable) — distinct du LLM_MODEL du generateur de quetes.
const chatEngine = new ChatEngine({
  groqApiKey: process.env.LLM_API_KEY,
  groqBaseUrl: process.env.LLM_BASE_URL,
  groqModel: process.env.CHAT_LLM_MODEL || "llama-3.3-70b-versatile",
  openaiApiKey: OPENAI_API_KEY,
  openaiModel: process.env.OPENAI_FALLBACK_MODEL || "gpt-4o-mini",
});

async function handleTextConnection(
  websocket: WebSocket,
  user: AuthenticatedUser,
  npc: Npc,
): Promise<void> {
  console.log(`Client connected to text endpoint (user: ${user.username}, npc: ${npc.id})`);
  startHeartbeat(websocket);

  const store = new ConversationStore({ maxHistory: 20 });
  // Etat des missions partage avec le canal vocal du meme joueur (cf. missionState.ts).
  const missionState = acquireMissionState(user.id, npc.id);

  websocket.on("message", async (message) => {
    const userText = message.toString().trim();
    if (!userText) return;

    // Messages de controle JSON du client (ex: mission_sync, clear_history) — ne passent jamais par le LLM.
    if (userText.startsWith("{") && handleTextControlMessage(websocket, user, npc, missionState, store, userText)) {
      return;
    }
    console.log(`[text ${user.username}/${npc.id}] user: ${userText}`);

    // Recharge l'historique partage a CHAQUE tour -> sync live vocal<->texte.
    let history: ChatMessage[] = [];
    try {
      history = await store.loadRecent(user.id, npc.id);
    } catch (err) {
      console.error(`[text ${user.username}/${npc.id}] history load failed:`, (err as Error)?.message ?? err);
    }

    const missions = missionState.all();
    const messages = [
      { role: "system" as const, content: buildSystemPrompt(npc, missions, missionState.getInventory()) },
      ...history,
      { role: "user" as const, content: userText },
    ];

    let reply: string;
    try {
      reply = await chatEngine.respond(messages, {
        // Tool expose UNIQUEMENT quand il peut servir : mission active + objet en main (cas ou la
        // validation peut reussir). Sinon aucun tool -> le prompt gere le dialogue (et zero fuite).
        tools: [
          ...(missions.some((m) => !m.completed && !m.started) ? [MISSION_START_TOOL] : []),
          ...(missions.some((m) => !m.completed && (m.hasObjectiveItem || missionState.hasItem(m.objectiveItemId))) ? [MISSION_VALIDATE_TOOL] : []),
        ],
        onToolCall: async (name, argumentsJson) => {
          if (name === "start_mission") {
            const outcome = handleStartMission(missionState, argumentsJson);
            if (outcome.started && websocket.readyState === WebSocket.OPEN) {
              websocket.send(JSON.stringify({ type: "mission_started", missionId: outcome.missionId }));
            }
            console.log(`[text /] start_mission  -> started=`);
            return outcome.toolResult;
          }
          if (name === "validate_mission") {
            const outcome = handleValidateMission(missionState, argumentsJson);
            if (websocket.readyState === WebSocket.OPEN) {
              websocket.send(JSON.stringify({ type: "mission_validation_result", missionId: outcome.missionId, ok: outcome.ok }));
            }
            console.log(`[text ${user.username}/${npc.id}] validate_mission ${outcome.missionId ?? "-"} -> ok=${outcome.ok}`);
            return outcome.toolResult;
          }
          return `tool inconnu: ${name}`;
        },
      });
    } catch (err) {
      console.error(`[text ${user.username}/${npc.id}] LLM error:`, (err as Error)?.message ?? err);
      websocket.send("Error generating response.");
      return;
    }

    console.log(`[text ${user.username}/${npc.id}] npc: ${reply}`);
    websocket.send(reply);

    store
      .appendTurn(user.id, npc.id, userText, reply, "text")
      .catch((err) => console.error(`[text ${user.username}/${npc.id}] save failed:`, (err as Error)?.message ?? err));
  });

  websocket.on("close", () => {
    releaseMissionState(user.id, npc.id);
    console.log(`Client disconnected from text endpoint (user: ${user.username}, npc: ${npc.id})`);
  });

  websocket.on("error", (error) => {
    console.log(`Text WebSocket error: ${error}`);
  });
}

/**
 * Traite un message de controle JSON envoye par le client sur le canal texte.
 * `mission_sync` : le client (IR du donjon) pousse la liste des missions + leur etat
 * (objectif possede, terminee). Retourne true si le message a ete consomme — il ne doit
 * alors pas partir au LLM.
 */
function handleTextControlMessage(
  websocket: WebSocket,
  user: AuthenticatedUser,
  npc: Npc,
  missionState: MissionState,
  store: ConversationStore,
  raw: string,
): boolean {
  let ctrl: { type?: unknown; missions?: unknown };
  try {
    ctrl = JSON.parse(raw) as { type?: unknown; missions?: unknown };
  } catch {
    return false; // pas du JSON valide -> message de chat normal
  }
  if (typeof ctrl.type !== "string") return false;

  if (ctrl.type === "mission_sync") {
    const missions = parseMissionSync(ctrl as { missions?: unknown });
    missionState.replaceAll(missions);
    console.log(`[text ${user.username}/${npc.id}] mission_sync -> ${missions.length} mission(s)`);
    return true;
  }

  if (ctrl.type === "inventory_sync") {
    // Fouille : le client pousse l'inventaire ENTIER du joueur (butin donjon + equipement).
    const items = parseInventorySync(ctrl as { items?: unknown });
    missionState.replaceInventory(items);
    console.log(`[text ${user.username}/${npc.id}] inventory_sync -> ${items.length} item(s)`);
    return true;
  }

  if (ctrl.type === "dungeon_expand") {
    // Expansion LLM : le client envoie son plan complet + le catalogue d'items posables ; on genere
    // l'extension en arriere-plan (plusieurs secondes) et on repond par un event dungeon_extension.
    const payload = ctrl as { plan?: unknown; items?: unknown };
    const items: CatalogItem[] = Array.isArray(payload.items)
      ? payload.items
          .filter((x): x is { id: string; name?: unknown } => !!x && typeof (x as { id?: unknown }).id === "string")
          .map((x) => ({ id: x.id, name: typeof x.name === "string" ? x.name : x.id }))
      : [];
    if (expansionInFlight.has(user.id)) {
      console.log(`[text ${user.username}/${npc.id}] dungeon_expand ignore (generation deja en cours)`);
      return true;
    }
    expansionInFlight.add(user.id);
    console.log(`[text ${user.username}/${npc.id}] dungeon_expand recu (${items.length} items au catalogue)`);
    void (async () => {
      try {
        const result = await generateDungeonExtension(payload.plan, items);
        if (websocket.readyState === WebSocket.OPEN) {
          websocket.send(JSON.stringify({
            type: "dungeon_extension",
            ok: result.ok,
            extension: result.extension ?? null,
            error: result.error ?? "",
          }));
        }
        console.log(`[text ${user.username}/${npc.id}] dungeon_extension -> ok=${result.ok}${result.error ? ` (${result.error})` : ""}`);
      } catch (err) {
        console.error(`[text ${user.username}/${npc.id}] dungeon_expand crash:`, (err as Error)?.message ?? err);
        if (websocket.readyState === WebSocket.OPEN) {
          websocket.send(JSON.stringify({ type: "dungeon_extension", ok: false, extension: null, error: "erreur interne" }));
        }
      } finally {
        expansionInFlight.delete(user.id);
      }
    })();
    return true;
  }

  if (ctrl.type === "clear_history") {
    // Reset du jeu : le client demande l'effacement de tout l'historique de chat du joueur.
    store
      .clearHistory(user.id)
      .then(() => console.log(`[text ${user.username}/${npc.id}] clear_history -> historique efface`))
      .catch((err) => console.error(`[text ${user.username}/${npc.id}] clear_history failed:`, (err as Error)?.message ?? err));
    return true;
  }

  // JSON avec un champ type inconnu : controle mal forme, on ne le donne jamais au LLM.
  console.warn(`[text ${user.username}/${npc.id}] message de controle inconnu ignore: ${ctrl.type}`);
  return true;
}

function handleAudioConnection(clientWs: WebSocket, user: AuthenticatedUser, npc: Npc): void {
  console.log(`Client connected to audio endpoint (user: ${user.username}, npc: ${npc.id})`);
  startHeartbeat(clientWs);

  const pipeline = new AudioPipeline(clientWs, user, npc, {
    deepgramKey: process.env.DEEPGRAM_API_KEY,
    debugAudioDump: process.env.DEBUG_AUDIO_DUMP === "1",

    ttsProvider: process.env.TTS_PROVIDER || "cartesia",
    elevenlabsKey: process.env.ELEVENLABS_API_KEY,
    elevenlabsVoiceId: npc.voiceId || process.env.ELEVENLABS_VOICE_ID,
    cartesiaKey: process.env.CARTESIA_API_KEY,
    cartesiaVoiceId: npc.voiceId || process.env.CARTESIA_VOICE_ID,
    cartesiaModel: npc.ttsModel || process.env.CARTESIA_MODEL || "sonic-2",
    ttsLanguageCode: process.env.TTS_LANGUAGE_CODE || "fr",

    openaiKey: OPENAI_API_KEY,
    llmApiKey: process.env.LLM_API_KEY || process.env.GROQ_API_KEY,
    llmModel: process.env.CHAT_LLM_MODEL || "llama-3.3-70b-versatile",
    llmBaseUrl: process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1",
  });

  pipeline.start().catch((err) => {
    console.error(`[pipeline ${user.username}] failed to start:`, err);
    try {
      clientWs.send(JSON.stringify({ type: "error", message: `pipeline start: ${(err as Error)?.message ?? err}` }));
    } catch { /* ignore */ }
    try { clientWs.close(); } catch { /* ignore */ }
  });

  clientWs.on("message", (message) => {
    const str = message.toString();
    if (str === "COMMIT" || str.includes("COMMIT")) {
      pipeline.onClientCommit();
      return;
    }
    if (str.startsWith("{")) {
      try {
        const ctrl = JSON.parse(str) as { type?: string };
        if (ctrl && typeof ctrl.type === "string") {
          if (ctrl.type === "audio_config") {
            void pipeline.onClientAudioConfig(ctrl as { sample_rate?: number; device?: string; bluetooth_hfp?: boolean });
            return;
          }
        }
      } catch { /* fall through — treat as audio */ }
    }
    if (str.length < 100) return;
    try {
      const pcm = Buffer.from(str, "base64");
      if (pcm.length > 0) pipeline.onClientAudio(pcm);
    } catch (err) {
      console.warn(`[pipeline ${user.username}] audio decode error:`, (err as Error)?.message ?? err);
    }
  });

  clientWs.on("close", () => {
    console.log(`Client disconnected from audio endpoint (user: ${user.username}, npc: ${npc.id})`);
    pipeline.shutdown();
  });

  clientWs.on("error", (err) => {
    console.log(`Audio client WebSocket error: ${(err as Error)?.message ?? err}`);
    pipeline.shutdown();
  });
}

function main(): void {
  const questGenerator = new QuestGenerator();
  const questStore = new QuestStore();
  const router = new HttpRouter();

  router.get("/health", (context) => {
    sendJson(context.response, 200, { status: "ok", service: "nidalheim-game" });
  });
  registerQuestRoutes(router, { questGenerator, questStore });

  const server = http.createServer((req, res) => {
    const ip = req.socket.remoteAddress;
    void router.handle(req, res).then((handled) => {
      if (handled) return;

      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      if (url.pathname === "/text" || url.pathname === "/audio") {
        console.log(`[http ${ip}] ${req.method} ${req.url} - not a WebSocket upgrade, rejecting`);
        res.writeHead(426, { "Content-Type": "text/plain", "Upgrade": "websocket" });
        res.end("Upgrade Required");
        return;
      }

      sendJson(res, 404, { error: "Not Found" });
    }).catch((err) => {
      console.error("[http] request failed:", err);
      if (!res.headersSent) {
        sendJson(res, 500, { error: "Internal Server Error" });
      }
    });
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const ip = request.socket.remoteAddress;
    const fwd = request.headers["x-forwarded-for"];
    const clientIp = typeof fwd === "string" && fwd.length > 0 ? fwd.split(",")[0].trim() : ip;
    const url = new URL(request.url ?? "", `http://${request.headers.host}`);
    const path = url.pathname;
    const token = url.searchParams.get("token");
    const npcIdParam = url.searchParams.get("npc");

    console.log(`[upgrade ${clientIp}] ${request.method} ${request.url} (host=${request.headers.host})`);

    if (!token) {
      console.log(`[auth ${clientIp}] REJECTED ${path}: missing token`);
      socket.destroy();
      return;
    }

    const tokenPreview = `${token.slice(0, 12)}…${token.slice(-6)}`;
    let payload: ReturnType<typeof verifyToken>;
    try {
      payload = verifyToken(token);
    } catch (err) {
      console.log(`[auth ${clientIp}] REJECTED ${path}: invalid token (${tokenPreview}) — ${(err as Error).message}`);
      socket.destroy();
      return;
    }

    const user = userFromJwtPayload(payload);

    let npc: Npc;
    try {
      npc = await getNpc(npcIdParam);
    } catch (err) {
      console.log(`[auth ${clientIp}] REJECTED ${path}: npc lookup failed — ${(err as Error).message}`);
      socket.destroy();
      return;
    }

    console.log(`[auth ${clientIp}] OK ${path} user=${user.username} npc=${npc.id} token=${tokenPreview}`);

    if (path === "/text") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        void handleTextConnection(ws, user, npc);
      });
    } else if (path === "/audio") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        handleAudioConnection(ws, user, npc);
      });
    } else {
      console.log(`[auth ${clientIp}] REJECTED ${path}: unknown endpoint (user=${user.username})`);
      socket.destroy();
    }
  });

  const port = Number(process.env.PORT) || 3002;
  server.listen(port, "0.0.0.0", () => {
    console.log(`Internal binding: ws://localhost:${port}`);

    console.log(`Available endpoints:`);
    console.log(`/text`);
    console.log(`/audio`);
  });

  process.on("SIGINT", () => {
    console.log("Stopping WebSocket server.");
    server.close(() => {
      console.log("Server stopped.");
      process.exit(0);
    });
  });
}

main();
