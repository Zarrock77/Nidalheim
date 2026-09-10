import WebSocket from "ws";
import fs from "fs";
import path from "path";
import { SpeechTurn } from "./speechTurn.js";
import { DeepgramStreamingSTT } from "./providers/deepgram.js";
import { ElevenLabsStreamingTTS } from "./providers/elevenlabs.js";
import { CartesiaStreamingTTS } from "./providers/cartesia.js";
import { ChatEngine } from "./providers/chatEngine.js";
import { buildSystemPrompt } from "./systemPrompt.js";
import { ConversationStore } from "./conversationStore.js";
import { applyDeterministicMissionActions } from "./missionTool.js";
import { acquireMissionState, releaseMissionState, type MissionState } from "./missionState.js";
import type { AuthenticatedUser, ChatMessage, Npc } from "./types.js";

const KEEPALIVE_INTERVAL_MS = 8000;
export const INPUT_FINALIZATION_TIMEOUT_MS = 5000;

export interface AudioPipelineConfig {
  deepgramKey?: string;
  debugAudioDump?: boolean;

  ttsProvider?: string;
  elevenlabsKey?: string;
  elevenlabsVoiceId?: string;
  cartesiaKey?: string;
  cartesiaVoiceId?: string;
  cartesiaModel?: string;
  ttsLanguageCode?: string;
  voiceId?: string;

  openaiKey?: string;
  llmApiKey?: string;
  llmModel?: string;
  llmBaseUrl?: string;
}

type TTSRoute =
  | { kind: "cartesia"; persistent: true; instance: CartesiaStreamingTTS }
  | { kind: "elevenlabs"; persistent: false; make: () => ElevenLabsStreamingTTS };

interface AudioConfigMessage {
  sample_rate?: number;
  device?: string;
  bluetooth_hfp?: boolean;
}

function makeTTS(config: AudioPipelineConfig): TTSRoute {
  const provider = (config.ttsProvider || "cartesia").toLowerCase();
  if (provider === "elevenlabs") {
    return {
      kind: "elevenlabs",
      persistent: false,
      make: () => new ElevenLabsStreamingTTS(config.elevenlabsKey, {
        voiceId: (config.elevenlabsVoiceId ?? config.voiceId) as string,
        languageCode: config.ttsLanguageCode ?? "fr",
      }),
    };
  }
  return {
    kind: "cartesia",
    persistent: true,
    instance: new CartesiaStreamingTTS(config.cartesiaKey, {
      voiceId: (config.cartesiaVoiceId ?? config.voiceId) as string,
      language: config.ttsLanguageCode ?? "fr",
      modelId: config.cartesiaModel ?? "sonic-2",
    }),
  };
}

export class AudioPipeline {
  private readonly clientWs: WebSocket;
  private readonly user: AuthenticatedUser;
  private readonly npc: Npc;
  private readonly config: AudioPipelineConfig;
  private readonly stt: DeepgramStreamingSTT;
  private readonly engine: ChatEngine;
  private readonly ttsRoute: TTSRoute;
  private readonly conversationStore: ConversationStore;
  private readonly missionState: MissionState;

  private utteranceInFlight = false;
  private pendingUtterances: string[] = [];
  private activeSpeech: SpeechTurn | null = null;
  private pendingTranscript = "";
  private commitRequested = false;
  private inputTurnId = 0;
  private inputOpen = false;
  private inputStartSeconds = 0;
  private finalizationTimer: NodeJS.Timeout | null = null;
  private readonly queuedInput: Array<Buffer | null> = [];
  private queuedInputBytes = 0;
  private disposed = false;
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private _audioChunks = 0;
  private _audioBytes = 0;
  private _awaitingFirstConfig = true;
  private _preConfigBuffer: Buffer[] | null = null;
  private _sttOpened = false;
  private _debugStream: fs.WriteStream | null = null;
  private _debugStreamPath: string | null = null;

  constructor(clientWs: WebSocket, user: AuthenticatedUser, npc: Npc, config: AudioPipelineConfig) {
    this.clientWs = clientWs;
    this.user = user;
    this.npc = npc;
    this.config = config;
    this.stt = new DeepgramStreamingSTT(config.deepgramKey);
    this.engine = new ChatEngine({
      groqApiKey: config.llmApiKey,
      groqBaseUrl: config.llmBaseUrl,
      groqModel: config.llmModel,
      openaiApiKey: config.openaiKey,
    });
    this.ttsRoute = makeTTS(config);
    this.conversationStore = new ConversationStore({ maxHistory: 20 });
    // Etat des missions partage avec le canal texte du meme joueur (cf. missionState.ts).
    this.missionState = acquireMissionState(user.id, npc.id);
  }

  async start(): Promise<void> {
    this.stt.onInterim = (text) => {
      if (!this.inputOpen || this.disposed) return;
      this._send({ type: "user_transcript_partial", data: text });
    };

    this.stt.onFinal = (text, speechFinal, info) => {
      if (!this.inputOpen || this.disposed) return;
      if (info.end !== null && info.end <= this.inputStartSeconds + 0.0001) return;
      const clean = text.trim();
      if (clean) {
        this._send({ type: "user_transcript", data: text });
        this.pendingTranscript = this.pendingTranscript
          ? `${this.pendingTranscript} ${clean}`
          : clean;
      }
      console.log(`[pipeline ${this.user.username}] stt final: "${text}" speech_final=${speechFinal} commit=${this.commitRequested}`);
      // PTT ends at COMMIT, not at a pause midway through a sentence.
      // A final segment alone may precede the remaining words of this turn.
      if (this.commitRequested && ((info.fromFinalize && info.end !== null) || this._inputAudioProcessed())) {
        this._flushUtterance();
      }
    };

    this.stt.onUtteranceEnd = () => {
      if (this.commitRequested && this._inputAudioProcessed()) {
        this._flushUtterance();
      }
    };

    this.stt.onError = (err) => {
      this._failInput(`speech-to-text: ${err?.message ?? err}`);
    };

    this._sttOpened = false;

    if (this.ttsRoute.persistent) {
      await this.ttsRoute.instance.start();
      if (this.disposed) { this.ttsRoute.instance.close(); return; }
      console.log(`[pipeline ${this.user.username}] tts (persistent) ready`);
    }

    this.keepAliveTimer = setInterval(() => {
      if (!this.disposed) this.stt.keepAlive();
    }, KEEPALIVE_INTERVAL_MS);
    console.log(`[pipeline ${this.user.username}] started (tts=${this.ttsRoute.kind}); STT waiting for audio_config`);
  }

  onClientAudio(pcm16Buffer: Buffer): void {
    if (this.disposed || !pcm16Buffer.length) return;
    if (this.commitRequested) {
      // Do not mix a new recording with STT results still closing the previous one.
      this.queuedInputBytes += pcm16Buffer.length;
      if (this.queuedInputBytes > this.stt.sampleRate * 2 * 15) {
        this._failInput("Trop de paroles en attente. Reessayez dans un instant.");
        return;
      }
      this.queuedInput.push(pcm16Buffer);
      return;
    }
    if (!this.inputOpen) {
      this.inputOpen = true;
      this.inputTurnId++;
      this.inputStartSeconds = this.stt.audioSecondsSent;
    }
    this._audioChunks++;
    this._audioBytes += pcm16Buffer.length;
    if (this._audioChunks === 1 || this._audioChunks % 100 === 0) {
      console.log(`[pipeline ${this.user.username}] audio chunk #${this._audioChunks}, ${pcm16Buffer.length}B (cum ${this._audioBytes}B)`);
    }
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
    if (this._awaitingFirstConfig) {
      if (!this._preConfigBuffer) this._preConfigBuffer = [];
      this._preConfigBuffer.push(pcm16Buffer);
      if (this._preConfigBuffer.length > 200) this._preConfigBuffer.shift();
      return;
    }
    this.stt.sendAudio(pcm16Buffer);
  }

  onClientCommit(): void {
    if (this.disposed) return;
    if (this.commitRequested) {
      if (this.queuedInput.length && this.queuedInput[this.queuedInput.length - 1] !== null) {
        this.queuedInput.push(null);
      }
      return;
    }
    if (!this.inputOpen) return;
    console.log(`[pipeline ${this.user.username}] commit received (chunks so far: ${this._audioChunks})`);
    this.commitRequested = true;
    const turnId = this.inputTurnId;
    this.finalizationTimer = setTimeout(() => {
      if (this.commitRequested && this.inputTurnId === turnId) {
        this._failInput("La transcription n'a pas pu se terminer. Reessayez votre phrase.");
      }
    }, INPUT_FINALIZATION_TIMEOUT_MS);
    this._finalizeInput();
  }

  private _inputAudioProcessed(): boolean {
    return this._sttOpened && this.stt.audioSecondsSent > 0
      && this.stt.finalAudioSeconds + 0.0001 >= this.stt.audioSecondsSent;
  }

  private _finalizeInput(): void {
    if (this.disposed || !this.commitRequested || !this._sttOpened) return;
    if (this._inputAudioProcessed()) this._flushUtterance();
    else if (!this.stt.finalize()) this._failInput("La reconnaissance vocale est deconnectee. Reessayez.");
  }

  private _failInput(message: string): void {
    if (this.disposed) return;
    console.error(`[pipeline ${this.user.username}] input turn ${this.inputTurnId} failed: ${message}`);
    this._send({ type: "error", message });
    // Reconnect starts a fresh STT timeline; old results cannot enter the next turn.
    this.shutdown();
    this.clientWs.close(1011, "speech input failed");
  }

  async onClientAudioConfig(msg: AudioConfigMessage): Promise<void> {
    if (this.disposed) return;
    const rate = Number(msg?.sample_rate);
    if (!Number.isFinite(rate) || rate <= 0) return;
    const device = msg?.device || "(unknown)";
    const hfp = msg?.bluetooth_hfp ? " [Bluetooth HFP]" : "";
    console.log(`[pipeline ${this.user.username}] audio_config: ${rate} Hz from "${device}"${hfp}`);

    try {
      if (!this._sttOpened) {
        this.stt.sampleRate = rate;
        await this.stt.start();
        this._sttOpened = true;
        console.log(`[pipeline ${this.user.username}] Deepgram opened at ${rate} Hz`);
      } else if (rate !== this.stt.sampleRate) {
        if (this.inputOpen) { this._failInput("Le format du microphone a change. Reessayez."); return; }
        console.log(`[pipeline ${this.user.username}] reconfiguring Deepgram: ${this.stt.sampleRate} Hz -> ${rate} Hz`);
        await this.stt.reconfigure({ sampleRate: rate });
        console.log(`[pipeline ${this.user.username}] Deepgram reconfigured at ${rate} Hz`);
      }
    } catch (err) {
      console.error(`[pipeline ${this.user.username}] Deepgram open/reconfigure failed:`, err);
      this._send({ type: "error", message: `stt: ${(err as Error)?.message ?? err}` });
      return;
    }

    if (this.disposed) { this.stt.close(); return; }

    this._awaitingFirstConfig = false;
    if (this._preConfigBuffer && this._preConfigBuffer.length) {
      console.log(`[pipeline ${this.user.username}] flushing ${this._preConfigBuffer.length} pre-config audio chunks`);
      for (const buf of this._preConfigBuffer) this.stt.sendAudio(buf);
      this._preConfigBuffer = null;
    }
    this._finalizeInput();
  }

  private _flushUtterance(): void {
    if (!this.commitRequested || !this.inputOpen || this.disposed) return;
    const text = this.pendingTranscript;
    if (this.finalizationTimer) clearTimeout(this.finalizationTimer);
    this.finalizationTimer = null;
    this.pendingTranscript = "";
    this.commitRequested = false;
    this.inputOpen = false;
    this._audioChunks = 0;
    this._audioBytes = 0;
    console.log(`[pipeline ${this.user.username}] input turn ${this.inputTurnId} finalized (${text.length} characters)`);
    if (text) void this._handleUtterance(text);
    else this._send({ type: "error", message: "Aucune parole reconnue. Reessayez votre phrase." });
    while (this.queuedInput.length && !this.commitRequested && !this.disposed) {
      const next = this.queuedInput.shift()!;
      if (next === null) this.onClientCommit();
      else {
        this.queuedInputBytes -= next.length;
        this.onClientAudio(next);
      }
    }
  }

  private async _handleUtterance(userText: string): Promise<void> {
    if (this.disposed) return;
    if (this.utteranceInFlight) {
      if (this.pendingUtterances.length < 4) this.pendingUtterances.push(userText);
      else this._send({ type: "error", message: "Trop de demandes vocales en attente. Attendez la reponse du PNJ." });
      return;
    }
    this.utteranceInFlight = true;
    const t0 = Date.now();
    const mark = (label: string): void => console.log(`[pipeline ${this.user.username}] +${Date.now() - t0}ms ${label}`);
    let speech: SpeechTurn | null = null;
    try {
      const tts = this.ttsRoute.persistent ? this.ttsRoute.instance : this.ttsRoute.make();
      const turn = new SpeechTurn(tts, (event) => this._send(event), !this.ttsRoute.persistent,
        () => mark("first audio chunk"));
      speech = this.activeSpeech = turn;
      mark("llm call");
      let firstTokenAt: number | null = null;

      // Reload shared text/voice history before each serialized turn.
      let history: ChatMessage[] = [];
      try {
        history = await this.conversationStore.loadRecent(this.user.id, this.npc.id);
      } catch (err) {
        console.error(`[pipeline ${this.user.username}/${this.npc.id}] history load failed:`, (err as Error)?.message ?? err);
      }
      if (this.disposed) return;
      const actions = applyDeterministicMissionActions(this.missionState);
      for (const ev of actions.events) {
        this._send({ ...ev });
        console.log(`[pipeline ${this.user.username}/${this.npc.id}] ${ev.type} ${ev.missionId ?? "-"} (auto)`);
      }
      const messages = [
        { role: "system" as const, content: buildSystemPrompt(this.npc, this.missionState.all(), this.missionState.getInventory()) },
        ...history,
        { role: "user" as const, content: userText },
        ...actions.notes.map((n) => ({ role: "system" as const, content: n })),
      ];
      const full = await this.engine.respond(messages, {
        stream: true,
        onDelta: (delta) => {
          if (!firstTokenAt) {
            firstTokenAt = Date.now();
            mark("first LLM token");
          }
          turn.write(delta);
        },
      });
      if (this.disposed) return;
      mark("llm complete");
      console.log(`[pipeline ${this.user.username}/${this.npc.id}] NPC reply: "${full}"`);
      this._send({ type: "text", data: full });
      // Finish TTS immediately; database latency must not delay the last audio.
      await Promise.all([
        turn.finishText(),
        this.conversationStore.appendTurn(this.user.id, this.npc.id, userText, full, "audio")
          .catch((err) => console.error(`[pipeline ${this.user.username}/${this.npc.id}] history save failed:`, (err as Error)?.message ?? err)),
      ]);
    } catch (err) {
      speech?.cancel();
      this._send({ type: "error", message: "Le dialogue vocal a ete interrompu." });
      console.error("[pipeline] voice turn failed", (err as Error)?.message);
    } finally {
      // Also wait for connection cleanup on failure before reusing a persistent provider.
      await speech?.finishText();
      if (this.activeSpeech === speech) this.activeSpeech = null;
      this.utteranceInFlight = false;
      const next = this.pendingUtterances.shift();
      if (next && !this.disposed) void this._handleUtterance(next);
    }
  }

  private _send(obj: Record<string, unknown>): void {
    if (this.disposed || this.clientWs.readyState !== WebSocket.OPEN) return;
    this.clientWs.send(JSON.stringify(obj));
  }

  shutdown(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.finalizationTimer) clearTimeout(this.finalizationTimer);
    this.finalizationTimer = null;
    this.queuedInput.length = 0;
    this.queuedInputBytes = 0;
    this._preConfigBuffer = null;
    this.pendingTranscript = "";
    this.commitRequested = false;
    this.inputOpen = false;
    this.pendingUtterances = [];
    this.activeSpeech?.cancel();
    this.activeSpeech = null;
    releaseMissionState(this.user.id, this.npc.id);
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
    if (this.ttsRoute.persistent) {
      this.ttsRoute.instance.close();
    }
    console.log(`[pipeline ${this.user?.username ?? "?"}] shutdown`);
  }
}
