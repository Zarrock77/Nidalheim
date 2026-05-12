import {
  QUEST_SCHEMA_VERSION,
  type QuestCompletionMode,
  type QuestData,
  type QuestEvaluationStrategy,
  type QuestKind,
  type QuestObjectiveType,
} from "./questTypes.js";

export interface ValidationSuccess<T> {
  ok: true;
  value: T;
}

export interface ValidationFailure {
  ok: false;
  errors: string[];
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

const QUEST_KINDS = new Set<QuestKind>(["structured", "narrative", "emergent"]);
const EVALUATION_STRATEGIES = new Set<QuestEvaluationStrategy>(["client", "server-llm"]);
const OBJECTIVE_TYPES = new Set<QuestObjectiveType>([
  "Kill",
  "Collect",
  "Reach",
  "TalkTo",
  "UseAbility",
  "OpenEnded",
]);
const COMPLETION_MODES = new Set<QuestCompletionMode>(["all", "any", "ordered"]);

export function validateQuestData(input: unknown): ValidationResult<QuestData> {
  const errors: string[] = [];

  if (!isRecord(input)) {
    return { ok: false, errors: ["quest must be an object"] };
  }

  requireExactString(input, "schemaVersion", QUEST_SCHEMA_VERSION, errors);
  requireNonEmptyString(input, "questId", errors);
  requireEnum(input, "kind", QUEST_KINDS, errors);
  requireEnum(input, "evaluationStrategy", EVALUATION_STRATEGIES, errors);
  requireNonEmptyString(input, "title", errors);
  requireNonEmptyString(input, "summary", errors);

  if (!isRecord(input.issuer)) {
    errors.push("issuer must be an object");
  } else {
    requireEnum(input.issuer, "type", new Set(["npc", "board", "system"]), errors, "issuer.type");
    if (input.issuer.npcId !== undefined && !isNonEmptyString(input.issuer.npcId)) {
      errors.push("issuer.npcId must be a non-empty string when provided");
    }
  }

  validateRewards(input.rewards, errors);
  validateNarrativeBeats(input.outroBeats, errors, "outroBeats", false);

  if (!Array.isArray(input.stages) || input.stages.length === 0) {
    errors.push("stages must be a non-empty array");
  } else {
    input.stages.forEach((stage, index) => validateStage(stage, errors, `stages[${index}]`));
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, value: input as unknown as QuestData };
}

function validateStage(input: unknown, errors: string[], path: string): void {
  if (!isRecord(input)) {
    errors.push(`${path} must be an object`);
    return;
  }

  requireNonEmptyString(input, "stageId", errors, `${path}.stageId`);
  validateNarrativeBeats(input.narrativeBeats, errors, `${path}.narrativeBeats`, false);

  if (!Array.isArray(input.objectives) || input.objectives.length === 0) {
    errors.push(`${path}.objectives must be a non-empty array`);
  } else {
    input.objectives.forEach((objective, index) => validateObjective(objective, errors, `${path}.objectives[${index}]`));
  }

  if (!isRecord(input.completion)) {
    errors.push(`${path}.completion must be an object`);
  } else {
    requireEnum(input.completion, "mode", COMPLETION_MODES, errors, `${path}.completion.mode`);
  }
}

function validateObjective(input: unknown, errors: string[], path: string): void {
  if (!isRecord(input)) {
    errors.push(`${path} must be an object`);
    return;
  }

  requireNonEmptyString(input, "objectiveId", errors, `${path}.objectiveId`);
  requireEnum(input, "type", OBJECTIVE_TYPES, errors, `${path}.type`);
  requireNonEmptyString(input, "displayText", errors, `${path}.displayText`);

  if (!isRecord(input.params)) {
    errors.push(`${path}.params must be an object`);
    return;
  }

  switch (input.type) {
    case "Kill":
      requireNonEmptyString(input.params, "targetTag", errors, `${path}.params.targetTag`);
      requirePositiveInteger(input.params, "count", errors, `${path}.params.count`);
      break;
    case "Collect":
      requireNonEmptyString(input.params, "itemTag", errors, `${path}.params.itemTag`);
      requirePositiveInteger(input.params, "count", errors, `${path}.params.count`);
      break;
    case "Reach":
      requireNonEmptyString(input.params, "locationTag", errors, `${path}.params.locationTag`);
      requirePositiveNumber(input.params, "radiusCm", errors, `${path}.params.radiusCm`);
      break;
    case "TalkTo":
      requireNonEmptyString(input.params, "npcId", errors, `${path}.params.npcId`);
      requireNonEmptyString(input.params, "topicTag", errors, `${path}.params.topicTag`);
      break;
    case "UseAbility":
      requireNonEmptyString(input.params, "abilityTag", errors, `${path}.params.abilityTag`);
      break;
    case "OpenEnded":
      requireNonEmptyString(input.params, "successCriteria", errors, `${path}.params.successCriteria`);
      break;
  }
}

function validateRewards(input: unknown, errors: string[]): void {
  if (!isRecord(input)) {
    errors.push("rewards must be an object");
    return;
  }

  if (input.xp !== undefined && (!Number.isFinite(input.xp) || Number(input.xp) < 0)) {
    errors.push("rewards.xp must be a non-negative number when provided");
  }

  if (input.items === undefined) return;
  if (!Array.isArray(input.items)) {
    errors.push("rewards.items must be an array when provided");
    return;
  }

  input.items.forEach((item, index) => {
    if (!isRecord(item)) {
      errors.push(`rewards.items[${index}] must be an object`);
      return;
    }
    requireNonEmptyString(item, "itemId", errors, `rewards.items[${index}].itemId`);
    requirePositiveInteger(item, "count", errors, `rewards.items[${index}].count`);
  });
}

function validateNarrativeBeats(input: unknown, errors: string[], path: string, required: boolean): void {
  if (input === undefined && !required) return;
  if (!Array.isArray(input)) {
    errors.push(`${path} must be an array`);
    return;
  }

  input.forEach((beat, index) => {
    if (!isRecord(beat)) {
      errors.push(`${path}[${index}] must be an object`);
      return;
    }
    requireNonEmptyString(beat, "type", errors, `${path}[${index}].type`);
    if (beat.text !== undefined && typeof beat.text !== "string") {
      errors.push(`${path}[${index}].text must be a string when provided`);
    }
    if (beat.npcId !== undefined && !isNonEmptyString(beat.npcId)) {
      errors.push(`${path}[${index}].npcId must be a non-empty string when provided`);
    }
  });
}

function requireExactString(
  input: Record<string, unknown>,
  key: string,
  expected: string,
  errors: string[],
  path = key,
): void {
  if (input[key] !== expected) {
    errors.push(`${path} must be "${expected}"`);
  }
}

function requireNonEmptyString(input: Record<string, unknown>, key: string, errors: string[], path = key): void {
  if (!isNonEmptyString(input[key])) {
    errors.push(`${path} must be a non-empty string`);
  }
}

function requireEnum<T extends string>(
  input: Record<string, unknown>,
  key: string,
  allowed: Set<T> | Set<string>,
  errors: string[],
  path = key,
): void {
  if (typeof input[key] !== "string" || !allowed.has(input[key] as T)) {
    errors.push(`${path} is invalid`);
  }
}

function requirePositiveInteger(input: Record<string, unknown>, key: string, errors: string[], path = key): void {
  if (!Number.isInteger(input[key]) || Number(input[key]) <= 0) {
    errors.push(`${path} must be a positive integer`);
  }
}

function requirePositiveNumber(input: Record<string, unknown>, key: string, errors: string[], path = key): void {
  if (!Number.isFinite(input[key]) || Number(input[key]) <= 0) {
    errors.push(`${path} must be a positive number`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
