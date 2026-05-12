import { HttpError, type HttpRouter, readJsonBody, sendJson } from "./httpRouter.js";
import { getQuestTagCatalog } from "./questTags.js";
import type { QuestGenerator } from "./questGenerator.js";
import type { QuestStore } from "./questStore.js";
import type { QuestGenerationContext, QuestRecord } from "./questTypes.js";

export interface QuestRouteDependencies {
  questGenerator: QuestGenerator;
  questStore: QuestStore;
}

export function registerQuestRoutes(router: HttpRouter, deps: QuestRouteDependencies): void {
  router.post("/quests/generate", async (context) => {
    warnOnSchemaHeader(context.request.headers["x-quest-schema-version"]);

    const body = await readJsonBody(context.request);
    const generationContext = parseGenerationContext(body);
    const quest = await deps.questGenerator.generateStructuredQuest({
      user: requireUser(context.user),
      context: generationContext,
      fallbackVariant: 0,
    });
    await deps.questStore.createOffered(context.user!.id, quest, generationContext.location ?? null);
    sendJson(context.response, 201, quest);
  }, { auth: true });

  router.get("/quests/board", async (context) => {
    warnOnSchemaHeader(context.request.headers["x-quest-schema-version"]);

    const user = requireUser(context.user);
    const locationId = context.url.searchParams.get("location") || "global";
    const requestedLimit = Number(context.url.searchParams.get("limit") ?? 3);
    const limit = Number.isInteger(requestedLimit) ? Math.min(5, Math.max(3, requestedLimit)) : 3;

    const existing = await deps.questStore.listOffered(user.id, locationId, limit);
    const records: QuestRecord[] = [...existing];

    for (let index = records.length; index < limit; index += 1) {
      const quest = await deps.questGenerator.generateStructuredQuest({
        user,
        context: { location: locationId },
        fallbackVariant: index,
      });
      records.push(await deps.questStore.createOffered(user.id, quest, locationId));
    }

    sendJson(context.response, 200, { quests: records.map((record) => record.questData) });
  }, { auth: true });

  router.post("/quests/:id/accept", async (context) => {
    const user = requireUser(context.user);
    const record = await deps.questStore.acceptQuest(user.id, context.params.id);
    if (!record) {
      throw new HttpError(404, "Quest not found or cannot be accepted", "quest_not_found");
    }
    sendJson(context.response, 200, { quest: record.questData, status: record.status });
  }, { auth: true });

  router.post("/quests/:id/progress", async (context) => {
    const user = requireUser(context.user);
    const body = await readJsonBody(context.request);
    const payload = parseProgressPayload(body);
    const record = await deps.questStore.appendProgress(
      user.id,
      context.params.id,
      payload.objectiveId,
      payload.delta,
      payload.snapshot,
    );
    if (!record) {
      throw new HttpError(404, "Quest not found or not active", "quest_not_active");
    }
    sendJson(context.response, 200, { ok: true, questId: record.questId, status: record.status });
  }, { auth: true });

  router.post("/quests/:id/complete", async (context) => {
    const user = requireUser(context.user);
    const body = await readJsonBody(context.request);
    const finalSnapshot = isRecord(body) ? body.finalSnapshot ?? {} : {};
    const record = await deps.questStore.completeQuest(user.id, context.params.id, finalSnapshot);
    if (!record) {
      throw new HttpError(404, "Quest not found or not active", "quest_not_active");
    }
    sendJson(context.response, 200, {
      questId: record.questId,
      status: record.status,
      rewards: record.questData.rewards,
    });
  }, { auth: true });

  router.get("/quests/active", async (context) => {
    const user = requireUser(context.user);
    const records = await deps.questStore.listActive(user.id);
    sendJson(context.response, 200, { quests: records.map((record) => record.questData) });
  }, { auth: true });

  router.get("/quests/tags", (context) => {
    requireUser(context.user);
    sendJson(context.response, 200, getQuestTagCatalog());
  }, { auth: true });
}

function parseGenerationContext(body: unknown): QuestGenerationContext {
  if (!isRecord(body) || !isRecord(body.context)) return {};
  const input = body.context;

  return {
    playerLevel: typeof input.playerLevel === "number" ? input.playerLevel : undefined,
    location: typeof input.location === "string" && input.location.trim() ? input.location.trim() : undefined,
    recentEvents: Array.isArray(input.recentEvents)
      ? input.recentEvents.filter((event): event is string => typeof event === "string")
      : undefined,
    biome: typeof input.biome === "string" && input.biome.trim() ? input.biome.trim() : undefined,
    knownTags: Array.isArray(input.knownTags)
      ? input.knownTags.filter((tag): tag is string => typeof tag === "string")
      : undefined,
  };
}

function parseProgressPayload(body: unknown): { objectiveId: string; delta: number; snapshot: unknown } {
  if (!isRecord(body)) {
    throw new HttpError(400, "Progress body must be an object", "invalid_progress");
  }
  if (typeof body.objectiveId !== "string" || !body.objectiveId.trim()) {
    throw new HttpError(400, "objectiveId is required", "invalid_progress");
  }

  const delta = body.delta === undefined ? 1 : Number(body.delta);
  if (!Number.isInteger(delta)) {
    throw new HttpError(400, "delta must be an integer", "invalid_progress");
  }

  return {
    objectiveId: body.objectiveId.trim(),
    delta,
    snapshot: body.snapshot ?? {},
  };
}

function requireUser<T>(user: T | undefined): T {
  if (!user) {
    throw new HttpError(401, "Unauthorized", "unauthorized");
  }
  return user;
}

function warnOnSchemaHeader(value: string | string[] | undefined): void {
  const header = Array.isArray(value) ? value[0] : value;
  if (header && header !== "1.0.0") {
    console.warn(`[quest] client requested schema '${header}', serving schema '1.0.0'`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
