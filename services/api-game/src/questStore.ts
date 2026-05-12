import { getPool } from "./db.js";
import type { QuestData, QuestRecord, QuestStatus } from "./questTypes.js";
import { validateQuestData } from "./questValidator.js";

interface QuestRow {
  quest_id: string;
  status: QuestStatus;
  quest_data: unknown;
  location_id: string | null;
  progress_snapshot: unknown;
}

interface QuestIdRow {
  id: string;
}

export class QuestStore {
  async createOffered(userId: string, questData: QuestData, locationId: string | null = null): Promise<QuestRecord> {
    const pool = getPool();
    const { rows } = await pool.query<QuestRow>(
      `INSERT INTO quests (user_id, quest_id, location_id, status, quest_data)
       VALUES ($1, $2, $3, 'offered', $4::jsonb)
       ON CONFLICT (user_id, quest_id) DO NOTHING
       RETURNING quest_id, status, quest_data, location_id, progress_snapshot`,
      [userId, questData.questId, locationId, JSON.stringify(questData)],
    );

    if (rows[0]) return parseQuestRow(rows[0]);

    const existing = await this.getQuest(userId, questData.questId);
    if (!existing) {
      throw new Error(`QuestStore.createOffered: failed to load quest ${questData.questId} after conflict`);
    }
    return existing;
  }

  async listOffered(userId: string, locationId: string | null, limit = 5): Promise<QuestRecord[]> {
    const pool = getPool();
    const { rows } = await pool.query<QuestRow>(
      `SELECT quest_id, status, quest_data, location_id, progress_snapshot
         FROM quests
        WHERE user_id = $1
          AND status = 'offered'
          AND (($2::varchar IS NULL AND location_id IS NULL) OR location_id = $2)
        ORDER BY created_at DESC
        LIMIT $3`,
      [userId, locationId, limit],
    );
    return rows.map(parseQuestRow);
  }

  async listActive(userId: string): Promise<QuestRecord[]> {
    const pool = getPool();
    const { rows } = await pool.query<QuestRow>(
      `SELECT quest_id, status, quest_data, location_id, progress_snapshot
         FROM quests
        WHERE user_id = $1 AND status = 'accepted'
        ORDER BY accepted_at DESC NULLS LAST, created_at DESC`,
      [userId],
    );
    return rows.map(parseQuestRow);
  }

  async acceptQuest(userId: string, questId: string): Promise<QuestRecord | null> {
    const pool = getPool();
    const { rows } = await pool.query<QuestRow>(
      `UPDATE quests
          SET status = 'accepted',
              accepted_at = COALESCE(accepted_at, now()),
              updated_at = now()
        WHERE user_id = $1
          AND quest_id = $2
          AND status IN ('offered', 'accepted')
        RETURNING quest_id, status, quest_data, location_id, progress_snapshot`,
      [userId, questId],
    );
    return rows[0] ? parseQuestRow(rows[0]) : null;
  }

  async appendProgress(
    userId: string,
    questId: string,
    objectiveId: string,
    delta: number,
    snapshot: unknown,
  ): Promise<QuestRecord | null> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const questRows = await client.query<QuestIdRow>(
        `SELECT id
           FROM quests
          WHERE user_id = $1 AND quest_id = $2 AND status = 'accepted'
          FOR UPDATE`,
        [userId, questId],
      );
      const questRowId = questRows.rows[0]?.id;
      if (!questRowId) {
        await client.query("ROLLBACK");
        return null;
      }

      await client.query(
        `INSERT INTO quest_progress (quest_row_id, user_id, quest_id, objective_id, delta, snapshot)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [questRowId, userId, questId, objectiveId, delta, JSON.stringify(snapshot ?? {})],
      );

      const updated = await client.query<QuestRow>(
        `UPDATE quests
            SET progress_snapshot = $3::jsonb,
                updated_at = now()
          WHERE id = $1 AND user_id = $2
          RETURNING quest_id, status, quest_data, location_id, progress_snapshot`,
        [questRowId, userId, JSON.stringify(snapshot ?? {})],
      );

      await client.query("COMMIT");
      return updated.rows[0] ? parseQuestRow(updated.rows[0]) : null;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async completeQuest(userId: string, questId: string, finalSnapshot: unknown): Promise<QuestRecord | null> {
    const pool = getPool();
    const { rows } = await pool.query<QuestRow>(
      `UPDATE quests
          SET status = 'completed',
              completed_at = COALESCE(completed_at, now()),
              progress_snapshot = $3::jsonb,
              updated_at = now()
        WHERE user_id = $1
          AND quest_id = $2
          AND status IN ('accepted', 'completed')
        RETURNING quest_id, status, quest_data, location_id, progress_snapshot`,
      [userId, questId, JSON.stringify(finalSnapshot ?? {})],
    );
    return rows[0] ? parseQuestRow(rows[0]) : null;
  }

  async getQuest(userId: string, questId: string): Promise<QuestRecord | null> {
    const pool = getPool();
    const { rows } = await pool.query<QuestRow>(
      `SELECT quest_id, status, quest_data, location_id, progress_snapshot
         FROM quests
        WHERE user_id = $1 AND quest_id = $2`,
      [userId, questId],
    );
    return rows[0] ? parseQuestRow(rows[0]) : null;
  }
}

function parseQuestRow(row: QuestRow): QuestRecord {
  const validation = validateQuestData(row.quest_data);
  if (!validation.ok) {
    throw new Error(`Stored quest '${row.quest_id}' is invalid: ${validation.errors.join("; ")}`);
  }

  return {
    questId: row.quest_id,
    status: row.status,
    questData: validation.value,
    locationId: row.location_id,
    progressSnapshot: row.progress_snapshot,
  };
}
