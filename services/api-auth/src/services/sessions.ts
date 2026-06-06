import pool from './db.js';

/**
 * Refresh tokens actifs, stockés en PostgreSQL (remplace Redis).
 * Un token est "valide" tant que sa ligne existe et n'a pas expiré (expires_at).
 * TTL ~7 jours, aligné sur la durée de vie du refresh token JWT.
 */
const REFRESH_TTL_SEC = 7 * 24 * 60 * 60; // 7 jours

export async function storeRefreshToken(userId: string, tokenId: string): Promise<void> {
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_id, expires_at)
     VALUES ($1, $2, NOW() + ($3 * interval '1 second'))
     ON CONFLICT (user_id, token_id) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
    [userId, tokenId, REFRESH_TTL_SEC],
  );
}

export async function isRefreshTokenValid(userId: string, tokenId: string): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM refresh_tokens WHERE user_id = $1 AND token_id = $2 AND expires_at > NOW() LIMIT 1`,
    [userId, tokenId],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function revokeRefreshToken(userId: string, tokenId: string): Promise<void> {
  await pool.query(`DELETE FROM refresh_tokens WHERE user_id = $1 AND token_id = $2`, [userId, tokenId]);
}

export async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await pool.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [userId]);
}

// Purge périodique des refresh tokens expirés (Redis le faisait via TTL).
export async function purgeExpiredRefreshTokens(): Promise<void> {
  await pool.query(`DELETE FROM refresh_tokens WHERE expires_at < NOW()`);
}
