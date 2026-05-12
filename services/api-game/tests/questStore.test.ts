import { jest } from "@jest/globals";
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

const poolQuery = jest.fn<(...args: unknown[]) => Promise<{ rows: unknown[] }>>();
const clientQuery = jest.fn<(...args: unknown[]) => Promise<{ rows: unknown[] }>>();
const clientRelease = jest.fn<() => void>();
const poolConnect = jest.fn(async () => ({
  query: clientQuery,
  release: clientRelease,
}));

jest.unstable_mockModule("../src/db.js", () => ({
  getPool: () => ({
    query: poolQuery,
    connect: poolConnect,
  }),
}));

const { QuestStore } = await import("../src/questStore.js");

beforeEach(() => {
  poolQuery.mockReset();
  clientQuery.mockReset();
  clientRelease.mockReset();
  poolConnect.mockClear();
});

describe("QuestStore", () => {
  it("inserts an offered quest", async () => {
    const quest = makeQuest();
    poolQuery.mockResolvedValueOnce({
      rows: [
        {
          quest_id: quest.questId,
          status: "offered",
          quest_data: quest,
          location_id: "village",
          progress_snapshot: {},
        },
      ],
    });

    const record = await new QuestStore().createOffered("u1", quest, "village");

    expect(record.status).toBe("offered");
    expect(record.questData.questId).toBe(quest.questId);
    expect(poolQuery.mock.calls[0]?.[1]).toEqual(["u1", quest.questId, "village", JSON.stringify(quest)]);
  });

  it("accepts a quest idempotently for offered or accepted rows", async () => {
    const quest = makeQuest();
    poolQuery.mockResolvedValueOnce({
      rows: [
        {
          quest_id: quest.questId,
          status: "accepted",
          quest_data: quest,
          location_id: null,
          progress_snapshot: {},
        },
      ],
    });

    const record = await new QuestStore().acceptQuest("u1", quest.questId);

    expect(record?.status).toBe("accepted");
    expect(poolQuery.mock.calls[0]?.[1]).toEqual(["u1", quest.questId]);
  });

  it("appends progress in a transaction and updates the snapshot", async () => {
    const quest = makeQuest();
    clientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: "row1" }] }) // SELECT quest row
      .mockResolvedValueOnce({ rows: [] }) // INSERT progress
      .mockResolvedValueOnce({
        rows: [
          {
            quest_id: quest.questId,
            status: "accepted",
            quest_data: quest,
            location_id: null,
            progress_snapshot: { o1: 1 },
          },
        ],
      }) // UPDATE quest snapshot
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const record = await new QuestStore().appendProgress("u1", quest.questId, "o1", 1, { o1: 1 });

    expect(record?.progressSnapshot).toEqual({ o1: 1 });
    expect(clientQuery.mock.calls.map((call) => (call[0] as string).trim().split(/\s+/)[0])).toEqual([
      "BEGIN",
      "SELECT",
      "INSERT",
      "UPDATE",
      "COMMIT",
    ]);
    expect(clientRelease).toHaveBeenCalledTimes(1);
  });
});
