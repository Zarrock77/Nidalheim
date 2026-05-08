import { jest } from "@jest/globals";

const poolQuery = jest.fn();
const clientQuery = jest.fn();
const clientRelease = jest.fn();
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
    const rows = await new ConversationStore().loadRecent(null);
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
    const rows = await new ConversationStore().loadRecent("u1", 10);
    expect(rows).toEqual([
      { role: "user", content: "first" },
      { role: "assistant", content: "second" },
    ]);
    expect(poolQuery.mock.calls[0][1]).toEqual(["u1", 10]);
  });
});

describe("ConversationStore.append", () => {
  it("rejects roles other than user/assistant", async () => {
    await expect(
      new ConversationStore().append("u1", "system", "hi"),
    ).rejects.toThrow(/invalid role/);
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it("no-ops on empty content", async () => {
    await new ConversationStore().append("u1", "user", "");
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it("no-ops when userId is missing", async () => {
    await new ConversationStore().append(null, "user", "hi");
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it("inserts the turn with the provided channel", async () => {
    poolQuery.mockResolvedValue({ rows: [] });
    await new ConversationStore().append("u1", "user", "hello", "voice");
    expect(poolQuery).toHaveBeenCalledTimes(1);
    expect(poolQuery.mock.calls[0][1]).toEqual(["u1", "user", "hello", "voice"]);
  });
});

describe("ConversationStore.appendTurn", () => {
  it("wraps the two inserts in a BEGIN/COMMIT transaction", async () => {
    clientQuery.mockResolvedValue({ rows: [] });
    await new ConversationStore().appendTurn("u1", "hi", "hello", "text");
    const sqlCalls = clientQuery.mock.calls.map((c) => c[0].trim().split(/\s+/)[0]);
    expect(sqlCalls[0]).toBe("BEGIN");
    expect(sqlCalls[sqlCalls.length - 1]).toBe("COMMIT");
    expect(clientRelease).toHaveBeenCalledTimes(1);
  });

  it("rolls back and releases the client when an insert fails", async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockRejectedValueOnce(new Error("boom")) // first insert
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
    await expect(
      new ConversationStore().appendTurn("u1", "hi", "hello"),
    ).rejects.toThrow("boom");
    const sqlCalls = clientQuery.mock.calls.map((c) => c[0].trim().split(/\s+/)[0]);
    expect(sqlCalls).toContain("ROLLBACK");
    expect(clientRelease).toHaveBeenCalledTimes(1);
  });
});
