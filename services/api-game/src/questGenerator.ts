import { randomUUID } from "crypto";
import OpenAI from "openai";
import type { AuthenticatedUser } from "./types.js";
import { QUEST_SCHEMA_VERSION, type QuestData, type QuestGenerationContext } from "./questTypes.js";
import { getPromptTags } from "./questTags.js";
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
    const allowedTags = getPromptTags(context.knownTags);
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
            'Objectifs autorises en generation MVP: "Kill" et "Collect" uniquement.',
            "Utilise seulement les GameplayTags fournis.",
            "Format Kill params: { targetTag, count }.",
            "Format Collect params: { itemTag, count }.",
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
            allowedTags,
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
                      type: "Kill",
                      params: { targetTag: "Enemy.Wolf.Frost", count: 3 },
                      displayText: "Abattre 3 loups des glaces",
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
        title: "Les crocs dans la brume",
        summary: "Des loups des glaces rodent trop pres des sentiers du village.",
        objective: {
          objectiveId: "o1",
          type: "Kill" as const,
          params: { targetTag: "Enemy.Wolf.Frost", count: 3 },
          displayText: "Abattre 3 loups des glaces",
        },
        rewards: { xp: 120, items: [] },
      },
      {
        title: "Herbes sous le givre",
        summary: "Le guerisseur manque de plantes capables de tenir le froid.",
        objective: {
          objectiveId: "o1",
          type: "Collect" as const,
          params: { itemTag: "Item.Herb.Frostcap", count: 4 },
          displayText: "Ramasser 4 herbes givrantes",
        },
        rewards: { xp: 90, items: [{ itemId: "healing_salve", count: 1 }] },
      },
      {
        title: "Os anciens",
        summary: "Des draugr sortent des tertres et menacent les fermes isolees.",
        objective: {
          objectiveId: "o1",
          type: "Kill" as const,
          params: { targetTag: "Enemy.Draugr.Walker", count: 2 },
          displayText: "Terrasser 2 draugr errants",
        },
        rewards: { xp: 150, items: [] },
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
