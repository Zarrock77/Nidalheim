import { LLMStreaming, type LLMStreamingOptions } from "../src/providers/llm.js";

const build = (overrides: Partial<LLMStreamingOptions> = {}): LLMStreaming =>
  new LLMStreaming("test-api-key", {
    systemPrompt: "test system prompt",
    maxHistoryMessages: 3,
    ...overrides,
  });

describe("LLMStreaming", () => {
  describe("constructor", () => {
    it("throws when apiKey is missing", () => {
      expect(() => new LLMStreaming(null, { systemPrompt: "x" })).toThrow(/apiKey/);
    });

    it("throws when systemPrompt is missing", () => {
      expect(() => new LLMStreaming("key", { systemPrompt: "" })).toThrow(/systemPrompt/);
    });

    it("starts with an empty history", () => {
      expect(build().getHistory()).toEqual([]);
    });
  });

  describe("setHistory", () => {
    it("filters out non user/assistant roles and malformed entries", () => {
      const llm = build();
      llm.setHistory([
        { role: "user", content: "a" },
        { role: "system", content: "ignored" },
        { role: "assistant", content: "b" },
        { content: "no role" },
        { role: "user", content: 123 },
        null,
        undefined,
      ]);
      expect(llm.getHistory()).toEqual([
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
      ]);
    });

    it("clamps history to maxHistoryMessages (keeps the most recent)", () => {
      const llm = build({ maxHistoryMessages: 3 });
      llm.setHistory([
        { role: "user", content: "1" },
        { role: "assistant", content: "2" },
        { role: "user", content: "3" },
        { role: "assistant", content: "4" },
      ]);
      const history = llm.getHistory();
      expect(history).toHaveLength(3);
      expect(history[0]).toEqual({ role: "assistant", content: "2" });
      expect(history[2]).toEqual({ role: "assistant", content: "4" });
    });

    it("resets to empty when called with a non-array", () => {
      const llm = build();
      llm.setHistory([{ role: "user", content: "x" }]);
      llm.setHistory(null);
      expect(llm.getHistory()).toEqual([]);
    });
  });

  describe("getHistory", () => {
    it("returns a defensive copy", () => {
      const llm = build();
      llm.setHistory([{ role: "user", content: "x" }]);
      const snapshot = llm.getHistory();
      snapshot.push({ role: "assistant", content: "mutated" });
      expect(llm.getHistory()).toHaveLength(1);
    });
  });
});
