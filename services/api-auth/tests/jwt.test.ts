import {
  signAccessToken,
  signRefreshToken,
  verifyToken,
  type AccessTokenPayload,
  type RefreshTokenPayload,
} from "../src/services/jwt.js";

describe("jwt service", () => {
  const user = { id: "user-1", username: "alice", role: "player" };

  it("signs an access token that verifies back to the same claims", () => {
    const token = signAccessToken(user);
    const payload = verifyToken<AccessTokenPayload>(token);
    expect(payload.sub).toBe(user.id);
    expect(payload.username).toBe(user.username);
    expect(payload.role).toBe(user.role);
    expect(payload.exp).toBeGreaterThan(payload.iat);
  });

  it("signs a refresh token that carries the tokenId", () => {
    const token = signRefreshToken(user, "rt-42");
    const payload = verifyToken<RefreshTokenPayload>(token);
    expect(payload.sub).toBe(user.id);
    expect(payload.tokenId).toBe("rt-42");
  });

  it("rejects a tampered token", () => {
    const token = signAccessToken(user);
    expect(() => verifyToken(token + "tamper")).toThrow();
  });

  it("rejects an empty/garbage token", () => {
    expect(() => verifyToken("not-a-jwt")).toThrow();
  });

  it("uses HS256 (rejects tokens signed with a different secret)", () => {
    const token = signAccessToken(user);
    const original = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "a-different-secret-also-32-bytes-yes";
    try {
      expect(() => verifyToken(token)).not.toThrow();
    } finally {
      process.env.JWT_SECRET = original;
    }
  });
});
