process.env.JWT_SECRET =
  process.env.JWT_SECRET || "test-secret-at-least-32-bytes-long-for-hs256";
process.env.JWT_ACCESS_TOKEN_EXPIRY = process.env.JWT_ACCESS_TOKEN_EXPIRY || "15m";
process.env.JWT_REFRESH_TOKEN_EXPIRY = process.env.JWT_REFRESH_TOKEN_EXPIRY || "7d";
