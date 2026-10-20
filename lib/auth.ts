import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { anonymous } from "better-auth/plugins";
import { db } from "./db";
import * as schema from "./db/schema";
import { moveMember } from "./service/actions";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true },
  rateLimit: {
    // A whole table on one restaurant Wi-Fi shares an IP and opens the link at once.
    // Guest sign-in only creates a guest, so it can be generous; password sign-in keeps the strict default.
    customRules: { "/sign-in/anonymous": { window: 60, max: 30 } },
  },
  plugins: [
    // Everyone gets a guest account on first visit, so joining a room never needs a sign-up
    anonymous({
      onLinkAccount: ({ anonymousUser, newUser }) => moveMember(anonymousUser.user.id, newUser.user.id),
    }),
    nextCookies(),
  ],
});

export async function userIdOf(req: Request): Promise<string | null> {
  const s = await auth.api.getSession({ headers: req.headers });
  return s?.user.id ?? null;
}
