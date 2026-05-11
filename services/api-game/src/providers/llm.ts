import OpenAI from "openai";
import type { ChatMessage } from "../types.js";

export interface LLMStreamingOptions {
  model?: string;
  systemPrompt: string;
  maxHistoryMessages?: number;
  baseURL?: string;
}

export interface StreamResponseCallbacks {
  onDelta?: (delta: string) => void;
  onComplete?: (full: string) => void;
  onError?: (err: unknown) => void;
}

export class LLMStreaming {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly systemPrompt: string;
  private readonly maxHistoryMessages: number;
  private history: ChatMessage[] = [];

  constructor(
    apiKey: string | undefined | null,
    {
      model = "llama-3.3-70b-versatile",
      systemPrompt,
      maxHistoryMessages = 20,
      baseURL,
    }: LLMStreamingOptions,
  ) {
    if (!apiKey) throw new Error("LLMStreaming: missing apiKey");
    if (!systemPrompt) throw new Error("LLMStreaming: missing systemPrompt");
    this.client = new OpenAI({ apiKey, baseURL });
    this.model = model;
    this.systemPrompt = systemPrompt;
    this.maxHistoryMessages = maxHistoryMessages;
  }

  setHistory(messages: unknown): void {
    if (!Array.isArray(messages)) {
      this.history = [];
      return;
    }
    this.history = messages
      .filter((m): m is ChatMessage =>
        !!m &&
        typeof m === "object" &&
        (("role" in m && (m.role === "user" || m.role === "assistant"))) &&
        ("content" in m && typeof (m as { content: unknown }).content === "string"),
      )
      .map((m) => ({ role: m.role, content: m.content }));
    this._trimHistory();
  }

  getHistory(): ChatMessage[] {
    return this.history.slice();
  }

  async streamResponse(userText: string, callbacks: StreamResponseCallbacks): Promise<void> {
    const { onDelta, onComplete, onError } = callbacks;
    this.history.push({ role: "user", content: userText });
    this._trimHistory();

    const messages = [
      { role: "system" as const, content: this.systemPrompt },
      ...this.history,
    ];

    let full = "";
    try {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages,
        stream: true,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content ?? "";
        if (!delta) continue;
        full += delta;
        try { onDelta?.(delta); } catch { /* swallow listener errors */ }
      }

      this.history.push({ role: "assistant", content: full });
      this._trimHistory();
      try { onComplete?.(full); } catch { /* ignore */ }
    } catch (err) {
      console.error("[llm error]", err);
      try { onError?.(err); } catch { /* ignore */ }
    }
  }

  private _trimHistory(): void {
    const overflow = this.history.length - this.maxHistoryMessages;
    if (overflow > 0) this.history.splice(0, overflow);
  }
}
