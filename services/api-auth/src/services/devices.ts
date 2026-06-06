import crypto from 'crypto';
import pool from './db.js';

/**
 * OAuth 2.0 Device Authorization Grant (RFC 8628), stocké en PostgreSQL (remplace Redis).
 *
 * Table `device_codes` : une ligne par autorisation en cours.
 *  - device_code (PK) : code opaque, jamais affiché ;
 *  - user_code (unique) : code court montré à l'utilisateur, pour résoudre vers le device_code ;
 *  - data (jsonb) : l'enregistrement complet (statut, tokens une fois approuvé) ;
 *  - expires_at : TTL (DEVICE_TTL_SEC). Les lignes expirées sont ignorées en lecture et purgées.
 */

const DEVICE_TTL_SEC = 10 * 60; // 10 minutes — RFC 8628 typique
const POLL_INTERVAL_SEC = 5;
const POLL_INTERVAL_MS = 1000;

// Alphabet sans caractères ambigus (0/O, 1/I/L).
const USER_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export type DeviceStatus = 'pending' | 'approved' | 'denied';

export interface DeviceRecord {
  device_code: string;
  user_code: string;
  status: DeviceStatus;
  expires_at: number; // unix epoch seconds
  // Rempli quand status === 'approved' :
  user?: { id: string; username: string; email: string; role: string };
  access_token?: string;
  refresh_token?: string;
}

export interface CreatedDevice {
  device_code: string;
  user_code: string;
  expires_in: number;
  interval: number;
  interval_ms: number;
}

function generateDeviceCode(): string {
  // 32 octets aléatoires → 64 hex. Opaque, jamais affiché.
  return crypto.randomBytes(32).toString('hex');
}

function generateUserCode(): string {
  // 8 caractères de l'alphabet sans ambiguïté, formatés "XXXX-XXXX".
  const chars: string[] = [];
  for (let i = 0; i < 8; i++) {
    const idx = crypto.randomInt(0, USER_CODE_ALPHABET.length);
    chars.push(USER_CODE_ALPHABET[idx]);
  }
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

function recordFromRow(row: { data: unknown } | undefined): DeviceRecord | null {
  if (!row) return null;
  const data = row.data;
  try {
    return (typeof data === 'string' ? JSON.parse(data) : data) as DeviceRecord;
  } catch {
    return null;
  }
}

export async function createDevice(): Promise<CreatedDevice> {
  // Réessaie en cas de collision de user_code (très improbable avec 8 chars sur 31).
  let userCode = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateUserCode();
    const res = await pool.query(`SELECT 1 FROM device_codes WHERE user_code = $1 LIMIT 1`, [candidate]);
    if ((res.rowCount ?? 0) === 0) {
      userCode = candidate;
      break;
    }
  }
  if (!userCode) {
    throw new Error('Could not generate a unique user_code after 5 attempts');
  }

  const deviceCode = generateDeviceCode();
  const expiresAt = Math.floor(Date.now() / 1000) + DEVICE_TTL_SEC;

  const record: DeviceRecord = {
    device_code: deviceCode,
    user_code: userCode,
    status: 'pending',
    expires_at: expiresAt,
  };

  await pool.query(
    `INSERT INTO device_codes (device_code, user_code, data, expires_at)
     VALUES ($1, $2, $3, NOW() + ($4 * interval '1 second'))`,
    [deviceCode, userCode, JSON.stringify(record), DEVICE_TTL_SEC],
  );

  return {
    device_code: deviceCode,
    user_code: userCode,
    expires_in: DEVICE_TTL_SEC,
    interval: POLL_INTERVAL_SEC,
    interval_ms: POLL_INTERVAL_MS,
  };
}

export async function getDevice(deviceCode: string): Promise<DeviceRecord | null> {
  const res = await pool.query(
    `SELECT data FROM device_codes WHERE device_code = $1 AND expires_at > NOW()`,
    [deviceCode],
  );
  return recordFromRow(res.rows[0]);
}

export async function getDeviceByUserCode(userCode: string): Promise<DeviceRecord | null> {
  const res = await pool.query(
    `SELECT data FROM device_codes WHERE user_code = $1 AND expires_at > NOW()`,
    [userCode.toUpperCase()],
  );
  return recordFromRow(res.rows[0]);
}

export async function approveDevice(
  userCode: string,
  user: { id: string; username: string; email: string; role: string },
  accessToken: string,
  refreshToken: string,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'already_resolved' }> {
  const record = await getDeviceByUserCode(userCode);
  if (!record) return { ok: false, reason: 'not_found' };
  if (record.status !== 'pending') return { ok: false, reason: 'already_resolved' };

  record.status = 'approved';
  record.user = user;
  record.access_token = accessToken;
  record.refresh_token = refreshToken;

  // On garde le TTL d'origine sur la ligne : le client doit encore poller /device/token
  // pour récupérer ses tokens. Le statut empêche toute ré-approbation.
  await pool.query(`UPDATE device_codes SET data = $1 WHERE device_code = $2`, [
    JSON.stringify(record),
    record.device_code,
  ]);

  return { ok: true };
}

export async function denyDevice(
  userCode: string,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'already_resolved' }> {
  const record = await getDeviceByUserCode(userCode);
  if (!record) return { ok: false, reason: 'not_found' };
  if (record.status !== 'pending') return { ok: false, reason: 'already_resolved' };

  record.status = 'denied';
  await pool.query(`UPDATE device_codes SET data = $1 WHERE device_code = $2`, [
    JSON.stringify(record),
    record.device_code,
  ]);

  return { ok: true };
}

/**
 * Appelé après un poll réussi (status=approved) : supprime la ligne pour qu'une
 * même approbation ne soit pas récupérée deux fois.
 */
export async function consumeDevice(deviceCode: string): Promise<void> {
  await pool.query(`DELETE FROM device_codes WHERE device_code = $1`, [deviceCode]);
}

// Purge périodique des device codes expirés (Redis le faisait via TTL).
export async function purgeExpiredDevices(): Promise<void> {
  await pool.query(`DELETE FROM device_codes WHERE expires_at < NOW()`);
}
