import crypto from 'crypto';
import redis from './redis.js';

/**
 * OAuth 2.0 Device Authorization Grant (RFC 8628) state, stored in Redis.
 *
 * Two keys per pending authorization:
 *  - `device:<device_code>` → the canonical record (status, tokens once approved, etc.)
 *  - `usercode:<user_code>`  → reverse pointer back to the device_code (so the
 *    web approval page can resolve a short user_code to its device record)
 *
 * Both keys share the same TTL (DEVICE_TTL_SEC) and are deleted together.
 */

const DEVICE_TTL_SEC = 10 * 60; // 10 minutes — RFC 8628 typical
const POLL_INTERVAL_SEC = 5;
const POLL_INTERVAL_MS = 1000;

// Alphabet without confusing chars (0/O, 1/I/L).
const USER_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export type DeviceStatus = 'pending' | 'approved' | 'denied';

export interface DeviceRecord {
  device_code: string;
  user_code: string;
  status: DeviceStatus;
  expires_at: number; // unix epoch seconds
  // Filled when status === 'approved' :
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
  // 32 random bytes → 64 hex chars. Opaque to clients, never displayed.
  return crypto.randomBytes(32).toString('hex');
}

function generateUserCode(): string {
  // 8 chars from the unambiguous alphabet, formatted "XXXX-XXXX".
  const chars: string[] = [];
  for (let i = 0; i < 8; i++) {
    const idx = crypto.randomInt(0, USER_CODE_ALPHABET.length);
    chars.push(USER_CODE_ALPHABET[idx]);
  }
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

function deviceKey(deviceCode: string): string {
  return `device:${deviceCode}`;
}

function userCodeKey(userCode: string): string {
  return `usercode:${userCode.toUpperCase()}`;
}

export async function createDevice(): Promise<CreatedDevice> {
  // Retry user_code generation on collision (extremely unlikely with 8 chars
  // from a 31-char alphabet, but cheap to guard against).
  let userCode = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateUserCode();
    const exists = await redis.exists(userCodeKey(candidate));
    if (exists === 0) {
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

  // Store both keys with the same TTL.
  await redis.set(deviceKey(deviceCode), JSON.stringify(record), 'EX', DEVICE_TTL_SEC);
  await redis.set(userCodeKey(userCode), deviceCode, 'EX', DEVICE_TTL_SEC);

  return {
    device_code: deviceCode,
    user_code: userCode,
    expires_in: DEVICE_TTL_SEC,
    interval: POLL_INTERVAL_SEC,
    interval_ms: POLL_INTERVAL_MS,
  };
}

export async function getDevice(deviceCode: string): Promise<DeviceRecord | null> {
  const raw = await redis.get(deviceKey(deviceCode));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DeviceRecord;
  } catch {
    return null;
  }
}

export async function getDeviceByUserCode(userCode: string): Promise<DeviceRecord | null> {
  const deviceCode = await redis.get(userCodeKey(userCode));
  if (!deviceCode) return null;
  return getDevice(deviceCode);
}

export async function approveDevice(
  userCode: string,
  user: { id: string; username: string; email: string; role: string },
  accessToken: string,
  refreshToken: string,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'already_resolved' }> {
  const deviceCode = await redis.get(userCodeKey(userCode));
  if (!deviceCode) return { ok: false, reason: 'not_found' };

  const raw = await redis.get(deviceKey(deviceCode));
  if (!raw) return { ok: false, reason: 'not_found' };

  let record: DeviceRecord;
  try {
    record = JSON.parse(raw) as DeviceRecord;
  } catch {
    return { ok: false, reason: 'not_found' };
  }

  if (record.status !== 'pending') {
    return { ok: false, reason: 'already_resolved' };
  }

  record.status = 'approved';
  record.user = user;
  record.access_token = accessToken;
  record.refresh_token = refreshToken;

  // Preserve remaining TTL on the device key — clients still need to poll
  // /device/token to actually pick up the tokens.
  const ttl = await redis.ttl(deviceKey(deviceCode));
  const newTtl = ttl > 0 ? ttl : 60; // 60s safety floor

  await redis.set(deviceKey(deviceCode), JSON.stringify(record), 'EX', newTtl);
  // Drop the user_code reverse pointer — it's no longer needed and prevents
  // the same code from being reused / re-approved.
  await redis.del(userCodeKey(userCode));

  return { ok: true };
}

export async function denyDevice(
  userCode: string,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'already_resolved' }> {
  const deviceCode = await redis.get(userCodeKey(userCode));
  if (!deviceCode) return { ok: false, reason: 'not_found' };

  const raw = await redis.get(deviceKey(deviceCode));
  if (!raw) return { ok: false, reason: 'not_found' };

  let record: DeviceRecord;
  try {
    record = JSON.parse(raw) as DeviceRecord;
  } catch {
    return { ok: false, reason: 'not_found' };
  }

  if (record.status !== 'pending') {
    return { ok: false, reason: 'already_resolved' };
  }

  record.status = 'denied';
  const ttl = await redis.ttl(deviceKey(deviceCode));
  const newTtl = ttl > 0 ? ttl : 60;
  await redis.set(deviceKey(deviceCode), JSON.stringify(record), 'EX', newTtl);
  await redis.del(userCodeKey(userCode));

  return { ok: true };
}

/**
 * Called after a successful poll (status=approved): drop the device record
 * so the same approval can't be picked up twice.
 */
export async function consumeDevice(deviceCode: string): Promise<void> {
  await redis.del(deviceKey(deviceCode));
}
