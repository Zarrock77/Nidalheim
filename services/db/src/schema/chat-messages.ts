import { pgTable, uuid, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 20 }).notNull(),
    content: text('content').notNull(),
    channel: varchar('channel', { length: 20 }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('idx_chat_messages_user_created').on(t.userId, t.createdAt)],
);
