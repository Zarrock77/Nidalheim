import { QuestGenerator } from "../src/questGenerator.js";
import { validateQuestData } from "../src/questValidator.js";

const ENV_KEYS = ["QUEST_LLM_API_KEY", "LLM_API_KEY", "OPENAI_API_KEY"] as const;

describe("QuestGenerator", () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  it("returns a valid deterministic fallback shape when no LLM key is configured", async () => {
    const quest = await new QuestGenerator().generateStructuredQuest({
      user: { id: "u1", sub: "u1", username: "player", role: "player" },
      context: { location: "village_north" },
      fallbackVariant: 1,
    });

    expect(quest.kind).toBe("structured");
    expect(quest.evaluationStrategy).toBe("client");
    expect(validateQuestData(quest).ok).toBe(true);
    expect(quest.stages[0]?.objectives[0]?.type).toBe("Collect");
  });
});
