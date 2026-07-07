/**
 * Mission telle que le client (UE5) la definit dans l'IR du donjon et la pousse au backend
 * via le message WS `mission_sync`. Client-authoritative : `hasObjectiveItem` reflete
 * l'inventaire reel du joueur, `completed` est pose quand le PNJ a valide.
 */
export interface ClientMission {
  id: string;
  name: string;
  objectiveItemId: string;
  objectiveDescription: string;
  missionPrompt: string;
  hasObjectiveItem: boolean;
  started: boolean;
  completed: boolean;
}

/**
 * Item d'inventaire pousse par le client via `inventory_sync` (fouille du PNJ).
 * `dungeon` : butin du donjon, le PNJ peut le confisquer ; sinon equipement personnel intouchable.
 * `lore` : histoire/importance de l'objet (le PNJ, ancien du village, la connait).
 */
export interface ClientInventoryItem {
  id: string;
  name: string;
  qty: number;
  dungeon: boolean;
  lore: string;
}

/** Etat missions + inventaire d'un joueur pour un PNJ donne. Ephemere : le client re-sync. */
export class MissionState {
  private missions: ClientMission[] = [];
  private inventory: ClientInventoryItem[] = [];

  replaceAll(missions: ClientMission[]): void {
    this.missions = missions;
  }

  all(): ClientMission[] {
    return this.missions;
  }

  find(id: string): ClientMission | undefined {
    return this.missions.find((m) => m.id === id);
  }

  /** 1re mission non terminee : defaut quand le tool de validation ne precise pas d'id. */
  active(): ClientMission | undefined {
    return this.missions.find((m) => !m.completed);
  }

  replaceInventory(items: ClientInventoryItem[]): void {
    this.inventory = items;
  }

  getInventory(): ClientInventoryItem[] {
    return this.inventory;
  }

  /** Le joueur porte-t-il cet item (inventaire sync) ? Verification generique de la fouille. */
  hasItem(itemId: string): boolean {
    return this.inventory.some((it) => it.id === itemId && it.qty > 0);
  }
}

/** Parse + valide un payload `mission_sync` du client. Champs absents/mal types -> defauts surs. */
export function parseMissionSync(raw: { missions?: unknown }): ClientMission[] {
  if (!raw || !Array.isArray(raw.missions)) return [];
  const out: ClientMission[] = [];
  for (const entry of raw.missions) {
    if (!entry || typeof entry !== "object") continue;
    const m = entry as Record<string, unknown>;
    const id = typeof m.id === "string" ? m.id : "";
    if (!id) continue; // une mission sans id est inexploitable
    out.push({
      id,
      name: typeof m.name === "string" ? m.name : id,
      objectiveItemId: typeof m.objectiveItemId === "string" ? m.objectiveItemId : "",
      objectiveDescription: typeof m.objectiveDescription === "string" ? m.objectiveDescription : "",
      missionPrompt: typeof m.missionPrompt === "string" ? m.missionPrompt : "",
      hasObjectiveItem: m.hasObjectiveItem === true,
      started: m.started === true,
      completed: m.completed === true,
    });
  }
  return out;
}

/** Parse + valide un payload `inventory_sync` du client (fouille). */
export function parseInventorySync(raw: { items?: unknown }): ClientInventoryItem[] {
  if (!raw || !Array.isArray(raw.items)) return [];
  const out: ClientInventoryItem[] = [];
  for (const entry of raw.items) {
    if (!entry || typeof entry !== "object") continue;
    const it = entry as Record<string, unknown>;
    const id = typeof it.id === "string" ? it.id : "";
    if (!id) continue;
    out.push({
      id,
      name: typeof it.name === "string" ? it.name : id,
      qty: typeof it.qty === "number" && Number.isFinite(it.qty) ? Math.max(0, Math.floor(it.qty)) : 0,
      dungeon: it.dungeon === true,
      lore: typeof it.lore === "string" ? it.lore : "",
    });
  }
  return out;
}

// --- Registre partage par (userId, npcId) -------------------------------------------------
// L'etat (missions + inventaire) est par-joueur-par-PNJ, pas par-socket : le client n'emet les
// sync que sur le canal TEXTE, mais le canal VOCAL doit voir le meme etat. Les deux connexions
// acquierent donc le MEME MissionState ; un refcount le libere quand la derniere se ferme
// (ephemere, aucune fuite memoire, aucune persistance DB -> re-sync au reconnect).
const registry = new Map<string, { state: MissionState; refs: number }>();

function keyOf(userId: string, npcId: string): string {
  return `${userId}::${npcId}`;
}

export function acquireMissionState(userId: string, npcId: string): MissionState {
  const key = keyOf(userId, npcId);
  let entry = registry.get(key);
  if (!entry) {
    entry = { state: new MissionState(), refs: 0 };
    registry.set(key, entry);
  }
  entry.refs += 1;
  return entry.state;
}

export function releaseMissionState(userId: string, npcId: string): void {
  const key = keyOf(userId, npcId);
  const entry = registry.get(key);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs <= 0) registry.delete(key);
}
