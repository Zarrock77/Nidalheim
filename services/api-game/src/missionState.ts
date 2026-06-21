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
  completed: boolean;
}

/** Etat des missions d'un joueur pour un PNJ donne. Ephemere (jamais persiste) : le client re-sync. */
export class MissionState {
  private missions: ClientMission[] = [];

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
      completed: m.completed === true,
    });
  }
  return out;
}

// --- Registre partage par (userId, npcId) -------------------------------------------------
// L'etat des missions est par-joueur-par-PNJ, pas par-socket : le client n'emet `mission_sync`
// que sur le canal TEXTE, mais le canal VOCAL doit voir le meme etat. Les deux connexions
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
