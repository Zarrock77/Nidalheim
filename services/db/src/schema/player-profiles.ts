import { pgTable, uuid, integer, varchar, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';

export const playerProfiles = pgTable('player_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  xp: integer('xp').default(0).notNull(),
  level: integer('level').default(1).notNull(),
  faction: varchar('faction', { length: 50 }),
  reputation: jsonb('reputation').default({}).notNull(),
  questsDone: jsonb('quests_done').default([]).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
