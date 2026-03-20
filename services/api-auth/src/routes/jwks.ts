import { Router, Request, Response } from 'express';
import { getJWKS } from '../services/jwt.js';

const router = Router();

router.get('/.well-known/jwks.json', (_req: Request, res: Response) => {
  res.json(getJWKS());
});

export default router;
