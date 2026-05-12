export const QUEST_SCHEMA_VERSION = "1.0.0";

export type QuestKind = "structured" | "narrative" | "emergent";
export type QuestEvaluationStrategy = "client" | "server-llm";
export type QuestObjectiveType = "Kill" | "Collect" | "Reach" | "TalkTo" | "UseAbility" | "OpenEnded";
export type QuestCompletionMode = "all" | "any" | "ordered";
export type QuestStatus = "offered" | "accepted" | "completed" | "abandoned";

export interface QuestIssuer {
  type: "npc" | "board" | "system";
  npcId?: string;
}

export interface QuestRewardItem {
  itemId: string;
  count: number;
}

export interface QuestRewards {
  xp?: number;
  items?: QuestRewardItem[];
}

export interface QuestNarrativeBeat {
  type: string;
  text?: string;
  npcId?: string;
  [key: string]: unknown;
}

export interface QuestObjectiveData {
  objectiveId: string;
  type: QuestObjectiveType;
  params: Record<string, unknown>;
  displayText: string;
}

export interface QuestStage {
  stageId: string;
  narrativeBeats?: QuestNarrativeBeat[];
  objectives: QuestObjectiveData[];
  completion: {
    mode: QuestCompletionMode;
  };
}

export interface QuestData {
  schemaVersion: typeof QUEST_SCHEMA_VERSION;
  questId: string;
  kind: QuestKind;
  evaluationStrategy: QuestEvaluationStrategy;
  title: string;
  summary: string;
  issuer: QuestIssuer;
  rewards: QuestRewards;
  stages: QuestStage[];
  outroBeats?: QuestNarrativeBeat[];
}

export interface QuestGenerationContext {
  playerLevel?: number;
  location?: string;
  recentEvents?: string[];
  biome?: string;
  knownTags?: string[];
}

export interface QuestRecord {
  questId: string;
  status: QuestStatus;
  questData: QuestData;
  locationId: string | null;
  progressSnapshot: unknown;
}
