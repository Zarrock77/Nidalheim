import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  approveDevice,
  consumeDevice,
  createDevice,
  denyDevice,
  getDevice,
  getDeviceByUserCode,
} from '../services/devices.js';
import { signAccessToken, signRefreshToken, verifyToken, AccessTokenPayload } from '../services/jwt.js';
import { storeRefreshToken } from '../services/redis.js';
import { getUserById } from '../services/user.js';

const router = Router();

const CLIENT_NAME = 'Nidalheim Game';

/**
 * Error strings matched by the web client's transparent refresh logic
 * (see services/site/src/lib/auth/AuthContext.tsx). Don't reword without
 * updating the client.
 */
const ERR_MISSING_AUTH = 'Missing or invalid Authorization header';
const ERR_INVALID_TOKEN = 'Invalid or expired access token';

function deviceVerificationBaseUrl(req: Request): string {
  const fromEnv = process.env.DEVICE_VERIFICATION_BASE_URL;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.replace(/\/+$/, '');
  // Fallback: use the request's own host. Behind nginx + Cloudflare we trust
  // X-Forwarded-Proto / X-Forwarded-Host. We rewrite api-auth.* → www.* so
  // the verification page is on the public site.
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'www.nidalheim.com';
  return `${proto}://${host.replace(/^api-auth\./, 'www.')}`;
}

function requireBearerSubject(req: Request, res: Response): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
    res.status(401).json({ error: ERR_MISSING_AUTH });
    return null;
  }
  const accessToken = auth.slice(7).trim();
  try {
    const payload = verifyToken<AccessTokenPayload>(accessToken);
    return payload.sub;
  } catch {
    res.status(401).json({ error: ERR_INVALID_TOKEN });
    return null;
  }
}

/**
 * RFC 8628 §3.2 — Device Authorization Request.
 * Client (UE5) calls this with no body; we hand back a fresh device_code +
 * short user_code and the URL where the user should go to approve.
 */
router.post('/device/authorize', async (req: Request, res: Response) => {
  try {
    const created = await createDevice();
    const verificationBase = deviceVerificationBaseUrl(req);
    const verificationUri = `${verificationBase}/device`;
    const verificationUriComplete = `${verificationBase}/device?code=${encodeURIComponent(created.user_code)}`;

    res.json({
      device_code: created.device_code,
      user_code: created.user_code,
      verification_uri: verificationUri,
      verification_uri_complete: verificationUriComplete,
      expires_in: created.expires_in,
      interval: created.interval,
      interval_ms: created.interval_ms,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create device authorization';
    res.status(500).json({ error: message });
  }
});

/**
 * RFC 8628 §3.4 — Device Access Token Request. The client polls this with
 * its device_code; we return either the tokens (status=approved) or one of
 * the standard error codes (authorization_pending, expired_token, …).
 */
router.post('/device/token', async (req: Request, res: Response) => {
  const { device_code } = req.body ?? {};
  if (!device_code || typeof device_code !== 'string') {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }

  const record = await getDevice(device_code);
  if (!record) {
    // Either expired (Redis TTL) or never existed.
    res.status(400).json({ error: 'expired_token' });
    return;
  }

  if (record.status === 'denied') {
    res.status(400).json({ error: 'access_denied' });
    return;
  }

  if (record.status === 'pending') {
    res.status(400).json({ error: 'authorization_pending' });
    return;
  }

  if (record.status === 'approved') {
    if (!record.user || !record.access_token || !record.refresh_token) {
      res.status(500).json({ error: 'malformed_record' });
      return;
    }
    // One-shot: consume so the same approval can't be replayed.
    await consumeDevice(device_code);
    res.json({
      user: record.user,
      accessToken: record.access_token,
      refreshToken: record.refresh_token,
    });
    return;
  }

  res.status(500).json({ error: 'unknown_status' });
});

/**
 * Public-facing record for the web /device approval page. The page calls
 * this *after* the user logs in (so we can require a Bearer token) — it
 * tells the page "yes, this user_code is real and pending, here's how
 * many seconds remain".
 */
router.post('/device/lookup', async (req: Request, res: Response) => {
  if (requireBearerSubject(req, res) === null) return;

  const { user_code } = req.body ?? {};
  if (!user_code || typeof user_code !== 'string') {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }

  const record = await getDeviceByUserCode(user_code);
  if (!record) {
    res.status(404).json({ error: 'expired_token' });
    return;
  }
  if (record.status !== 'pending') {
    res.status(409).json({ error: 'already_resolved' });
    return;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const expiresIn = Math.max(0, record.expires_at - nowSec);

  res.json({
    user_code: record.user_code,
    client_name: CLIENT_NAME,
    expires_in: expiresIn,
  });
});

/**
 * Called by `services/site` /device page after the user logs in and clicks
 * "Approve". We mint a *separate* token pair for the device so the user
 * can revoke the device session without killing their web session.
 */
router.post('/device/approve', async (req: Request, res: Response) => {
  const subject = requireBearerSubject(req, res);
  if (subject === null) return;

  const { user_code } = req.body ?? {};
  if (!user_code || typeof user_code !== 'string') {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }

  const record = await getDeviceByUserCode(user_code);
  if (!record) {
    res.status(404).json({ error: 'expired_token' });
    return;
  }
  if (record.status !== 'pending') {
    res.status(409).json({ error: 'already_resolved' });
    return;
  }

  let user;
  try {
    user = await getUserById(subject);
  } catch {
    res.status(401).json({ error: 'user_not_found' });
    return;
  }

  // Mint a brand-new token pair for the device session.
  const deviceAccess = signAccessToken(user);
  const tokenId = uuidv4();
  const deviceRefresh = signRefreshToken(user, tokenId);
  await storeRefreshToken(user.id, tokenId);

  const result = await approveDevice(user_code, user, deviceAccess, deviceRefresh);
  if (!result.ok) {
    res.status(409).json({ error: result.reason });
    return;
  }

  res.json({ status: 'approved' });
});

/**
 * Companion to /device/approve: the user can refuse the device authorization.
 */
router.post('/device/deny', async (req: Request, res: Response) => {
  if (requireBearerSubject(req, res) === null) return;

  const { user_code } = req.body ?? {};
  if (!user_code || typeof user_code !== 'string') {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }

  const result = await denyDevice(user_code);
  if (!result.ok) {
    res.status(404).json({ error: result.reason });
    return;
  }
  res.json({ status: 'denied' });
});

export default router;
