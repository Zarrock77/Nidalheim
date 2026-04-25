import WebSocket, { WebSocketServer } from "ws";
import OpenAI from "openai";
import { AudioPipeline } from "./audioPipeline.js";
import { ConversationStore } from "./conversationStore.js";
import { getNpc } from "./npcStore.js";
import http from "http";
import jwt from "jsonwebtoken";
import { config } from "dotenv";

config({ path: "../../infra/.env" });

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is required");
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const client = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

function startHeartbeat(ws) {
    ws.on("close", () => clearInterval(interval));

    const interval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
        } else {
            clearInterval(interval);
        }
    }, 30000);
}

// Text chat now mirrors the voice path: same system prompt, same LLM
// (Groq/Llama by default, OpenAI-compat fallback), same Postgres-backed
// conversation store so history carries across voice ↔ text and across
// sessions.
const textChatClient = new OpenAI({
    apiKey: process.env.LLM_API_KEY || OPENAI_API_KEY,
    baseURL: process.env.LLM_BASE_URL || undefined,
});
const textChatModel = process.env.LLM_MODEL || "llama-3.1-8b-instant";

async function handleTextConnection(websocket, user, npc) {
    console.log(`Client connected to text endpoint (user: ${user.username}, npc: ${npc.id})`);
    startHeartbeat(websocket);

    const store = new ConversationStore({ maxHistory: 20 });
    let history = [];
    try {
        history = await store.loadRecent(user.id, npc.id);
        if (history.length > 0) {
            console.log(`[text ${user.username}/${npc.id}] restored ${history.length} past messages`);
        }
    } catch (err) {
        console.error(`[text ${user.username}/${npc.id}] history load failed:`, err?.message ?? err);
    }

    const model = npc.llmModel || textChatModel;

    websocket.on("message", async (message) => {
        const userText = message.toString().trim();
        if (!userText) return;
        console.log(`[text ${user.username}/${npc.id}] user: ${userText}`);

        history.push({ role: "user", content: userText });
        const messages = [
            { role: "system", content: npc.systemPrompt },
            ...history,
        ];

        let reply;
        try {
            const response = await textChatClient.chat.completions.create({
                model,
                messages,
            });
            reply = response.choices[0]?.message?.content ?? "";
        } catch (err) {
            console.error(`[text ${user.username}/${npc.id}] LLM error:`, err?.message ?? err);
            websocket.send("Error generating response.");
            // Remove the un-answered user turn so we don't get a lopsided history.
            history.pop();
            return;
        }

        history.push({ role: "assistant", content: reply });
        if (history.length > 40) history.splice(0, history.length - 40);

        console.log(`[text ${user.username}/${npc.id}] npc: ${reply}`);
        websocket.send(reply);

        store
            .appendTurn(user.id, npc.id, userText, reply, "text")
            .catch((err) => console.error(`[text ${user.username}/${npc.id}] save failed:`, err?.message ?? err));
    });

    websocket.on("close", () => {
        console.log(`Client disconnected from text endpoint (user: ${user.username}, npc: ${npc.id})`);
    });

    websocket.on("error", (error) => {
        console.log(`Text WebSocket error: ${error}`);
    });
}

function handleAudioConnection(clientWs, user, npc) {
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
            clientWs.send(JSON.stringify({ type: "error", message: `pipeline start: ${err?.message ?? err}` }));
        } catch (_) { /* ignore */ }
        try { clientWs.close(); } catch (_) { /* ignore */ }
    });

    clientWs.on("message", (message) => {
        const str = message.toString();
        if (str === "COMMIT" || str.includes("COMMIT")) {
            pipeline.onClientCommit();
            return;
        }
        // JSON control frames (audio_config, future control messages) travel on the
        // same WS as the base64 PCM chunks — dispatch them before the length filter.
        if (str.startsWith("{")) {
            try {
                const ctrl = JSON.parse(str);
                if (ctrl && typeof ctrl.type === "string") {
                    if (ctrl.type === "audio_config") {
                        pipeline.onClientAudioConfig(ctrl);
                        return;
                    }
                }
            } catch (_) { /* fall through — treat as audio */ }
        }
        if (str.length < 100) return; // ignore tiny control frames
        try {
            const pcm = Buffer.from(str, "base64");
            if (pcm.length > 0) pipeline.onClientAudio(pcm);
        } catch (err) {
            console.warn(`[pipeline ${user.username}] audio decode error:`, err?.message ?? err);
        }
    });

    clientWs.on("close", () => {
        console.log(`Client disconnected from audio endpoint (user: ${user.username})`);
        pipeline.shutdown();
    });

    clientWs.on("error", (err) => {
        console.log(`Audio client WebSocket error: ${err?.message ?? err}`);
        pipeline.shutdown();
    });
}

function main() {
    const server = http.createServer((req, res) => {
        // Plain HTTP hit on the WS server — log and 426 it so operators notice.
        const ip = req.socket.remoteAddress;
        console.log(`[http ${ip}] ${req.method} ${req.url} — not a WebSocket upgrade, rejecting`);
        res.writeHead(426, { "Content-Type": "text/plain", "Upgrade": "websocket" });
        res.end("Upgrade Required");
    });

    const wss = new WebSocketServer({ noServer: true });

    server.on("upgrade", async (request, socket, head) => {
        const ip = request.socket.remoteAddress;
        const fwd = request.headers["x-forwarded-for"];
        const clientIp = typeof fwd === "string" && fwd.length > 0 ? fwd.split(",")[0].trim() : ip;
        const url = new URL(request.url, `http://${request.headers.host}`);
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
        let user;
        try {
            user = verifyToken(token);
            // Normalize: JWT uses the standard "sub" claim for user id; the rest
            // of the pipeline (ConversationStore, logging) expects user.id.
            user.id = user.sub;
        } catch (err) {
            console.log(`[auth ${clientIp}] REJECTED ${path}: invalid token (${tokenPreview}) — ${err.message}`);
            socket.destroy();
            return;
        }

        // Resolve the NPC the client wants to talk to. Falls back to "default"
        // if the client doesn't pass ?npc= or sends an unknown id.
        let npc;
        try {
            npc = await getNpc(npcIdParam);
        } catch (err) {
            console.log(`[auth ${clientIp}] REJECTED ${path}: npc lookup failed — ${err.message}`);
            socket.destroy();
            return;
        }

        console.log(`[auth ${clientIp}] OK ${path} user=${user.username} npc=${npc.id} token=${tokenPreview}`);

        if (path === "/text") {
            wss.handleUpgrade(request, socket, head, (ws) => {
                handleTextConnection(ws, user, npc);
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

    const port = process.env.PORT || 3002;
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
