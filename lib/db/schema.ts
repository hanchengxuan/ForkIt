import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { VOTES } from "../domain/scoring.ts";
import type { Restaurant } from "../google-places";

export const roomPhase = pgEnum("room_phase", ["lobby", "voting", "results"]);
export const roomOutcome = pgEnum("room_outcome", ["winner", "none", "tapwar", "roulette"]);
export const placeSource = pgEnum("place_source", ["google", "sample"]);
export const vote = pgEnum("vote", VOTES);

// One row per room: its settings, which phase it is in, and how the round ended.
export const rooms = pgTable(
  "rooms",
  {
    code: text("code").primaryKey(),
    name: text("name").notNull(),
    hostId: text("host_id").notNull(),
    area: text("area").notNull(),
    craving: text("craving").notNull().default(""), // empty means any restaurant
    centerLat: doublePrecision("center_lat"), // where the search was, so "add a restaurant" suggests nearby places first
    centerLng: doublePrecision("center_lng"),
    source: placeSource("source").notNull(),
    picksOnly: boolean("picks_only").notNull().default(false), // swipe only places added by hand
    phase: roomPhase("phase").notNull().default("lobby"),
    // Set when results come out. A tie keeps its candidates and clock here until it is settled.
    outcome: roomOutcome("outcome"),
    winnerId: text("winner_id"),
    candidates: text("candidates").array(),
    tieStartsAt: bigint("tie_starts_at", { mode: "number" }), // tap war or wheel start, in server ms
    tieEndsAt: bigint("tie_ends_at", { mode: "number" }), // tap war only
    afterTapWar: boolean("after_tap_war"),
    // Goes up on every write; a poll holding the same version gets "unchanged" without loading the room
    version: integer("version").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("rooms_created_at_idx").on(t.createdAt)],
);

// Member ids are Better Auth user ids (guest or signed in). No foreign key to `user`: a guest's row there is
// deleted after they sign in, and the seat should survive that.
export const roomMembers = pgTable(
  "room_members",
  {
    roomCode: text("room_code")
      .notNull()
      .references(() => rooms.code, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    maxSpend: integer("max_spend"), // in the room's currency; null = no limit
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.roomCode, t.userId] })],
);

// Google's details, cached once per place and shared by every room that has it.
export const places = pgTable("places", {
  placeId: text("place_id").primaryKey(),
  // Price has its own columns so the lobby can filter by budget without loading `data`
  priceFrom: integer("price_from"),
  priceTo: integer("price_to"),
  currency: text("currency"),
  data: jsonb("data").$type<Omit<Restaurant, "priceRange" | "addedBy">>().notNull(),
  fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
});

// A room's candidates: the search results, best first, plus places added by hand.
export const roomPlaces = pgTable(
  "room_places",
  {
    roomCode: text("room_code")
      .notNull()
      .references(() => rooms.code, { onDelete: "cascade" }),
    placeId: text("place_id")
      .notNull()
      .references(() => places.placeId),
    position: integer("position").notNull(), // search rank; hand-picked places follow in the order they were added
    deckPosition: integer("deck_position"), // set when voting starts; null = not on the deck
    addedBy: text("added_by"), // member id, when someone picked this place by hand
  },
  (t) => [primaryKey({ columns: [t.roomCode, t.placeId] })],
);

export const votes = pgTable(
  "votes",
  {
    roomCode: text("room_code").notNull(),
    userId: text("user_id").notNull(),
    placeId: text("place_id").notNull(),
    vote: vote("vote").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.roomCode, t.userId, t.placeId] }),
    // Moving a guest to their real account renames the member, and their votes follow
    foreignKey({ name: "votes_member_fk", columns: [t.roomCode, t.userId], foreignColumns: [roomMembers.roomCode, roomMembers.userId] })
      .onDelete("cascade")
      .onUpdate("cascade"),
    foreignKey({ name: "votes_place_fk", columns: [t.roomCode, t.placeId], foreignColumns: [roomPlaces.roomCode, roomPlaces.placeId] }).onDelete(
      "cascade",
    ),
    uniqueIndex("votes_one_veto_idx").on(t.roomCode, t.userId).where(sql`${t.vote} = 'veto'`),
  ],
);

export const taps = pgTable(
  "taps",
  {
    roomCode: text("room_code").notNull(),
    userId: text("user_id").notNull(),
    placeId: text("place_id").notNull(),
    count: integer("count").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.roomCode, t.userId, t.placeId] }),
    foreignKey({ name: "taps_member_fk", columns: [t.roomCode, t.userId], foreignColumns: [roomMembers.roomCode, roomMembers.userId] })
      .onDelete("cascade")
      .onUpdate("cascade"),
    foreignKey({ name: "taps_place_fk", columns: [t.roomCode, t.placeId], foreignColumns: [roomPlaces.roomCode, roomPlaces.placeId] }).onDelete(
      "cascade",
    ),
  ],
);

// Better Auth tables (core schema + anonymous plugin's isAnonymous)
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  isAnonymous: boolean("is_anonymous").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
