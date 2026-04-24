CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"category" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "expenses_date_desc_idx" ON "expenses" USING btree ("date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "expenses_category_idx" ON "expenses" USING btree ("category");