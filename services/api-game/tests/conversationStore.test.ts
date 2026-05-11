import { jest } from "@jest/globals";

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

const { ConversationStore } = await import("../src/conversationStore.js");

beforeEach(() => {
  poolQuery.mockReset();
  clientQuery.mockReset();
  clientRelease.mockReset();
  poolConnect.mockClear();
});

describe("ConversationStore.loadRecent", () => {
  it("returns [] without querying when userId is missing", async () => {
    const rows = await new ConversationStore().loadRecent(null, "npc-a");
    expect(rows).toEqual([]);
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it("returns rows in chronological order (DB returns DESC, store reverses)", async () => {
    poolQuery.mockResolvedValue({
      rows: [
        { role: "assistant", content: "second" },
        { role: "user", content: "first" },
      ],
    });
    const rows = await new ConversationStore().loadRecent("u1", "npc-a", 10);
    expect(rows).toEqual([
      { role: "user", content: "first" },
      { role: "assistant", content: "second" },
    ]);
    expect(poolQuery.mock.calls[0][1]).toEqual(["u1", "npc-a", 10]);
  });

  it("falls back to 'default' npc when npcId is missing", async () => {
    poolQuery.mockResolvedValue({ rows: [] });
    await new ConversationStore().loadRecent("u1", null);
    expect(poolQuery.mock.calls[0][1]).toEqual(["u1", "default", 20]);
  });
});

describe("ConversationStore.append", () => {
  it("rejects roles other than user/assistant", async () => {
    await expect(
      new ConversationStore().append("u1", "npc-a", "system" as "user", "hi"),
    ).rejects.toThrow(/invalid role/);
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it("no-ops on empty content", async () => {
    await new ConversationStore().append("u1", "npc-a", "user", "");
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it("no-ops when userId is missing", async () => {
    await new ConversationStore().append(null, "npc-a", "user", "hi");
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it("inserts the turn with the provided npcId and channel", async () => {
    poolQuery.mockResolvedValue({ rows: [] });
    await new ConversationStore().append("u1", "npc-a", "user", "hello", "audio");
    expect(poolQuery).toHaveBeenCalledTimes(1);
    expect(poolQuery.mock.calls[0][1]).toEqual(["u1", "npc-a", "user", "hello", "audio"]);
  });

  it("falls back to 'default' npc when npcId is missing", async () => {
    poolQuery.mockResolvedValue({ rows: [] });
    await new ConversationStore().append("u1", null, "user", "hi");
    expect(poolQuery.mock.calls[0][1]).toEqual(["u1", "default", "user", "hi", null]);
  });
});

describe("ConversationStore.appendTurn", () => {
  it("wraps the two inserts in a BEGIN/COMMIT transaction with npcId", async () => {
    clientQuery.mockResolvedValue({ rows: [] });
    await new ConversationStore().appendTurn("u1", "npc-a", "hi", "hello", "text");
    const sqlCalls = clientQuery.mock.calls.map((c: unknown[]) => (c[0] as string).trim().split(/\s+/)[0]);
    expect(sqlCalls[0]).toBe("BEGIN");
    expect(sqlCalls[sqlCalls.length - 1]).toBe("COMMIT");
    expect(clientRelease).toHaveBeenCalledTimes(1);
    // Verify npcId propagated into both INSERT param arrays (indexes 1 and 2 are the inserts).
    expect(clientQuery.mock.calls[1][1]).toEqual(["u1", "npc-a", "hi", "text"]);
    expect(clientQuery.mock.calls[2][1]).toEqual(["u1", "npc-a", "hello", "text"]);
  });

  it("rolls back and releases the client when an insert fails", async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockRejectedValueOnce(new Error("boom")) // first insert
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
    await expect(
      new ConversationStore().appendTurn("u1", "npc-a", "hi", "hello"),
    ).rejects.toThrow("boom");
    const sqlCalls = clientQuery.mock.calls.map((c: unknown[]) => (c[0] as string).trim().split(/\s+/)[0]);
    expect(sqlCalls).toContain("ROLLBACK");
    expect(clientRelease).toHaveBeenCalledTimes(1);
  });
});
