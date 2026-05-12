import { index, integer, jsonb, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './users';

export const quests = pgTable(
  'quests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    questId: varchar('quest_id', { length: 100 }).notNull(),
    locationId: varchar('location_id', { length: 100 }),
    status: varchar('status', { length: 20 }).default('offered').notNull(),
    questData: jsonb('quest_data').notNull(),
    progressSnapshot: jsonb('progress_snapshot').default({}).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    acceptedAt: timestamp('accepted_at'),
    completedAt: timestamp('completed_at'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uq_quests_user_quest').on(t.userId, t.questId),
    index('idx_quests_user_status').on(t.userId, t.status),
    index('idx_quests_user_location_status').on(t.userId, t.locationId, t.status),
  ],
);

export const questProgress = pgTable(
  'quest_progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    questRowId: uuid('quest_row_id').notNull().references(() => quests.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    questId: varchar('quest_id', { length: 100 }).notNull(),
    objectiveId: varchar('objective_id', { length: 100 }).notNull(),
    delta: integer('delta').default(1).notNull(),
    snapshot: jsonb('snapshot').default({}).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_quest_progress_user_quest_created').on(t.userId, t.questId, t.createdAt),
    index('idx_quest_progress_row_created').on(t.questRowId, t.createdAt),
  ],
);
