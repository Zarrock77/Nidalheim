CREATE TABLE "device_codes" (
	"device_code" text PRIMARY KEY NOT NULL,
	"user_code" varchar(16) NOT NULL,
	"data" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "device_codes_user_code_unique" UNIQUE("user_code")
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"user_id" uuid NOT NULL,
	"token_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "refresh_tokens_user_id_token_id_pk" PRIMARY KEY("user_id","token_id")
);
