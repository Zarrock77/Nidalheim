import { getPool } from "./db.js";
import type { ChatChannel, ChatMessage, ChatRole } from "./types.js";

export interface ConversationStoreOptions {
  maxHistory?: number;
}

interface ChatMessageRow {
  role: ChatRole;
  content: string;
}

const DEFAULT_NPC_ID = "default";

export class ConversationStore {
  private readonly maxHistory: number;

  constructor({ maxHistory = 20 }: ConversationStoreOptions = {}) {
    this.maxHistory = maxHistory;
  }

  async loadRecent(
    userId: string | null | undefined,
    npcId: string | null | undefined,
    limit: number = this.maxHistory,
  ): Promise<ChatMessage[]> {
    if (!userId) return [];
    const npc = npcId || DEFAULT_NPC_ID;
    const pool = getPool();
    const { rows } = await pool.query<ChatMessageRow>(
      `SELECT role, content
         FROM chat_messages
        WHERE user_id = $1 AND npc_id = $2
        ORDER BY created_at DESC
        LIMIT $3`,
      [userId, npc, limit],
    );
    return rows.reverse().map((r) => ({ role: r.role, content: r.content }));
  }

  async append(
    userId: string | null | undefined,
    npcId: string | null | undefined,
    role: ChatRole,
    content: string,
    channel: ChatChannel = null,
  ): Promise<void> {
    if (!userId) return;
    if (role !== "user" && role !== "assistant") {
      throw new Error(`ConversationStore.append: invalid role '${role}'`);
    }
    if (!content) return;
    const npc = npcId || DEFAULT_NPC_ID;
    const pool = getPool();
    await pool.query(
      `INSERT INTO chat_messages (user_id, npc_id, role, content, channel)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, npc, role, content, channel],
    );
  }

  async appendTurn(
    userId: string | null | undefined,
    npcId: string | null | undefined,
    userText: string,
    assistantText: string,
    channel: ChatChannel = null,
  ): Promise<void> {
    if (!userId) return;
    const npc = npcId || DEFAULT_NPC_ID;
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
