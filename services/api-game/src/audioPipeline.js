import WebSocket from "ws";
import fs from "fs";
import path from "path";
import { DeepgramStreamingSTT } from "./providers/deepgram.js";
import { ElevenLabsStreamingTTS } from "./providers/elevenlabs.js";
import { CartesiaStreamingTTS } from "./providers/cartesia.js";
import { LLMStreaming } from "./providers/llm.js";
import { ConversationStore } from "./conversationStore.js";
import { SYSTEM_PROMPT } from "./systemPrompt.js";

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
        this.conversationStore = new ConversationStore({ maxHistory: 20 });
        this.utteranceInFlight = false;
        this.pendingTranscript = "";
        this.commitRequested = false;
        this.disposed = false;
        this.keepAliveTimer = null;
        this._audioChunks = 0;
        this._audioBytes = 0;
        // Buffer incoming PCM until the client has told us its capture sample rate
        // (prevents Deepgram from being fed audio at the wrong rate on the first chunks).
        this._awaitingFirstConfig = true;
        this._preConfigBuffer = null;
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

        // Intentionally DON'T open the Deepgram WS here — we wait for the
        // client's first `audio_config` message so we can open it at the
        // correct sample rate from the very first frame (no reconfigure, no
        // cold-start penalty on the first PTT). Persistent TTS still warms up
        // eagerly so it's ready as soon as the LLM emits.
        this._sttOpened = false;

        // Hydrate the LLM with the user's past dialog so the NPC remembers them
        // across sessions. Done in parallel with TTS warmup — neither blocks
        // the first PTT.
        const hydrate = (async () => {
            try {
                const history = await this.conversationStore.loadRecent(this.user.id);
                if (history.length > 0) {
                    this.llm.setHistory(history);
                    console.log(`[pipeline ${this.user.username}] restored ${history.length} past messages`);
                }
            } catch (err) {
                console.error(`[pipeline ${this.user.username}] conversation load failed:`, err?.message ?? err);
            }
        })();

        if (this.ttsRoute.persistent) {
            await this.ttsRoute.instance.start();
            console.log(`[pipeline ${this.user.username}] tts (persistent) ready`);
        }
        await hydrate;

        this.keepAliveTimer = setInterval(() => {
            if (!this.disposed) this.stt.keepAlive();
        }, KEEPALIVE_INTERVAL_MS);
        console.log(`[pipeline ${this.user.username}] started (tts=${this.ttsRoute.kind}); STT waiting for audio_config`);
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
        // If the client hasn't told us its rate yet, briefly buffer so we don't
        // ship audio to a Deepgram WS tuned to the wrong sample rate (would
        // produce empty transcripts until the reconfigure lands).
        if (this._awaitingFirstConfig) {
            if (!this._preConfigBuffer) this._preConfigBuffer = [];
            this._preConfigBuffer.push(pcm16Buffer);
            // Cap the buffer so a misbehaving client can't OOM us (~1 s of audio @ 48 kHz mono).
            if (this._preConfigBuffer.length > 200) this._preConfigBuffer.shift();
            return;
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

    /**
     * Client-reported audio capture parameters (rate, channels, device name).
     * If the sample rate differs from what Deepgram is currently configured
     * for, transparently rebuild the STT WS with the new rate — lets the UE5
     * client swap mic mid-session without restarting the editor.
     */
    async onClientAudioConfig(msg) {
        const rate = Number(msg?.sample_rate);
        if (!Number.isFinite(rate) || rate <= 0) return;
        const device = msg?.device || "(unknown)";
        const hfp = msg?.bluetooth_hfp ? " [Bluetooth HFP]" : "";
        console.log(`[pipeline ${this.user.username}] audio_config: ${rate} Hz from "${device}"${hfp}`);

        try {
            if (!this._sttOpened) {
                // First config ever — open Deepgram straight at the right rate.
                this.stt.sampleRate = rate;
                await this.stt.start();
                this._sttOpened = true;
                console.log(`[pipeline ${this.user.username}] Deepgram opened at ${rate} Hz`);
            } else if (rate !== this.stt.sampleRate) {
                // Mid-session device change — rebuild Deepgram with the new rate.
                console.log(`[pipeline ${this.user.username}] reconfiguring Deepgram: ${this.stt.sampleRate} Hz -> ${rate} Hz`);
                await this.stt.reconfigure({ sampleRate: rate });
                console.log(`[pipeline ${this.user.username}] Deepgram reconfigured at ${rate} Hz`);
            }
        } catch (err) {
            console.error(`[pipeline ${this.user.username}] Deepgram open/reconfigure failed:`, err);
            this._send({ type: "error", message: `stt: ${err?.message ?? err}` });
            return;
        }

        // Flush any audio that arrived before the config (we were buffering).
        this._awaitingFirstConfig = false;
        if (this._preConfigBuffer && this._preConfigBuffer.length) {
            console.log(`[pipeline ${this.user.username}] flushing ${this._preConfigBuffer.length} pre-config audio chunks`);
            for (const buf of this._preConfigBuffer) this.stt.sendAudio(buf);
            this._preConfigBuffer = null;
        }
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
                this.conversationStore
                    .appendTurn(this.user.id, userText, full, "audio")
                    .catch((err) => console.error(`[pipeline ${this.user.username}] history save failed:`, err?.message ?? err));
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
