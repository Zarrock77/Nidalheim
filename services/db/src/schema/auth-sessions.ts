import { pgTable, text, varchar, jsonb, timestamp, uuid, primaryKey } from 'drizzle-orm/pg-core';

// État du Device Authorization Grant (RFC 8628) — ex-Redis. Éphémère (~10 min), purgé via expires_at.
export const deviceCodes = pgTable('device_codes', {
  deviceCode: text('device_code').primaryKey(),
  userCode: varchar('user_code', { length: 16 }).unique().notNull(),
  data: jsonb('data').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

// Refresh tokens actifs — ex-Redis. TTL ~7 jours via expires_at.
export const refreshTokens = pgTable('refresh_tokens', {
  userId: uuid('user_id').notNull(),
  tokenId: text('token_id').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.tokenId] }),
}));
