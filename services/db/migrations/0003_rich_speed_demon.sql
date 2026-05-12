CREATE TABLE "quest_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quest_row_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"quest_id" varchar(100) NOT NULL,
	"objective_id" varchar(100) NOT NULL,
	"delta" integer DEFAULT 1 NOT NULL,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"quest_id" varchar(100) NOT NULL,
	"location_id" varchar(100),
	"status" varchar(20) DEFAULT 'offered' NOT NULL,
	"quest_data" jsonb NOT NULL,
	"progress_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"accepted_at" timestamp,
	"completed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quest_progress" ADD CONSTRAINT "quest_progress_quest_row_id_quests_id_fk" FOREIGN KEY ("quest_row_id") REFERENCES "public"."quests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_progress" ADD CONSTRAINT "quest_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quests" ADD CONSTRAINT "quests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_quest_progress_user_quest_created" ON "quest_progress" USING btree ("user_id","quest_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_quest_progress_row_created" ON "quest_progress" USING btree ("quest_row_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_quests_user_quest" ON "quests" USING btree ("user_id","quest_id");--> statement-breakpoint
CREATE INDEX "idx_quests_user_status" ON "quests" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_quests_user_location_status" ON "quests" USING btree ("user_id","location_id","status");