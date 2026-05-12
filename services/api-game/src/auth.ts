import type { IncomingMessage } from "http";
import jwt from "jsonwebtoken";
import type { AuthenticatedUser } from "./types.js";

export interface JWTPayload {
  sub: string;
  username: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface BearerAuthResult {
  ok: boolean;
  user?: AuthenticatedUser;
  error?: string;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is required");
  }
  return secret;
}

export function assertJwtSecretConfigured(): void {
  getJwtSecret();
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, getJwtSecret(), { algorithms: ["HS256"] }) as JWTPayload;
}

export function userFromJwtPayload(payload: JWTPayload): AuthenticatedUser {
  return {
    id: payload.sub,
    sub: payload.sub,
    username: payload.username,
    role: payload.role,
    iat: payload.iat,
    exp: payload.exp,
  };
}

export function previewToken(token: string): string {
  if (token.length <= 18) return token;
  return `${token.slice(0, 12)}...${token.slice(-6)}`;
}

export function getBearerToken(request: IncomingMessage): string | null {
  const header = request.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return null;

  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match?.[1]?.trim() || null;
}

export function authenticateBearerRequest(request: IncomingMessage): BearerAuthResult {
  const token = getBearerToken(request);
  if (!token) {
    return { ok: false, error: "Missing Bearer token" };
  }

  try {
    return { ok: true, user: userFromJwtPayload(verifyToken(token)) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Invalid Bearer token",
    };
  }
}
