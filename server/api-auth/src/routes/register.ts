import { Router, Request, Response } from 'express';
import { createUser } from '../services/user.js';
import { signAccessToken, signRefreshToken } from '../services/jwt.js';
import { storeRefreshToken } from '../services/redis.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

router.post('/register', async (req: Request, res: Response) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    res.status(400).json({ error: 'Missing required fields: username, email, password' });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  try {
    const user = await createUser(username, email, password);

    const accessToken = signAccessToken(user);
    const tokenId = uuidv4();
    const refreshToken = signRefreshToken(user, tokenId);

    await storeRefreshToken(user.id, tokenId);

    res.status(201).json({ accessToken, refreshToken });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Registration failed';
    if (message === 'Username or email already exists') {
      res.status(409).json({ error: message });
      return;
    }
    res.status(500).json({ error: message });
  }
});

export default router;
