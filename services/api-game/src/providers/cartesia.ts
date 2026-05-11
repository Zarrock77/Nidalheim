import WebSocket from "ws";
import { randomUUID } from "crypto";

export interface CartesiaStreamingTTSOptions {
  voiceId: string;
  modelId?: string;
  language?: string;
  sampleRate?: number;
  apiVersion?: string;
}

interface CartesiaFrame {
  context_id: string | null;
  model_id: string;
  transcript: string;
  voice: { mode: "id"; id: string };
  language: string;
  output_format: {
    container: "raw";
    encoding: "pcm_s16le";
    sample_rate: number;
  };
  continue: boolean;
}

interface CartesiaMessage {
  context_id?: string;
  type?: string;
  data?: string;
  error?: string;
  done?: boolean;
}

export class CartesiaStreamingTTS {
  private readonly apiKey: string;
  private readonly voiceId: string;
  private readonly modelId: string;
  private readonly language: string;
  private readonly sampleRate: number;
  private readonly apiVersion: string;
  private ws: WebSocket | null = null;
  private contextId: string | null = null;

  onAudio: (base64Pcm: string) => void = () => {};
  onFinal: () => void = () => {};
  onError: (err: Error) => void = () => {};

  constructor(
    apiKey: string | undefined | null,
    {
      voiceId,
      modelId = "sonic-2",
      language = "fr",
      sampleRate = 24000,
      apiVersion = "2024-11-13",
    }: CartesiaStreamingTTSOptions,
  ) {
    if (!apiKey) throw new Error("CartesiaStreamingTTS: missing apiKey");
    if (!voiceId) throw new Error("CartesiaStreamingTTS: missing voiceId");
    this.apiKey = apiKey;
    this.voiceId = voiceId;
    this.modelId = modelId;
    this.language = language;
    this.sampleRate = sampleRate;
    this.apiVersion = apiVersion;
  }

  async start(): Promise<void> {
    const qs = new URLSearchParams({
      api_key: this.apiKey,
      cartesia_version: this.apiVersion,
    });
    const url = `wss://api.cartesia.ai/tts/websocket?${qs}`;
    this.ws = new WebSocket(url);
    const ws = this.ws;

    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error("cartesia open timeout")), 8000);
      ws.once("open", () => { clearTimeout(to); resolve(); });
      ws.once("error", (err) => { clearTimeout(to); reject(err); });
      ws.once("unexpected-response", (_req, res) => {
        let body = "";
        res.on("data", (d: Buffer) => (body += d.toString()));
        res.on("end", () => {
          clearTimeout(to);
          reject(new Error(`HTTP ${res.statusCode} — ${body.slice(0, 200)}`));
        });
      });
    });

    ws.on("error", (err) => {
      console.error("[cartesia error]", err);
      this.onError(err);
    });

    ws.on("close", () => {
      this.ws = null;
    });

    ws.on("message", (raw: WebSocket.RawData) => {
      let msg: CartesiaMessage;
      try {
        msg = JSON.parse(raw.toString()) as CartesiaMessage;
      } catch {
        return;
      }
      if (msg.context_id && msg.context_id !== this.contextId) return;

      if (msg.type === "chunk" && msg.data) {
        this.onAudio(msg.data);
      }
      if (msg.type === "error") {
        console.error("[cartesia reply error]", msg);
        this.onError(new Error(msg.error ?? "cartesia error"));
      }
      if (msg.done === true || msg.type === "done") {
        if (msg.context_id && msg.context_id === this.contextId) {
          this.contextId = null;
        }
        this.onFinal();
      }
    });
  }

  beginUtterance(): void {
    this.contextId = randomUUID();
  }

  sendText(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (!text) return;
    if (!this.contextId) this.beginUtterance();
    this.ws.send(JSON.stringify(this._frame(text, true)));
  }

  flush(): string | null | undefined {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (!this.contextId) return;
    this.ws.send(JSON.stringify(this._frame("", false)));
    return this.contextId;
  }

  close(): void {
    if (!this.ws) return;
    try { this.ws.close(); } catch { /* ignore */ }
    this.ws = null;
    this.contextId = null;
  }

  private _frame(transcript: string, cont: boolean): CartesiaFrame {
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
