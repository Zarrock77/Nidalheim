import { Router, Request, Response } from 'express';
import { verifyToken, RefreshTokenPayload } from '../services/jwt.js';
import { revokeRefreshToken } from '../services/redis.js';

const router = Router();

router.post('/logout', async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    res.status(400).json({ error: 'Missing refreshToken' });
    return;
  }

  try {
    const payload = verifyToken<RefreshTokenPayload>(refreshToken);
    await revokeRefreshToken(payload.sub, payload.tokenId);
    res.json({ message: 'Logged out successfully' });
  } catch {
    // Even if token is invalid, return success (idempotent logout)
    res.json({ message: 'Logged out successfully' });
  }
});

export default router;
