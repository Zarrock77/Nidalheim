import { jest } from "@jest/globals";
import http from "http";
import jwt from "jsonwebtoken";
import { HttpRouter, sendJson } from "../src/httpRouter.js";
import { registerQuestRoutes } from "../src/questRoutes.js";
import { QUEST_SCHEMA_VERSION, type QuestData } from "../src/questTypes.js";

const JWT_SECRET = "quest-route-test-secret";

function makeQuest(overrides: Partial<QuestData> = {}): QuestData {
  return {
    schemaVersion: QUEST_SCHEMA_VERSION,
    questId: "q_test",
    kind: "structured",
    evaluationStrategy: "client",
    title: "Bois pour le foyer",
    summary: "Le village manque de bois sec avant la tombee de la nuit.",
    issuer: { type: "board" },
    rewards: { xp: 120, items: [] },
    stages: [
      {
        stageId: "s1",
        narrativeBeats: [],
        objectives: [
          {
            objectiveId: "o1",
            type: "Collect",
            params: { itemTag: "Item.Resource.Wood", count: 5 },
            displayText: "Rapporter 5 morceaux de bois",
          },
        ],
        completion: { mode: "all" },
      },
    ],
    outroBeats: [],
    ...overrides,
  };
}

describe("quest routes", () => {
  const previousSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
  });

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });

  it("rejects protected routes without Bearer auth", async () => {
    const { server, request } = await startQuestServer();
    try {
      const response = await request("GET", "/quests/active");
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: "Missing Bearer token" });
    } finally {
      await closeServer(server);
    }
  });

  it("generates, persists, and returns a quest", async () => {
    const quest = makeQuest();
    const questGenerator = {
      generateStructuredQuest: jest.fn(async () => quest),
    };
    const questStore = {
      createOffered: jest.fn(async () => ({
        questId: quest.questId,
        status: "offered",
        questData: quest,
        locationId: "village",
        progressSnapshot: {},
      })),
      listOffered: jest.fn(),
      listActive: jest.fn(),
      acceptQuest: jest.fn(),
      appendProgress: jest.fn(),
      completeQuest: jest.fn(),
    };
    const { server, request } = await startQuestServer({ questGenerator, questStore });

    try {
      const response = await request("POST", "/quests/generate", {
        context: { location: "village" },
      }, makeToken());

      expect(response.status).toBe(201);
      expect(response.body).toEqual(quest);
      expect(questStore.createOffered).toHaveBeenCalledWith("u1", quest, "village");
    } finally {
      await closeServer(server);
    }
  });
});

async function startQuestServer(overrides: Record<string, unknown> = {}) {
  const quest = makeQuest();
  const router = new HttpRouter();
  registerQuestRoutes(router, {
    questGenerator: (overrides.questGenerator ?? { generateStructuredQuest: jest.fn(async () => quest) }) as never,
    questStore: (overrides.questStore ?? {
      createOffered: jest.fn(async () => ({
        questId: quest.questId,
        status: "offered",
        questData: quest,
        locationId: null,
        progressSnapshot: {},
      })),
      listOffered: jest.fn(async () => []),
      listActive: jest.fn(async () => []),
      acceptQuest: jest.fn(async () => null),
      appendProgress: jest.fn(async () => null),
      completeQuest: jest.fn(async () => null),
    }) as never,
  });

  const server = http.createServer((req, res) => {
    void router.handle(req, res).then((handled) => {
      if (!handled) sendJson(res, 404, { error: "Not Found" });
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  return {
    server,
    request: async (method: string, path: string, body?: unknown, token?: string) => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Test server did not bind to a TCP port");
      return requestJson(address.port, method, path, body, token);
    },
  };
}

async function requestJson(
  port: number,
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; body: unknown }> {
  const rawBody = body === undefined ? undefined : JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path,
      method,
      headers: {
        ...(rawBody ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(rawBody) } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({
          status: res.statusCode ?? 0,
          body: text ? JSON.parse(text) as unknown : null,
        });
      });
    });
    req.on("error", reject);
    if (rawBody) req.write(rawBody);
    req.end();
  });
}

async function closeServer(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function makeToken(): string {
  return jwt.sign({ sub: "u1", username: "player", role: "player" }, JWT_SECRET, { algorithm: "HS256" });
}
