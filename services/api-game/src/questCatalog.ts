import { randomUUID } from "crypto";
import OpenAI from "openai";
import { QUEST_SCHEMA_VERSION, type QuestData } from "./questTypes.js";

/** Description de la 1re quete (combat) — injectee dans le system prompt pour que le PNJ la connaisse. */
export const FIRST_QUEST_DESCRIPTION =
  "Des pilleurs sont dans les parages, ils sont derriere les arbres, ils sont armes d'epees, " +
  "ils pourraient attaquer a tout moment. Il faut que quelqu'un defende le village. " +
  "Le joueur doit se rendre dans la foret et aller un peu plus loin entre les arbres : il les y trouvera.";

/** Construit la 1re quete de combat (remplace l'ancienne quete de collecte de bois). */
export function buildFirstCombatQuest(npcId: string | undefined): QuestData {
  return {
    schemaVersion: QUEST_SCHEMA_VERSION,
    questId: `q_${randomUUID().slice(0, 8)}`,
    kind: "structured",
    evaluationStrategy: "client",
    title: "Defendre le village",
    summary: "Des pilleurs rodent dans la foret. Va plus loin entre les arbres et repousse-les.",
    issuer: { type: npcId ? "npc" : "system", npcId },
    rewards: { xp: 120, items: [] },
    stages: [
      {
        stageId: "s1",
        narrativeBeats: [],
        objectives: [
          {
            objectiveId: "o1",
            type: "Kill",
            params: { targetTag: "Enemy.Raider", count: 3, suggestedLocationTag: "Location.Forest.Deep" },
            displayText: "Repousser 3 pilleurs dans la foret",
          },
        ],
        completion: { mode: "all" },
      },
    ],
  };
}

/** Tool function-call expose au LLM du PNJ pour lancer la prochaine quete. */
export const QUEST_NEXT_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "quest_next",
    description:
      "Lance/offre la prochaine quete au joueur (la mission de defense du village contre les pilleurs). " +
      "A appeler quand le joueur demande/accepte une mission, ou quand tu decides naturellement de la lui confier.",
    parameters: { type: "object", properties: {}, required: [] },
  },
};
