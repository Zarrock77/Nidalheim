CREATE TABLE "npcs" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"system_prompt" text NOT NULL,
	"voice_id" varchar(100),
	"tts_model" varchar(50),
	"llm_model" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "idx_chat_messages_user_created";--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "npc_id" varchar(100) DEFAULT 'default' NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_chat_messages_user_npc_created" ON "chat_messages" USING btree ("user_id","npc_id","created_at");--> statement-breakpoint
INSERT INTO "npcs" ("id", "name", "system_prompt") VALUES (
  'default',
  'Villageois de Nidalheim',
  $$Tu es un villageois du village appelé Nidalheim, un village nordique dark-fantasy. Tu parles uniquement en français. Tu es serviable : si on te pose une question, tu réponds. Tu as un peu d'humour et tu n'hésites pas à charrier si l'occasion se présente. Lorsque tu parles, tu es le plus concis possible — une seule phrase, courte si possible. Tu te souviens de ce que le joueur t'a déjà dit dans les échanges précédents.$$
) ON CONFLICT ("id") DO NOTHING;