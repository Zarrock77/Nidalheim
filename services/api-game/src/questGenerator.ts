import { randomUUID } from "crypto";
import OpenAI from "openai";
import type { AuthenticatedUser } from "./types.js";
import { QUEST_SCHEMA_VERSION, type QuestData, type QuestGenerationContext } from "./questTypes.js";
import { getLocationQuestTags, getPromptItemTags } from "./questTags.js";
import { validateQuestData } from "./questValidator.js";

export interface QuestGenerationInput {
  user: AuthenticatedUser;
  context?: QuestGenerationContext;
  issuerNpcId?: string;
  fallbackVariant?: number;
}

export class QuestGenerator {
  private readonly client: OpenAI | null;
  private readonly model: string;

  constructor() {
    const apiKey = process.env.QUEST_LLM_API_KEY || process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
    this.client = apiKey
      ? new OpenAI({
          apiKey,
          baseURL: process.env.QUEST_LLM_BASE_URL || process.env.LLM_BASE_URL || undefined,
        })
      : null;
    this.model = process.env.QUEST_LLM_MODEL || process.env.LLM_MODEL || "llama-3.1-8b-instant";
  }

  async generateStructuredQuest(input: QuestGenerationInput): Promise<QuestData> {
    if (this.client) {
      try {
        const generated = await this.generateWithLlm(input);
        if (generated) return generated;
      } catch (err) {
        console.warn("[quest] LLM generation failed, using fallback:", (err as Error)?.message ?? err);
      }
    }

    return this.buildFallbackQuest(input);
  }

  private async generateWithLlm(input: QuestGenerationInput): Promise<QuestData | null> {
    if (!this.client) return null;

    const context = input.context ?? {};
    const allowedItemTags = getPromptItemTags(context.knownTags);
    const locationTags = getLocationQuestTags();
    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.5,
      messages: [
        {
          role: "system",
          content: [
            "Tu generes des quetes JSON pour Nidalheim, un jeu solo dark-fantasy nordique.",
            "Retourne uniquement un objet JSON valide, sans markdown.",
            `schemaVersion doit etre "${QUEST_SCHEMA_VERSION}".`,
            'MVP: kind="structured", evaluationStrategy="client".',
            'Objectif autorise en generation MVP: "Collect" uniquement.',
            "Ne genere jamais Kill, Reach, TalkTo, UseAbility ou OpenEnded pour ce MVP.",
            "Utilise seulement les itemTags fournis pour params.itemTag.",
            "Tu peux utiliser les locationTags uniquement dans le texte narratif ou en params.suggestedLocationTag.",
            "Format Collect params: { itemTag, count, suggestedLocationTag? }.",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({
            player: {
              id: input.user.id,
              username: input.user.username,
            },
            issuerNpcId: input.issuerNpcId,
            context,
            allowedItemTags,
            locationTags,
            requiredShape: {
              schemaVersion: QUEST_SCHEMA_VERSION,
              questId: "q_short_unique_id",
              kind: "structured",
              evaluationStrategy: "client",
              title: "Titre court en francais",
              summary: "Resume court en francais",
              issuer: { type: input.issuerNpcId ? "npc" : "board", npcId: input.issuerNpcId },
              rewards: { xp: 100, items: [] },
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
            },
          }),
        },
      ],
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = parseJsonObject(raw);
    const validation = validateQuestData(parsed);
    if (!validation.ok) {
      console.warn("[quest] LLM returned invalid quest:", validation.errors);
      return null;
    }
    if (!isCollectOnlyQuest(validation.value)) {
      console.warn("[quest] LLM returned non-Collect objective, using fallback");
      return null;
    }
    if (!collectItemTagsAreAllowed(validation.value, allowedItemTags)) {
      console.warn("[quest] LLM returned item tags outside the provided catalog, using fallback");
      return null;
    }

    return {
      ...validation.value,
      questId: createQuestId(),
    };
  }

  private buildFallbackQuest(input: QuestGenerationInput): QuestData {
    const issuerNpcId = input.issuerNpcId;
    const variant = Math.abs(input.fallbackVariant ?? 0) % 3;
    const questId = createQuestId();

    const variants = [
      {
        title: "Bois pour le foyer",
        summary: "Le village manque de bois sec avant la tombee de la nuit.",
        objective: {
          objectiveId: "o1",
          type: "Collect" as const,
          params: { itemTag: "Item.Resource.Wood", count: 5, suggestedLocationTag: "Location.Forest.Edge" },
          displayText: "Rapporter 5 morceaux de bois",
        },
        rewards: { xp: 90, items: [{ itemId: "GreenApple", count: 1 }] },
      },
      {
        title: "Pierres de seuil",
        summary: "Quelques pierres solides sont necessaires pour reparer le seuil du sanctuaire.",
        objective: {
          objectiveId: "o1",
          type: "Collect" as const,
          params: { itemTag: "Item.Resource.Rock", count: 4, suggestedLocationTag: "Location.Cliff.Northshore" },
          displayText: "Ramasser 4 pierres",
        },
        rewards: { xp: 110, items: [] },
      },
      {
        title: "Pommes pour la veille",
        summary: "Le garde demande des provisions faciles a emporter pour son tour de nuit.",
        objective: {
          objectiveId: "o1",
          type: "Collect" as const,
          params: { itemTag: "Item.Consumable.GreenApple", count: 3, suggestedLocationTag: "Location.Village.North" },
          displayText: "Apporter 3 pommes vertes",
        },
        rewards: { xp: 100, items: [] },
      },
    ];
    const selected = variants[variant];

    return {
      schemaVersion: QUEST_SCHEMA_VERSION,
      questId,
      kind: "structured",
      evaluationStrategy: "client",
      title: selected.title,
      summary: selected.summary,
      issuer: issuerNpcId ? { type: "npc", npcId: issuerNpcId } : { type: "board" },
      rewards: selected.rewards,
      stages: [
        {
          stageId: "s1",
          narrativeBeats: [],
          objectives: [selected.objective],
          completion: { mode: "all" },
        },
      ],
      outroBeats: [],
    };
  }
}

function parseJsonObject(raw: string): unknown {
  const withoutFence = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

  try {
    return JSON.parse(withoutFence) as unknown;
  } catch {
    const start = withoutFence.indexOf("{");
    const end = withoutFence.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(withoutFence.slice(start, end + 1)) as unknown;
    }
    throw new Error("No JSON object found in LLM response");
  }
}

function createQuestId(): string {
  return `q_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
}

function isCollectOnlyQuest(quest: QuestData): boolean {
  return quest.stages.every((stage) => stage.objectives.every((objective) => objective.type === "Collect"));
}

function collectItemTagsAreAllowed(quest: QuestData, allowedItemTags: string[]): boolean {
  const allowed = new Set(allowedItemTags);
  return quest.stages.every((stage) =>
    stage.objectives.every((objective) => {
      const itemTag = objective.params.itemTag;
      return typeof itemTag === "string" && allowed.has(itemTag);
    }),
  );
}
