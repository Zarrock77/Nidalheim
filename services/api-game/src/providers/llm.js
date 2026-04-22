import OpenAI from "openai";

/**
 * Thin wrapper around OpenAI chat.completions with streaming, tuned for
 * low-latency voice chat: gpt-4o-mini by default, trimmed conversation
 * history, streaming deltas surfaced to the caller.
 */
export class LLMStreaming {
    constructor(
        apiKey,
        {
            model = "llama-3.3-70b-versatile",
            systemPrompt,
            maxHistoryMessages = 20,
            baseURL, // undefined → OpenAI; set to e.g. Groq/Cerebras base URL to swap provider
        } = {},
    ) {
        if (!apiKey) throw new Error("LLMStreaming: missing apiKey");
        if (!systemPrompt) throw new Error("LLMStreaming: missing systemPrompt");
        this.client = new OpenAI({ apiKey, baseURL });
        this.model = model;
        this.systemPrompt = systemPrompt;
        this.maxHistoryMessages = maxHistoryMessages;
        this.history = [];
    }

    async streamResponse(userText, { onDelta, onComplete, onError }) {
        this.history.push({ role: "user", content: userText });
        this._trimHistory();

        const messages = [
            { role: "system", content: this.systemPrompt },
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
                try { onDelta?.(delta); } catch (_) { /* swallow listener errors */ }
            }

            this.history.push({ role: "assistant", content: full });
            this._trimHistory();
            try { onComplete?.(full); } catch (_) { /* ignore */ }
        } catch (err) {
            console.error("[llm error]", err);
            try { onError?.(err); } catch (_) { /* ignore */ }
        }
    }

    _trimHistory() {
        const overflow = this.history.length - this.maxHistoryMessages;
        if (overflow > 0) this.history.splice(0, overflow);
    }
}
