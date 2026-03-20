import jwt, { type SignOptions } from 'jsonwebtoken';
import { readFileSync } from 'fs';
import { createPublicKey } from 'crypto';

const privateKey = readFileSync(
  process.env.JWT_PRIVATE_KEY_PATH || './keys/private.pem',
  'utf8'
);
const publicKey = readFileSync(
  process.env.JWT_PUBLIC_KEY_PATH || './keys/public.pem',
  'utf8'
);

const ACCESS_EXPIRY = process.env.JWT_ACCESS_TOKEN_EXPIRY || '15m';
const REFRESH_EXPIRY = process.env.JWT_REFRESH_TOKEN_EXPIRY || '7d';

const accessSignOpts: SignOptions = { algorithm: 'RS256', expiresIn: ACCESS_EXPIRY as any };
const refreshSignOpts: SignOptions = { algorithm: 'RS256', expiresIn: REFRESH_EXPIRY as any };

export interface UserPayload {
  id: string;
  username: string;
  role: string;
}

export interface AccessTokenPayload {
  sub: string;
  username: string;
  role: string;
  iat: number;
  exp: number;
}

export interface RefreshTokenPayload {
  sub: string;
  tokenId: string;
  iat: number;
  exp: number;
}

export function signAccessToken(user: UserPayload): string {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    privateKey,
    accessSignOpts
  );
}

export function signRefreshToken(user: UserPayload, tokenId: string): string {
  return jwt.sign(
    { sub: user.id, tokenId },
    privateKey,
    refreshSignOpts
  );
}

export function verifyToken<T extends object = AccessTokenPayload>(token: string): T {
  return jwt.verify(token, publicKey, { algorithms: ['RS256'] }) as T;
}

export function getJWKS() {
  const key = createPublicKey(publicKey);
  const jwk = key.export({ format: 'jwk' });
  return {
    keys: [
      {
        ...jwk,
        kid: 'nidalheim-auth-1',
        use: 'sig',
        alg: 'RS256',
      },
    ],
  };
}
