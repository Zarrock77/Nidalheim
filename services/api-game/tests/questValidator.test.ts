import { validateQuestData } from "../src/questValidator.js";
import { QUEST_SCHEMA_VERSION, type QuestData } from "../src/questTypes.js";

function makeQuest(overrides: Partial<QuestData> = {}): QuestData {
  return {
    schemaVersion: QUEST_SCHEMA_VERSION,
    questId: "q_test",
    kind: "structured",
    evaluationStrategy: "client",
    title: "Les crocs dans la brume",
    summary: "Des loups des glaces rodent pres du village.",
    issuer: { type: "board" },
    rewards: { xp: 120, items: [] },
    stages: [
      {
        stageId: "s1",
        narrativeBeats: [],
        objectives: [
          {
            objectiveId: "o1",
            type: "Kill",
            params: { targetTag: "Enemy.Wolf.Frost", count: 3 },
            displayText: "Abattre 3 loups des glaces",
          },
        ],
        completion: { mode: "all" },
      },
    ],
    outroBeats: [],
    ...overrides,
  };
}

describe("validateQuestData", () => {
  it("accepts a structured kill quest", () => {
    const result = validateQuestData(makeQuest());
    expect(result.ok).toBe(true);
  });

  it("rejects a quest without questId", () => {
    const quest = makeQuest() as unknown as Record<string, unknown>;
    delete quest.questId;

    const result = validateQuestData(quest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("questId must be a non-empty string");
    }
  });

  it("requires Collect objectives to use itemTag", () => {
    const quest = makeQuest({
      stages: [
        {
          stageId: "s1",
          objectives: [
            {
              objectiveId: "o1",
              type: "Collect",
              params: { itemId: "frostcap", count: 2 },
              displayText: "Ramasser 2 herbes",
            },
          ],
          completion: { mode: "all" },
        },
      ],
    });

    const result = validateQuestData(quest);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("stages[0].objectives[0].params.itemTag must be a non-empty string");
    }
  });
});
