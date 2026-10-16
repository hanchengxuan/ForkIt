ALTER TABLE "rooms" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "rooms_created_at_idx" ON "rooms" USING btree ("created_at");