import WebSocket, { WebSocketServer } from "ws";
import OpenAI from "openai";
import http from "http";
import { config } from "dotenv";
import type { IncomingMessage } from "http";
import type { Duplex } from "stream";
import { AudioPipeline } from "./audioPipeline.js";
import { assertJwtSecretConfigured, userFromJwtPayload, verifyToken } from "./auth.js";
import { ConversationStore } from "./conversationStore.js";
import { HttpRouter, sendJson } from "./httpRouter.js";
import { getNpc } from "./npcStore.js";
import { QuestGenerator } from "./questGenerator.js";
import { registerQuestRoutes } from "./questRoutes.js";
import { QuestStore } from "./questStore.js";
import type { AuthenticatedUser, ChatMessage, Npc } from "./types.js";

config({ path: "../../infra/.env" });

assertJwtSecretConfigured();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

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

interface TextConnectionDeps {
  questGenerator: QuestGenerator;
  questStore: QuestStore;
}

const textChatClient = new OpenAI({
  apiKey: process.env.LLM_API_KEY || OPENAI_API_KEY,
  baseURL: process.env.LLM_BASE_URL || undefined,
});
const textChatModel = process.env.LLM_MODEL || "llama-3.1-8b-instant";

async function handleTextConnection(
  websocket: WebSocket,
  user: AuthenticatedUser,
  npc: Npc,
  deps: TextConnectionDeps,
): Promise<void> {
  console.log(`Client connected to text endpoint (user: ${user.username}, npc: ${npc.id})`);
  startHeartbeat(websocket);

  const store = new ConversationStore({ maxHistory: 20 });
  let history: ChatMessage[] = [];
  try {
    history = await store.loadRecent(user.id, npc.id);
    if (history.length > 0) {
      console.log(`[text ${user.username}/${npc.id}] restored ${history.length} past messages`);
    }
  } catch (err) {
    console.error(`[text ${user.username}/${npc.id}] history load failed:`, (err as Error)?.message ?? err);
  }

  const model = npc.llmModel || textChatModel;

  websocket.on("message", async (message) => {
    const userText = message.toString().trim();
    if (!userText) return;
    console.log(`[text ${user.username}/${npc.id}] user: ${userText}`);

    history.push({ role: "user", content: userText });
    const messages = [
      { role: "system" as const, content: npc.systemPrompt },
      ...history,
    ];

    let reply: string;
    try {
      const response = await textChatClient.chat.completions.create({
        model,
        messages,
      });
      reply = response.choices[0]?.message?.content ?? "";
    } catch (err) {
      console.error(`[text ${user.username}/${npc.id}] LLM error:`, (err as Error)?.message ?? err);
      websocket.send("Error generating response.");
      history.pop();
      return;
    }

    history.push({ role: "assistant", content: reply });
    if (history.length > 40) history.splice(0, history.length - 40);

    console.log(`[text ${user.username}/${npc.id}] npc: ${reply}`);
    websocket.send(reply);

    if (shouldOfferQuest(userText)) {
      void offerQuestFromText(websocket, user, npc, deps, userText, reply).catch((err) => {
        console.error(`[text ${user.username}/${npc.id}] quest offer failed:`, (err as Error)?.message ?? err);
      });
    }

    store
      .appendTurn(user.id, npc.id, userText, reply, "text")
      .catch((err) => console.error(`[text ${user.username}/${npc.id}] save failed:`, (err as Error)?.message ?? err));
  });

  websocket.on("close", () => {
    console.log(`Client disconnected from text endpoint (user: ${user.username}, npc: ${npc.id})`);
  });

  websocket.on("error", (error) => {
    console.log(`Text WebSocket error: ${error}`);
  });
}

function shouldOfferQuest(userText: string): boolean {
  return /\b(qu[eê]te|quest|mission)\b/i.test(userText);
}

async function offerQuestFromText(
  websocket: WebSocket,
  user: AuthenticatedUser,
  npc: Npc,
  deps: TextConnectionDeps,
  userText: string,
  npcReply: string,
): Promise<void> {
  const quest = await deps.questGenerator.generateStructuredQuest({
    user,
    issuerNpcId: npc.id,
    context: {
      location: npc.id,
      recentEvents: [userText, npcReply],
    },
  });

  await deps.questStore.createOffered(user.id, quest, npc.id);

  if (websocket.readyState === WebSocket.OPEN) {
    websocket.send(JSON.stringify({ type: "quest_offer", payload: quest }));
  }
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
    llmModel: npc.llmModel || process.env.LLM_MODEL || "llama-3.3-70b-versatile",
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
        void handleTextConnection(ws, user, npc, { questGenerator, questStore });
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
