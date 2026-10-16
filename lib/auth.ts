import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { anonymous } from "better-auth/plugins";
import { db } from "./db";
import * as schema from "./db/schema";
import { moveMember } from "./rooms";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true },
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
