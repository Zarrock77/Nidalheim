import { Router, Request, Response } from 'express';
import { authenticateUser } from '../services/user.js';
import { signAccessToken, signRefreshToken } from '../services/jwt.js';
import { storeRefreshToken } from '../services/redis.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: 'Missing required fields: username, password' });
    return;
  }

  try {
    const user = await authenticateUser(username, password);

    const accessToken = signAccessToken(user);
    const tokenId = uuidv4();
    const refreshToken = signRefreshToken(user, tokenId);

    await storeRefreshToken(user.id, tokenId);

    res.json({ accessToken, refreshToken });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Login failed';
    if (message === 'Invalid credentials') {
      res.status(401).json({ error: message });
      return;
    }
    res.status(500).json({ error: message });
  }
});

export default router;
