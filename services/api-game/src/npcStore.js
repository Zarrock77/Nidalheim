import { getPool } from "./db.js";

/**
 * In-process cache for NPC rows. NPCs change rarely (op edits the system
 * prompt occasionally) so we cache forever and rely on a service restart
 * to pick up edits. If you need live edits, expose an admin endpoint that
 * calls invalidate(id).
 */
const cache = new Map();

const DEFAULT_NPC_ID = "default";

/**
 * Resolve an NPC by id. Falls back to "default" if the requested id doesn't
 * exist — this lets older clients (UE5 build that doesn't know about npcId
 * yet) keep working without a hard fail.
 *
 * @param {string|null|undefined} npcId
 * @returns {Promise<{ id: string, name: string, systemPrompt: string,
 *   voiceId: string|null, ttsModel: string|null, llmModel: string|null }>}
 */
export async function getNpc(npcId) {
    const id = (npcId && typeof npcId === "string" && npcId.trim()) || DEFAULT_NPC_ID;

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

async function loadFromDb(id) {
    const pool = getPool();
    const { rows } = await pool.query(
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

/** Drop a single NPC from the cache (useful after admin edit). */
export function invalidate(id) {
    cache.delete(id);
}

/** Drop everything (useful in tests or after bulk re-seed). */
export function invalidateAll() {
    cache.clear();
}
