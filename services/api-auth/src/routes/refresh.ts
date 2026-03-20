import { Router, Request, Response } from 'express';
import { verifyToken, signAccessToken, signRefreshToken, RefreshTokenPayload } from '../services/jwt.js';
import { isRefreshTokenValid, revokeRefreshToken, storeRefreshToken } from '../services/redis.js';
import { getUserById } from '../services/user.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.post('/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    res.status(400).json({ error: 'Missing refreshToken' });
    return;
  }

  try {
    const payload = verifyToken<RefreshTokenPayload>(refreshToken);

    const valid = await isRefreshTokenValid(payload.sub, payload.tokenId);
    if (!valid) {
      res.status(401).json({ error: 'Refresh token revoked' });
      return;
    }

    // Revoke old refresh token (rotation)
    await revokeRefreshToken(payload.sub, payload.tokenId);

    const user = await getUserById(payload.sub);

    const newAccessToken = signAccessToken(user);
    const newTokenId = uuidv4();
    const newRefreshToken = signRefreshToken(user, newTokenId);

    await storeRefreshToken(user.id, newTokenId);

    res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

export default router;
