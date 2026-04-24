import jwt, { type SignOptions } from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is required");
}

const ACCESS_EXPIRY = process.env.JWT_ACCESS_TOKEN_EXPIRY || "15m";
const REFRESH_EXPIRY = process.env.JWT_REFRESH_TOKEN_EXPIRY || "7d";

const accessSignOpts: SignOptions = { algorithm: "HS256", expiresIn: ACCESS_EXPIRY as any };
const refreshSignOpts: SignOptions = { algorithm: "HS256", expiresIn: REFRESH_EXPIRY as any };

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
    JWT_SECRET as string,
    accessSignOpts,
  );
}

export function signRefreshToken(user: UserPayload, tokenId: string): string {
  return jwt.sign(
    { sub: user.id, tokenId },
    JWT_SECRET as string,
    refreshSignOpts,
  );
}

export function verifyToken<T extends object = AccessTokenPayload>(token: string): T {
  return jwt.verify(token, JWT_SECRET as string, { algorithms: ["HS256"] }) as T;
}
