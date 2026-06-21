import OpenAI from "openai";

export type ChatPromptMessage = { role: "system" | "user" | "assistant"; content: string };

type SdkMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type SdkTool = OpenAI.Chat.Completions.ChatCompletionTool;
type SdkToolCall = OpenAI.Chat.Completions.ChatCompletionMessageToolCall;

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
  /** Tools (function-calling) exposes au LLM. */
  tools?: SdkTool[];
  /** Appele quand le LLM invoque un tool ; retourne le resultat (string) renvoye au LLM. */
  onToolCall?: (name: string, argumentsJson: string) => Promise<string> | string;
}

const MAX_TOOL_ROUNDS = 4;

/**
 * Certains modeles (Llama via Groq) emettent un appel d'outil EN TEXTE dans le contenu
 * ("<function=name>{args}</function>") au lieu d'un tool_call structure. On l'extrait pour en
 * faire un VRAI tool_call (l'outil s'execute), et on renvoie le texte debarrasse du fragment.
 */
function extractTextToolCalls(content: string): { calls: SdkToolCall[]; cleaned: string } {
  const re = /<function\s*=\s*"?([a-zA-Z0-9_.-]+)"?\s*>([\s\S]*?)<\/function\s*>/gi;
  const calls: SdkToolCall[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const rawArgs = (m[2] || "").trim();
    calls.push({
      id: `txt_${m[1]}_${calls.length}`,
      type: "function",
      function: { name: m[1], arguments: rawArgs.startsWith("{") ? rawArgs : "{}" },
    });
  }
  const cleaned = content
    .replace(re, "")
    .replace(/<\/?function\b[^>]*>/gi, "") // balises orphelines (appel tronque par le modele)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { calls, cleaned };
}

/**
 * Unifie les deux formats de tool-call du modele. Si le contenu contient une syntaxe d'outil
 * en texte, on la convertit en tool_call structure (quand il n'y en a pas deja) et on nettoie
 * toujours le texte affiche. Ainsi l'outil s'EXECUTE vraiment au lieu d'etre juste masque.
 */
function normalizeToolCalls(text: string, structured: SdkToolCall[]): { text: string; toolCalls: SdkToolCall[] } {
  if (!/<\/?function\b/i.test(text)) {
    return { text, toolCalls: structured };
  }
  const { calls, cleaned } = extractTextToolCalls(text);
  return { text: cleaned, toolCalls: structured.length ? structured : calls };
}

/**
 * Moteur de chat unifie pour le texte ET le vocal.
 * Groq en primaire, bascule sur OpenAI si Groq echoue (cle absente, erreur, rate-limit).
 * Gere le function-calling (tools) avec boucle d'appel + accumulation des tool_calls en streaming.
 *
 * En streaming : si Groq lache APRES avoir deja emis du texte, on ne rebascule PAS sur OpenAI
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
        return await this._runConversation(p.client, p.model, messages, opts, onDelta);
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

  /** Boucle conversationnelle : appelle le LLM, execute les tools demandes, recommence jusqu'a une reponse texte. */
  private async _runConversation(
    client: OpenAI,
    model: string,
    baseMessages: ChatPromptMessage[],
    opts: ChatRespondOptions,
    onDelta?: (delta: string) => void,
  ): Promise<string> {
    const msgs: SdkMessage[] = baseMessages.map((m) => ({ role: m.role, content: m.content }));
    const useTools = !!(opts.tools && opts.tools.length && opts.onToolCall);
    const maxRounds = useTools ? MAX_TOOL_ROUNDS : 1;

    // Accumule le texte de TOUS les tours -> reste coherent avec ce qui a ete streame au TTS
    // (le modele peut narrer un peu avant d'appeler le tool, puis confirmer apres).
    let finalText = "";
    for (let round = 0; round < maxRounds; round++) {
      // Au dernier tour, on retire les tools pour forcer une reponse texte (anti-boucle).
      const tools = useTools && round < maxRounds - 1 ? opts.tools : undefined;
      const { text, toolCalls } = await this._callOnce(client, model, msgs, tools, opts.stream === true, onDelta);
      finalText += text;

      if (toolCalls.length && opts.onToolCall) {
        msgs.push({ role: "assistant", content: text || null, tool_calls: toolCalls });
        for (const tc of toolCalls) {
          if (tc.type !== "function") continue;
          let result = "ok";
          try {
            result = await opts.onToolCall(tc.function.name, tc.function.arguments);
          } catch (err) {
            result = `error: ${(err as Error)?.message ?? err}`;
          }
          msgs.push({ role: "tool", tool_call_id: tc.id, content: result });
        }
        continue;
      }
      return finalText;
    }
    return finalText;
  }

  private async _callOnce(
    client: OpenAI,
    model: string,
    msgs: SdkMessage[],
    tools: SdkTool[] | undefined,
    stream: boolean,
    onDelta?: (delta: string) => void,
  ): Promise<{ text: string; toolCalls: SdkToolCall[] }> {
    if (stream) {
      const s = await client.chat.completions.create({ model, messages: msgs, tools, stream: true });
      let full = "";
      const acc: Record<number, { id: string; name: string; args: string }> = {};
      for await (const chunk of s) {
        const delta = chunk.choices?.[0]?.delta;
        if (delta?.content) {
          full += delta.content;
          try { onDelta?.(delta.content); } catch { /* swallow listener errors */ }
        }
        for (const tc of delta?.tool_calls ?? []) {
          const i = tc.index ?? 0;
          const a = (acc[i] ??= { id: "", name: "", args: "" });
          if (tc.id) a.id = tc.id;
          if (tc.function?.name) a.name += tc.function.name;
          if (tc.function?.arguments) a.args += tc.function.arguments;
        }
      }
      const toolCalls: SdkToolCall[] = Object.values(acc)
        .filter((a) => a.name)
        .map((a) => ({ id: a.id, type: "function", function: { name: a.name, arguments: a.args } }));
      return normalizeToolCalls(full, toolCalls);
    }

    const res = await client.chat.completions.create({ model, messages: msgs, tools });
    const m = res.choices[0]?.message;
    return normalizeToolCalls(m?.content ?? "", (m?.tool_calls ?? []) as SdkToolCall[]);
  }
}
