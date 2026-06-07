import OpenAI from "openai";

export type ChatPromptMessage = { role: "system" | "user" | "assistant"; content: string };

export interface ChatEngineConfig {
  groqApiKey?: string | null;
  groqBaseUrl?: string;
  groqModel?: string;
  openaiApiKey?: string | null;
  openaiModel?: string;
}

export interface ChatRespondOptions {
  /** Surcharge ponctuelle du modele Groq pour cet appel (ex. npc.llmModel). */
  model?: string;
  /** Streaming token par token (utilise par la voie vocale pour alimenter le TTS). */
  stream?: boolean;
  onDelta?: (delta: string) => void;
}

/**
 * Moteur de chat unifie pour le texte ET le vocal.
 * Groq en primaire, bascule sur OpenAI si Groq echoue (cle absente, erreur, rate-limit).
 *
 * En streaming : si Groq lache APRES avoir deja emis des tokens, on ne rebascule PAS sur OpenAI
 * (sinon le TTS recevrait la reponse en double) — on remonte l'erreur.
 */
export class ChatEngine {
  private readonly groq: OpenAI | null;
  private readonly openai: OpenAI | null;
  private readonly groqModel: string;
  private readonly openaiModel: string;

  constructor(cfg: ChatEngineConfig) {
    this.groq = cfg.groqApiKey
      ? new OpenAI({ apiKey: cfg.groqApiKey, baseURL: cfg.groqBaseUrl })
      : null;
    this.openai = cfg.openaiApiKey ? new OpenAI({ apiKey: cfg.openaiApiKey }) : null;
    this.groqModel = cfg.groqModel || "llama-3.1-8b-instant";
    this.openaiModel = cfg.openaiModel || process.env.OPENAI_FALLBACK_MODEL || "gpt-4o-mini";
    if (!this.groq && !this.openai) {
      throw new Error("ChatEngine: aucun provider LLM configure (ni Groq ni OpenAI)");
    }
  }

  async respond(messages: ChatPromptMessage[], opts: ChatRespondOptions = {}): Promise<string> {
    const providers: Array<{ label: string; client: OpenAI; model: string }> = [];
    if (this.groq) providers.push({ label: "groq", client: this.groq, model: opts.model || this.groqModel });
    if (this.openai) providers.push({ label: "openai", client: this.openai, model: this.openaiModel });

    let lastErr: unknown;
    for (const p of providers) {
      let emittedAny = false;
      const onDelta = opts.onDelta
        ? (d: string) => { emittedAny = true; opts.onDelta!(d); }
        : undefined;
      try {
        return await this._call(p.client, p.model, messages, opts.stream === true, onDelta);
      } catch (err) {
        lastErr = err;
        if (emittedAny) {
          console.error(`[chat] provider '${p.label}' a echoue en plein flux, pas de fallback (eviter le doublon TTS):`, (err as Error)?.message ?? err);
          throw err;
        }
        console.warn(`[chat] provider '${p.label}' a echoue, bascule fallback:`, (err as Error)?.message ?? err);
      }
    }
    throw lastErr ?? new Error("ChatEngine: tous les providers ont echoue");
  }

  private async _call(
    client: OpenAI,
    model: string,
    messages: ChatPromptMessage[],
    stream: boolean,
    onDelta?: (delta: string) => void,
  ): Promise<string> {
    const sdkMessages = messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[];
    if (stream) {
      const s = await client.chat.completions.create({ model, messages: sdkMessages, stream: true });
      let full = "";
      for await (const chunk of s) {
        const delta = chunk.choices?.[0]?.delta?.content ?? "";
        if (!delta) continue;
        full += delta;
        try { onDelta?.(delta); } catch { /* swallow listener errors */ }
      }
      return full;
    }
    const res = await client.chat.completions.create({ model, messages: sdkMessages });
    return res.choices[0]?.message?.content ?? "";
  }
}
