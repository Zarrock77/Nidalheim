import { QUEST_SCHEMA_VERSION } from "./questTypes.js";

export const DEFAULT_QUEST_TAGS = [
  "Enemy.Wolf.Frost",
  "Enemy.Bandit.Raider",
  "Enemy.Draugr.Walker",
  "Item.Resource.Wood",
  "Item.Resource.Rock",
  "Item.Consumable.GreenApple",
  "Item.Weapon.Sword",
  "Item.Weapon.IronAxe",
  "Location.Village.North",
  "Location.Forest.Edge",
  "Location.Cliff.Northshore",
  "NPC.Default",
  "NPC.Skald.Eirik",
  "Quest.Topic.RuneStone",
  "Quest.Topic.MissingHunter",
  "Quest.Topic.VillageRumor",
  "GameplayAbility.Movement.Dash",
  "GameplayAbility.MeleeAttack.Combo",
  "GameplayAbility.Defense.Shield",
] as const;

export interface QuestTagCatalog {
  schemaVersion: typeof QUEST_SCHEMA_VERSION;
  tags: string[];
  categories: Record<string, string[]>;
}

export function getQuestTagCatalog(): QuestTagCatalog {
  const tags = [...DEFAULT_QUEST_TAGS];
  return {
    schemaVersion: QUEST_SCHEMA_VERSION,
    tags,
    categories: {
      enemy: tags.filter((tag) => tag.startsWith("Enemy.")),
      item: tags.filter((tag) => tag.startsWith("Item.")),
      location: tags.filter((tag) => tag.startsWith("Location.")),
      npc: tags.filter((tag) => tag.startsWith("NPC.")),
      topic: tags.filter((tag) => tag.startsWith("Quest.Topic.")),
      ability: tags.filter((tag) => tag.startsWith("GameplayAbility.")),
    },
  };
}

export function getPromptTags(knownTags: string[] | undefined): string[] {
  const catalog = new Set(DEFAULT_QUEST_TAGS);
  const known = (knownTags ?? []).filter((tag) => catalog.has(tag as (typeof DEFAULT_QUEST_TAGS)[number]));

  const hasEnemy = known.some((tag) => tag.startsWith("Enemy."));
  const hasItem = known.some((tag) => tag.startsWith("Item."));
  if (hasEnemy || hasItem) {
    return known;
  }

  return [...DEFAULT_QUEST_TAGS];
}

export function getItemQuestTags(): string[] {
  return DEFAULT_QUEST_TAGS.filter((tag) => tag.startsWith("Item."));
}

export function getLocationQuestTags(): string[] {
  return DEFAULT_QUEST_TAGS.filter((tag) => tag.startsWith("Location."));
}

export function getPromptItemTags(knownTags: string[] | undefined): string[] {
  const itemTags = new Set(getItemQuestTags());
  const known = (knownTags ?? []).filter((tag) => itemTags.has(tag));

  return known.length > 0 ? known : [...itemTags];
}
