import WebSocket from "ws";
import fs from "fs";
import path from "path";
import { DeepgramStreamingSTT } from "./providers/deepgram.js";
import { ElevenLabsStreamingTTS } from "./providers/elevenlabs.js";
import { CartesiaStreamingTTS } from "./providers/cartesia.js";
import { LLMStreaming } from "./providers/llm.js";

const SYSTEM_PROMPT =
    "Tu es un villageois du village appelé Nidalheim. Tu parles uniquement en Français. " +
    "Tu es serviable : si on te pose une question, tu réponds. " +
    "Lorsque tu parles, tu es le plus concis possible — une seule phrase, courte si possible.";

const KEEPALIVE_INTERVAL_MS = 8000;

function makeTTS(config) {
    const provider = (config.ttsProvider || "cartesia").toLowerCase();
    if (provider === "elevenlabs") {
        return { kind: "elevenlabs", persistent: false, make: () => new ElevenLabsStreamingTTS(config.elevenlabsKey, {
            voiceId: config.elevenlabsVoiceId ?? config.voiceId,
            languageCode: config.ttsLanguageCode ?? "fr",
        }) };
    }
    return { kind: "cartesia", persistent: true, instance: new CartesiaStreamingTTS(config.cartesiaKey, {
        voiceId: config.cartesiaVoiceId ?? config.voiceId,
        language: config.ttsLanguageCode ?? "fr",
        modelId: config.cartesiaModel ?? "sonic-2",
    }) };
}

/**
 * Orchestrates streaming STT → LLM → TTS for a single client WebSocket.
 *
 * Cartesia path: a single persistent TTS WS lives for the whole session; each
 * NPC reply just allocates a new context_id on the shared socket. Eliminates
 * the per-turn 500-700 ms handshake to US-East.
 *
 * ElevenLabs path: stream-input is one-shot by API contract, so a fresh WS is
 * opened per reply (accepting the handshake cost).
 */
export class AudioPipeline {
    constructor(clientWs, user, config) {
        this.clientWs = clientWs;
        this.user = user;
        this.config = config;
        this.stt = new DeepgramStreamingSTT(config.deepgramKey);
        this.llm = new LLMStreaming(config.llmApiKey ?? config.openaiKey, {
            systemPrompt: SYSTEM_PROMPT,
            model: config.llmModel,
            baseURL: config.llmBaseUrl,
        });
        this.ttsRoute = makeTTS(config);
        this.utteranceInFlight = false;
        this.pendingTranscript = "";
        this.commitRequested = false;
        this.disposed = false;
        this.keepAliveTimer = null;
        this._audioChunks = 0;
        this._audioBytes = 0;
    }

    async start() {
        this.stt.onInterim = (text) => {
            this._send({ type: "user_transcript_partial", data: text });
        };

        this.stt.onFinal = (text, speechFinal) => {
            this._send({ type: "user_transcript", data: text });
            const clean = text.trim();
            if (clean) {
                this.pendingTranscript = this.pendingTranscript
                    ? `${this.pendingTranscript} ${clean}`
                    : clean;
            }
            console.log(`[pipeline ${this.user.username}] stt final: "${text}" speech_final=${speechFinal} commit=${this.commitRequested}`);
            if ((speechFinal || this.commitRequested) && this.pendingTranscript) {
                this._flushUtterance();
            }
        };

        this.stt.onUtteranceEnd = () => {
            if (this.commitRequested && this.pendingTranscript) {
                this._flushUtterance();
            }
        };

        this.stt.onError = (err) => {
            this._send({ type: "error", message: `speech-to-text: ${err?.message ?? err}` });
        };

        // Pre-warm STT and (if applicable) persistent TTS in parallel.
        const startups = [this.stt.start()];
        if (this.ttsRoute.persistent) {
            startups.push(
                this.ttsRoute.instance.start().then(() => {
                    console.log(`[pipeline ${this.user.username}] tts (persistent) ready`);
                }),
            );
        }
        await Promise.all(startups);

        this.keepAliveTimer = setInterval(() => {
            if (!this.disposed) this.stt.keepAlive();
        }, KEEPALIVE_INTERVAL_MS);
        console.log(`[pipeline ${this.user.username}] started (tts=${this.ttsRoute.kind})`);
    }

    onClientAudio(pcm16Buffer) {
        if (this.disposed) return;
        this._audioChunks++;
        this._audioBytes += pcm16Buffer.length;
        if (this._audioChunks === 1 || this._audioChunks % 100 === 0) {
            console.log(`[pipeline ${this.user.username}] audio chunk #${this._audioChunks}, ${pcm16Buffer.length}B (cum ${this._audioBytes}B)`);
        }
        // Debug: mirror the incoming PCM to a file so we can replay it offline
        // and confirm whether Deepgram is receiving intelligible speech.
        if (this.config.debugAudioDump) {
            if (!this._debugStream) {
                const dir = "/tmp";
                const file = path.join(dir, `nidalheim-audio-${this.user.username}-${Date.now()}.raw`);
                this._debugStream = fs.createWriteStream(file);
                this._debugStreamPath = file;
                console.log(`[pipeline ${this.user.username}] [debug] dumping PCM16LE @ 16kHz mono to ${file}`);
            }
            this._debugStream.write(pcm16Buffer);
        }
        this.stt.sendAudio(pcm16Buffer);
    }

    onClientCommit() {
        if (this.disposed) return;
        console.log(`[pipeline ${this.user.username}] commit received (chunks so far: ${this._audioChunks})`);
        this.commitRequested = true;
        this.stt.finalize();
        this._audioChunks = 0;
        this._audioBytes = 0;
    }

    _flushUtterance() {
        const text = this.pendingTranscript;
        this.pendingTranscript = "";
        this.commitRequested = false;
        if (!text) return;
        this._handleUtterance(text);
    }

    async _handleUtterance(userText) {
        if (this.utteranceInFlight) {
            console.log(`[pipeline ${this.user.username}] LLM already in flight, dropping "${userText}"`);
            return;
        }
        this.utteranceInFlight = true;
        const t0 = Date.now();
        const mark = (label) => console.log(`[pipeline ${this.user.username}] +${Date.now() - t0}ms ${label}`);

        // Acquire TTS — persistent (Cartesia) or one-shot (ElevenLabs).
        let tts;
        let needCloseOnDone = false;
        if (this.ttsRoute.persistent) {
            tts = this.ttsRoute.instance;
            tts.beginUtterance();
        } else {
            tts = this.ttsRoute.make();
            needCloseOnDone = true;
        }

        let firstAudioAt = null;
        const onAudio = (base64Pcm) => {
            if (!firstAudioAt) {
                firstAudioAt = Date.now();
                mark("first audio chunk");
            }
            this._send({ type: "audio", data: base64Pcm });
        };
        const onErr = (err) => {
            console.error(`[pipeline ${this.user.username}] tts error`, err);
            this._send({ type: "error", message: `text-to-speech: ${err?.message ?? err}` });
        };
        tts.onAudio = onAudio;
        tts.onError = onErr;

        // If one-shot, we must wait for the WS handshake before streaming text.
        // If persistent, it's already open from pipeline.start() — no wait needed.
        const ttsReadyPromise = this.ttsRoute.persistent
            ? Promise.resolve(true)
            : tts.start().then(
                  () => { mark("tts ready"); return true; },
                  (err) => { mark(`tts start FAILED ${err?.message ?? err}`); onErr(err); return false; },
              );

        const pendingDeltas = [];
        let ttsReady = this.ttsRoute.persistent;
        let ttsFailed = false;
        if (!ttsReady) {
            ttsReadyPromise.then((ok) => {
                ttsReady = ok;
                if (!ok) { ttsFailed = true; return; }
                for (const d of pendingDeltas) tts.sendText(d);
                pendingDeltas.length = 0;
            });
        }

        mark("llm call");
        let firstTokenAt = null;
        await this.llm.streamResponse(userText, {
            onDelta: (delta) => {
                if (!firstTokenAt) {
                    firstTokenAt = Date.now();
                    mark("first LLM token");
                }
                if (ttsFailed) return;
                if (ttsReady) {
                    tts.sendText(delta);
                } else {
                    pendingDeltas.push(delta);
                }
            },
            onComplete: (full) => {
                mark("llm complete");
                console.log(`[pipeline ${this.user.username}] NPC reply: "${full}"`);
                this._send({ type: "text", data: full });
                ttsReadyPromise.then((ok) => {
                    if (!ok) return;
                    tts.flush();
                    if (needCloseOnDone) {
                        // ElevenLabs auto-closes on isFinal; nothing more to do.
                    }
                });
            },
            onError: (err) => {
                this._send({ type: "error", message: `llm: ${err?.message ?? err}` });
                if (needCloseOnDone) tts.close();
            },
        });

        this.utteranceInFlight = false;
    }

    _send(obj) {
        if (this.clientWs.readyState !== WebSocket.OPEN) return;
        this.clientWs.send(JSON.stringify(obj));
    }

    shutdown() {
        if (this.disposed) return;
        this.disposed = true;
        if (this.keepAliveTimer) {
            clearInterval(this.keepAliveTimer);
            this.keepAliveTimer = null;
        }
        if (this._debugStream) {
            this._debugStream.end();
            console.log(`[pipeline ${this.user?.username ?? "?"}] [debug] closed PCM dump ${this._debugStreamPath}`);
            this._debugStream = null;
        }
        this.stt.close();
        if (this.ttsRoute.persistent && this.ttsRoute.instance) {
            this.ttsRoute.instance.close();
        }
        console.log(`[pipeline ${this.user?.username ?? "?"}] shutdown`);
    }
}
