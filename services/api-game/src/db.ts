import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set — api-game needs it to persist NPC conversation history.",
    );
  }

  pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  pool.on("error", (err) => {
    console.error("[pg] idle client error:", err);
  });

  pool.on("connect", () => {
    console.log("[pg] client connected to Postgres");
  });

  return pool;
}

export async function endPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
