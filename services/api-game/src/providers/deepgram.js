import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";

/**
 * Streaming STT backed by Deepgram Nova-3 (SOTA for French since 2025).
 *
 * Events exposed:
 *  - onInterim(text)              — partial transcript as the user speaks
 *  - onFinal(text, speechFinal)   — is_final=true segment from Deepgram; if
 *                                    speechFinal is true, endpointing triggered
 *                                    (user likely stopped)
 *  - onUtteranceEnd()             — VAD-based end-of-utterance event, arrives
 *                                    after utterance_end_ms of silence even if
 *                                    endpointing didn't fire
 *  - onError(err)
 *
 * Param rules per https://developers.deepgram.com/reference/speech-to-text/listen-streaming :
 *  - Nova-3 accepts language=fr directly (no need for multi).
 *  - utterance_end_ms minimum is 1000 and requires interim_results=true.
 *  - smart_format already enables punctuation — don't also send punctuate=true.
 */
export class DeepgramStreamingSTT {
    constructor(
        apiKey,
        {
            language = "fr",
            sampleRate = 48000,
            endpointingMs = 300,
            utteranceEndMs = 1000,
        } = {},
    ) {
        if (!apiKey) throw new Error("DeepgramStreamingSTT: missing apiKey");
        this.client = createClient(apiKey);
        this.language = language;
        this.sampleRate = sampleRate;
        this.endpointingMs = endpointingMs;
        this.utteranceEndMs = Math.max(1000, utteranceEndMs);
        this.live = null;
        this.onInterim = () => {};
        this.onFinal = () => {};
        this.onUtteranceEnd = () => {};
        this.onError = () => {};
    }

    async start() {
        this.live = this.client.listen.live({
            model: "nova-3",
            language: this.language,
            encoding: "linear16",
            sample_rate: this.sampleRate,
            channels: 1,
            smart_format: true,
            interim_results: true,
            endpointing: this.endpointingMs,
            utterance_end_ms: this.utteranceEndMs,
            vad_events: true,
        });

        await new Promise((resolve, reject) => {
            const to = setTimeout(() => reject(new Error("deepgram open timeout")), 8000);
            this.live.on(LiveTranscriptionEvents.Open, () => { clearTimeout(to); resolve(); });
            this.live.on(LiveTranscriptionEvents.Error, (err) => { clearTimeout(to); reject(err); });
        });

        this.live.on(LiveTranscriptionEvents.Error, (err) => {
            console.error("[deepgram error]", err);
            this.onError(err);
        });

        // Temporary debug: log every event Deepgram fires so we can see silent rejects.
        for (const [evName, evValue] of Object.entries(LiveTranscriptionEvents)) {
            if (["Open", "Error", "Transcript", "UtteranceEnd"].includes(evName)) continue;
            this.live.on(evValue, (...args) => {
                const preview = JSON.stringify(args[0] ?? {}).slice(0, 400);
                console.log(`[dg ${evName}]`, preview);
            });
        }

        this.live.on(LiveTranscriptionEvents.Transcript, (event) => {
            const rawPreview = JSON.stringify(event).slice(0, 400);
            if (!event?.channel?.alternatives?.[0]?.transcript) {
                // Empty transcript — useful to know Deepgram is thinking but not hearing speech.
                console.log("[dg Transcript empty]", rawPreview);
            }
            const text = event?.channel?.alternatives?.[0]?.transcript ?? "";
            if (!text) return;
            if (event.is_final) {
                this.onFinal(text, !!event.speech_final);
            } else {
                this.onInterim(text);
            }
        });

        this.live.on(LiveTranscriptionEvents.UtteranceEnd, () => {
            this.onUtteranceEnd();
        });
    }

    sendAudio(pcm16Buffer) {
        if (!this.live) return;
        if (typeof this.live.getReadyState === "function" && this.live.getReadyState() !== 1) return;
        this.live.send(pcm16Buffer);
    }

    finalize() {
        if (!this.live) return;
        // Send raw Finalize control frame. Avoids the SDK's built-in finalize()
        // which in v3 sends CloseStream under the hood and tears down the WS —
        // we want the connection to survive between utterances so the user can
        // keep push-to-talking without reconnecting.
        try {
            this.live.send(JSON.stringify({ type: "Finalize" }));
        } catch (_) { /* ignore */ }
    }

    keepAlive() {
        if (!this.live) return;
        try {
            this.live.send(JSON.stringify({ type: "KeepAlive" }));
        } catch (_) { /* ignore */ }
    }

    close() {
        if (!this.live) return;
        try { this.live.finish(); } catch (_) { /* ignore */ }
        this.live = null;
    }
}
