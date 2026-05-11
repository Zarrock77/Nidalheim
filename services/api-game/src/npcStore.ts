import { getPool } from "./db.js";
import type { Npc } from "./types.js";

const cache = new Map<string, Npc>();

const DEFAULT_NPC_ID = "default";

interface NpcRow {
  id: string;
  name: string;
  system_prompt: string;
  voice_id: string | null;
  tts_model: string | null;
  llm_model: string | null;
}

export async function getNpc(npcId: string | null | undefined): Promise<Npc> {
  const id = (typeof npcId === "string" && npcId.trim()) || DEFAULT_NPC_ID;

  const cached = cache.get(id);
  if (cached) return cached;

  const npc = await loadFromDb(id);
  if (npc) {
    cache.set(id, npc);
    return npc;
  }

  if (id !== DEFAULT_NPC_ID) {
    console.warn(`[npcStore] unknown npc "${id}", falling back to "${DEFAULT_NPC_ID}"`);
    return getNpc(DEFAULT_NPC_ID);
  }

  throw new Error(
    `[npcStore] default NPC missing from DB — run migrations or seed npcs table`,
  );
}

async function loadFromDb(id: string): Promise<Npc | null> {
  const pool = getPool();
  const { rows } = await pool.query<NpcRow>(
    `SELECT id, name, system_prompt, voice_id, tts_model, llm_model
       FROM npcs
      WHERE id = $1`,
    [id],
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    name: r.name,
    systemPrompt: r.system_prompt,
    voiceId: r.voice_id,
    ttsModel: r.tts_model,
    llmModel: r.llm_model,
  };
}

export function invalidate(id: string): void {
  cache.delete(id);
}

export function invalidateAll(): void {
  cache.clear();
}
