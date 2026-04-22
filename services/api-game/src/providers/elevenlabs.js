import WebSocket from "ws";

/**
 * Streaming TTS over the ElevenLabs `stream-input` WebSocket.
 *
 * Reference (authoritative):
 *   https://elevenlabs.io/docs/api-reference/text-to-speech/v-1-text-to-speech-voice-id-stream-input
 *
 * Key compliance points baked in here:
 *  - `optimize_streaming_latency` is deprecated; we rely on `auto_mode=true`
 *    instead (Flash v2.5 recommended mode).
 *  - `try_trigger_generation` is superseded by `flush:true` / auto_mode — dropped.
 *  - xi-api-key is sent as WS header only (not also in the BOS frame).
 *  - Text chunks end with a trailing space to avoid word-concat at chunk
 *    boundaries, per the provider's best-practice note.
 *  - BOS frame carries voice_settings + generation_config only (set-once).
 *  - EOS frame = `{ text: "" }`.
 */
export class ElevenLabsStreamingTTS {
    constructor(
        apiKey,
        {
            voiceId,
            modelId = "eleven_flash_v2_5",
            outputFormat = "pcm_24000",
            languageCode,
            stability = 0.45,
            similarityBoost = 0.75,
            style = 0.0,
            speed = 1.0,
            useSpeakerBoost = true,
            autoMode = true,
        } = {},
    ) {
        if (!apiKey) throw new Error("ElevenLabsStreamingTTS: missing apiKey");
        if (!voiceId) throw new Error("ElevenLabsStreamingTTS: missing voiceId");
        this.apiKey = apiKey;
        this.voiceId = voiceId;
        this.modelId = modelId;
        this.outputFormat = outputFormat;
        this.languageCode = languageCode;
        this.autoMode = autoMode;
        this.voiceSettings = {
            stability,
            similarity_boost: similarityBoost,
            style,
            use_speaker_boost: useSpeakerBoost,
            speed,
        };
        this.ws = null;
        this.onAudio = () => {};
        this.onFinal = () => {};
        this.onError = () => {};
    }

    async start() {
        const qs = new URLSearchParams({
            model_id: this.modelId,
            output_format: this.outputFormat,
            auto_mode: String(this.autoMode),
        });
        if (this.languageCode) qs.set("language_code", this.languageCode);

        const url = `wss://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream-input?${qs}`;
        this.ws = new WebSocket(url, { headers: { "xi-api-key": this.apiKey } });

        await new Promise((resolve, reject) => {
            const to = setTimeout(() => reject(new Error("elevenlabs open timeout")), 8000);
            this.ws.once("open", () => {
                clearTimeout(to);
                // BOS frame — set-once voice config. No API key here (header covers it).
                this.ws.send(JSON.stringify({
                    text: " ",
                    voice_settings: this.voiceSettings,
                    generation_config: { chunk_length_schedule: [120, 160, 250, 290] },
                }));
                resolve();
            });
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
            console.error("[elevenlabs error]", err);
            this.onError(err);
        });

        this.ws.on("message", (data) => {
            let msg;
            try {
                msg = JSON.parse(data.toString());
            } catch (_) {
                return;
            }
            if (msg.audio) this.onAudio(msg.audio);
            if (msg.isFinal) {
                this.onFinal();
                // Server-signalled end of stream — tear down the WS locally too.
                try { this.ws?.close(); } catch (_) { /* ignore */ }
            }
            if (msg.error) {
                console.error("[elevenlabs reply error]", msg);
                this.onError(new Error(msg.error));
            }
        });
    }

    sendText(text) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        if (!text) return;
        // Trailing space required per ElevenLabs best-practice to avoid
        // word-glue when multiple text frames are concatenated server-side.
        const framed = text.endsWith(" ") ? text : text + " ";
        this.ws.send(JSON.stringify({ text: framed }));
    }

    flush() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        // Empty text frame = end-of-input signal.
        this.ws.send(JSON.stringify({ text: "" }));
    }

    close() {
        if (!this.ws) return;
        try { this.ws.close(); } catch (_) { /* ignore */ }
        this.ws = null;
    }
}
