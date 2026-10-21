CREATE TYPE "public"."place_source" AS ENUM('google', 'sample');--> statement-breakpoint
CREATE TYPE "public"."room_outcome" AS ENUM('winner', 'none', 'tapwar', 'roulette');--> statement-breakpoint
CREATE TYPE "public"."room_phase" AS ENUM('lobby', 'voting', 'results');--> statement-breakpoint
CREATE TYPE "public"."vote" AS ENUM('nope', 'like', 'love', 'veto');--> statement-breakpoint
CREATE TABLE "places" (
	"place_id" text PRIMARY KEY NOT NULL,
	"price_from" integer,
	"price_to" integer,
	"currency" text,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_members" (
	"room_code" text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"max_spend" integer,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "room_members_room_code_user_id_pk" PRIMARY KEY("room_code","user_id")
);
--> statement-breakpoint
CREATE TABLE "room_places" (
	"room_code" text NOT NULL,
	"place_id" text NOT NULL,
	"position" integer NOT NULL,
	"deck_position" integer,
	"added_by" text,
	CONSTRAINT "room_places_room_code_place_id_pk" PRIMARY KEY("room_code","place_id")
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"host_id" text NOT NULL,
	"area" text NOT NULL,
	"craving" text DEFAULT '' NOT NULL,
	"center_lat" double precision,
	"center_lng" double precision,
	"source" "place_source" NOT NULL,
	"picks_only" boolean DEFAULT false NOT NULL,
	"phase" "room_phase" DEFAULT 'lobby' NOT NULL,
	"outcome" "room_outcome",
	"winner_id" text,
	"candidates" text[],
	"tie_starts_at" bigint,
	"tie_ends_at" bigint,
	"after_tap_war" boolean,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "taps" (
	"room_code" text NOT NULL,
	"user_id" text NOT NULL,
	"place_id" text NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "taps_room_code_user_id_place_id_pk" PRIMARY KEY("room_code","user_id","place_id")
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"room_code" text NOT NULL,
	"user_id" text NOT NULL,
	"place_id" text NOT NULL,
	"vote" "vote" NOT NULL,
	CONSTRAINT "votes_room_code_user_id_place_id_pk" PRIMARY KEY("room_code","user_id","place_id")
);
--> statement-breakpoint
ALTER TABLE "room_members" ADD CONSTRAINT "room_members_room_code_rooms_code_fk" FOREIGN KEY ("room_code") REFERENCES "public"."rooms"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_places" ADD CONSTRAINT "room_places_room_code_rooms_code_fk" FOREIGN KEY ("room_code") REFERENCES "public"."rooms"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_places" ADD CONSTRAINT "room_places_place_id_places_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("place_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taps" ADD CONSTRAINT "taps_member_fk" FOREIGN KEY ("room_code","user_id") REFERENCES "public"."room_members"("room_code","user_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "taps" ADD CONSTRAINT "taps_place_fk" FOREIGN KEY ("room_code","place_id") REFERENCES "public"."room_places"("room_code","place_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_member_fk" FOREIGN KEY ("room_code","user_id") REFERENCES "public"."room_members"("room_code","user_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_place_fk" FOREIGN KEY ("room_code","place_id") REFERENCES "public"."room_places"("room_code","place_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rooms_created_at_idx" ON "rooms" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "votes_one_veto_idx" ON "votes" USING btree ("room_code","user_id") WHERE "votes"."vote" = 'veto';