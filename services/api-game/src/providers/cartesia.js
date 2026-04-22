import WebSocket from "ws";
import { randomUUID } from "crypto";

/**
 * Persistent streaming TTS via Cartesia Sonic WebSocket.
 *
 * One WS per pipeline lifetime — reused across every utterance. Each utterance
 * uses its own `context_id`; the WS itself stays open so we pay the
 * transatlantic TCP + TLS + WS upgrade only once (not per NPC reply).
 *
 * Ref: https://docs.cartesia.ai/api-reference/tts/tts
 *
 * Per-turn lifecycle:
 *   beginUtterance() -> sendText()+ -> flush()
 *   The server returns audio chunks tagged with the current context_id and
 *   emits `done:true` when the context is terminated by flush().
 */
export class CartesiaStreamingTTS {
    constructor(
        apiKey,
        {
            voiceId,
            modelId = "sonic-2",
            language = "fr",
            sampleRate = 24000,
            apiVersion = "2024-11-13",
        } = {},
    ) {
        if (!apiKey) throw new Error("CartesiaStreamingTTS: missing apiKey");
        if (!voiceId) throw new Error("CartesiaStreamingTTS: missing voiceId");
        this.apiKey = apiKey;
        this.voiceId = voiceId;
        this.modelId = modelId;
        this.language = language;
        this.sampleRate = sampleRate;
        this.apiVersion = apiVersion;
        this.ws = null;
        this.contextId = null;
        this.onAudio = () => {};
        this.onFinal = () => {};
        this.onError = () => {};
    }

    async start() {
        const qs = new URLSearchParams({
            api_key: this.apiKey,
            cartesia_version: this.apiVersion,
        });
        const url = `wss://api.cartesia.ai/tts/websocket?${qs}`;
        this.ws = new WebSocket(url);

        await new Promise((resolve, reject) => {
            const to = setTimeout(() => reject(new Error("cartesia open timeout")), 8000);
            this.ws.once("open", () => { clearTimeout(to); resolve(); });
            this.ws.once("error", (err) => { clearTimeout(to); reject(err); });
            this.ws.once("unexpected-response", (_req, res) => {
                let body = "";
                res.on("data", (d) => (body += d.toString()));
                res.on("end", () => {
                    clearTimeout(to);
                    reject(new Error(`HTTP ${res.statusCode} — ${body.slice(0, 200)}`));
                });
            });
        });

        this.ws.on("error", (err) => {
            console.error("[cartesia error]", err);
            this.onError(err);
        });

        this.ws.on("close", () => {
            // If server closes unexpectedly, surface it so the pipeline can decide.
            this.ws = null;
        });

        this.ws.on("message", (raw) => {
            let msg;
            try {
                msg = JSON.parse(raw.toString());
            } catch (_) {
                return;
            }
            // Only surface events for the current in-flight context; stale replies
            // from a previous context are ignored.
            if (msg.context_id && msg.context_id !== this.contextId) return;

            if (msg.type === "chunk" && msg.data) {
                this.onAudio(msg.data);
            }
            if (msg.type === "error") {
                console.error("[cartesia reply error]", msg);
                this.onError(new Error(msg.error ?? "cartesia error"));
            }
            if (msg.done === true || msg.type === "done") {
                // Now it's safe to retire the context — no more chunks will
                // arrive for it. Keep the WS open for the next utterance.
                if (msg.context_id && msg.context_id === this.contextId) {
                    this.contextId = null;
                }
                this.onFinal();
            }
        });
    }

    beginUtterance() {
        this.contextId = randomUUID();
    }

    sendText(text) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        if (!text) return;
        if (!this.contextId) this.beginUtterance();
        this.ws.send(JSON.stringify(this._frame(text, /*continue*/ true)));
    }

    flush() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        if (!this.contextId) return;
        // Do NOT clear this.contextId here. Cartesia is still about to stream
        // audio chunks tagged with this context_id; clearing would cause the
        // on-message handler to filter them out as "stale". The context id is
        // retired only once the server emits `done:true` for it.
        this.ws.send(JSON.stringify(this._frame("", /*continue*/ false)));
        return this.contextId;
    }

    close() {
        if (!this.ws) return;
        try { this.ws.close(); } catch (_) { /* ignore */ }
        this.ws = null;
        this.contextId = null;
    }

    _frame(transcript, cont) {
        return {
            context_id: this.contextId,
            model_id: this.modelId,
            transcript,
            voice: { mode: "id", id: this.voiceId },
            language: this.language,
            output_format: {
                container: "raw",
                encoding: "pcm_s16le",
                sample_rate: this.sampleRate,
            },
            continue: cont,
        };
    }
}
