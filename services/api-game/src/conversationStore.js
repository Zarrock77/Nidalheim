import { getPool } from "./db.js";

/**
 * Persists per-(user, npc) NPC dialog turns in Postgres and hydrates history
 * at session start. System prompt is intentionally NOT stored here — it's
 * versioned per-NPC in the `npcs` table (see npcStore.js).
 */
export class ConversationStore {
    constructor({ maxHistory = 20 } = {}) {
        this.maxHistory = maxHistory;
    }

    /**
     * Return the user's most recent `limit` turns with this specific NPC,
     * in chronological order, shaped for direct injection into the LLM
     * messages array.
     */
    async loadRecent(userId, npcId, limit = this.maxHistory) {
        if (!userId) return [];
        const npc = npcId || "default";
        const pool = getPool();
        const { rows } = await pool.query(
            `SELECT role, content
               FROM chat_messages
              WHERE user_id = $1 AND npc_id = $2
              ORDER BY created_at DESC
              LIMIT $3`,
            [userId, npc, limit],
        );
        return rows.reverse().map((r) => ({ role: r.role, content: r.content }));
    }

    /** Append a single turn (user or assistant). Fire-and-forget safe. */
    async append(userId, npcId, role, content, channel = null) {
        if (!userId) return;
        if (role !== "user" && role !== "assistant") {
            throw new Error(`ConversationStore.append: invalid role '${role}'`);
        }
        if (!content) return;
        const npc = npcId || "default";
        const pool = getPool();
        await pool.query(
            `INSERT INTO chat_messages (user_id, npc_id, role, content, channel)
             VALUES ($1, $2, $3, $4, $5)`,
            [userId, npc, role, content, channel],
        );
    }

    /**
     * Append a user turn + assistant turn together. Wrapped in a transaction
     * so a crash between the two doesn't leave the pair half-saved (which
     * would desync the context on next load).
     */
    async appendTurn(userId, npcId, userText, assistantText, channel = null) {
        if (!userId) return;
        const npc = npcId || "default";
        const pool = getPool();
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            await client.query(
                `INSERT INTO chat_messages (user_id, npc_id, role, content, channel)
                 VALUES ($1, $2, 'user', $3, $4)`,
                [userId, npc, userText, channel],
            );
            await client.query(
                `INSERT INTO chat_messages (user_id, npc_id, role, content, channel)
                 VALUES ($1, $2, 'assistant', $3, $4)`,
                [userId, npc, assistantText, channel],
            );
            await client.query("COMMIT");
        } catch (err) {
            await client.query("ROLLBACK").catch(() => {});
            throw err;
        } finally {
            client.release();
        }
    }
}
