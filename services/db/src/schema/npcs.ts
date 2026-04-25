import { pgTable, varchar, text, timestamp } from 'drizzle-orm/pg-core';

export const npcs = pgTable('npcs', {
  id: varchar('id', { length: 100 }).primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  systemPrompt: text('system_prompt').notNull(),
  voiceId: varchar('voice_id', { length: 100 }),
  ttsModel: varchar('tts_model', { length: 50 }),
  llmModel: varchar('llm_model', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
