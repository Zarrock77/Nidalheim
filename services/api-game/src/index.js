import WebSocket, { WebSocketServer } from "ws";
import OpenAI from "openai";
import { AudioPipeline } from "./audioPipeline.js";
import http from "http";
import jwt from "jsonwebtoken";
import { readFileSync } from "fs";
import { config } from "dotenv";

config();

const JWT_PUBLIC_KEY = readFileSync(
  process.env.JWT_PUBLIC_KEY_PATH || "./keys/public.pem",
  "utf8"
);

function verifyToken(token) {
  return jwt.verify(token, JWT_PUBLIC_KEY, { algorithms: ["RS256"] });
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const client = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

async function chatgptResponse(chatHistory, chatMessage) {
    chatHistory.push({ role: "user", content: chatMessage });

    try {
        const response = await client.chat.completions.create({
            model: process.env.TEXT_LLM_MODEL || "gpt-4.1-nano",
            messages: chatHistory,
        });

        const assistantMessage = response.choices[0].message.content;
        chatHistory.push({ role: "assistant", content: assistantMessage });
        console.log(assistantMessage);
        return assistantMessage;
    } catch (error) {
        console.log(`OpenAI API error: ${error}`);
        return "Error generating response.";
    }
}

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

function handleTextConnection(websocket, user) {
    console.log(`Client connected to text endpoint (user: ${user.username})`);
    startHeartbeat(websocket);
    let chatHistory = [];
    const initPrompt =
        "Tu es un villageois du village appele Nidalheim, ne te laisse pas faire si on te provoque, tu as de l'humour donc hesite pas a charier un peu si il y a une occasion. Lorsque tu parles, tu es le plus concis possible, une seule phrase suffit, et de preference une courte phrase. Une personne qui t'es inconnue te parle, il semble etre nouveau dans le village et il te dit: ";
    let initPromptSent = false;
    let prompt = "";

    websocket.on("message", async (message) => {
        try {
            const messageStr = message.toString();
            console.log(`Text message received: ${messageStr}`);

            if (initPromptSent) {
                prompt = messageStr;
            } else {
                prompt = initPrompt + messageStr;
                initPromptSent = true;
            }

            const response = await chatgptResponse(chatHistory, prompt);
            console.log(`Response sent: ${response}`);
            websocket.send(response);
        } catch (error) {
            console.log(
                `Error processing text message: ${error}`,
            );
            websocket.send("Error processing your message.");
        }
    });

    websocket.on("close", () => {
        console.log(`Client disconnected from text endpoint (user: ${user.username})`);
    });

    websocket.on("error", (error) => {
        console.log(`Text WebSocket error: ${error}`);
    });
}

function handleAudioConnection(clientWs, user) {
    console.log(`Client connected to audio endpoint (user: ${user.username})`);
    startHeartbeat(clientWs);

    const pipeline = new AudioPipeline(clientWs, user, {
        deepgramKey: process.env.DEEPGRAM_API_KEY,
        debugAudioDump: process.env.DEBUG_AUDIO_DUMP === "1",

        ttsProvider: process.env.TTS_PROVIDER || "cartesia",
        elevenlabsKey: process.env.ELEVENLABS_API_KEY,
        elevenlabsVoiceId: process.env.ELEVENLABS_VOICE_ID,
        cartesiaKey: process.env.CARTESIA_API_KEY,
        cartesiaVoiceId: process.env.CARTESIA_VOICE_ID,
        cartesiaModel: process.env.CARTESIA_MODEL || "sonic-2",
        ttsLanguageCode: process.env.TTS_LANGUAGE_CODE || "fr",

        openaiKey: OPENAI_API_KEY,
        llmApiKey: process.env.LLM_API_KEY || process.env.GROQ_API_KEY,
        llmModel: process.env.LLM_MODEL || "llama-3.3-70b-versatile",
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

    server.on("upgrade", (request, socket, head) => {
        const ip = request.socket.remoteAddress;
        const fwd = request.headers["x-forwarded-for"];
        const clientIp = typeof fwd === "string" && fwd.length > 0 ? fwd.split(",")[0].trim() : ip;
        const url = new URL(request.url, `http://${request.headers.host}`);
        const path = url.pathname;
        const token = url.searchParams.get("token");

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
        } catch (err) {
            console.log(`[auth ${clientIp}] REJECTED ${path}: invalid token (${tokenPreview}) — ${err.message}`);
            socket.destroy();
            return;
        }

        console.log(`[auth ${clientIp}] OK ${path} user=${user.username} (sub=${user.sub}) token=${tokenPreview}`);

        if (path === "/text") {
            wss.handleUpgrade(request, socket, head, (ws) => {
                handleTextConnection(ws, user);
            });
        } else if (path === "/audio") {
            wss.handleUpgrade(request, socket, head, (ws) => {
                handleAudioConnection(ws, user);
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
