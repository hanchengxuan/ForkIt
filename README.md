# ForkIt

Group dinner decider: everyone swipes on nearby restaurants, the app picks.

## Run

```bash
cp .env.example .env.local   # then paste your key after GOOGLE_MAPS_API_KEY=
docker run -d --name forkit-pg -e POSTGRES_PASSWORD=forkit -e POSTGRES_DB=forkit -p 5432:5432 postgres:17
npm install
npm run db:migrate           # creates the tables
npm run dev                  # http://localhost:3000
npm test                     # pure rules; CI also runs lint, typecheck and the database tests
docker exec forkit-pg createdb -U postgres forkit_test     # once, for the room action tests:
TEST_DATABASE_URL=postgresql://postgres:forkit@localhost:5432/forkit_test npm test
```

## Deploy

Any host that runs Next.js works (Vercel, Railway, Fly). Set `DATABASE_URL` to a Postgres database (with a connection pooler, e.g. Supabase or Neon: the pooled URL, plus a direct or session URL in `DATABASE_URL_UNPOOLED` for migrations), `GOOGLE_MAPS_API_KEY`, `BETTER_AUTH_SECRET` (random, 32+ chars) and `BETTER_AUTH_URL` (the site's public URL), then run `npm run db:migrate` once against that database. On Vercel this is automatic for production: the `vercel-build` script runs `drizzle-kit migrate` before `next build` when `VERCEL_ENV=production`, using `DATABASE_URL_UNPOOLED` (falls back to `DATABASE_URL`), so a failed migration fails the deploy. Preview and local builds never migrate. After changing `lib/db/schema.ts`, run `npm run db:generate` and commit the new file in `drizzle/`.

The key needs **Places API (New)** enabled in Google Cloud. Without a key the app uses 12 sample restaurants.

## How it works

1. **Create** a group with an area (or your location) and, optionally, a craving like "yum cha" or "fried chicken". The server fetches up to 60 candidates from Google Places once and stores them; the deck is the best 20 that fit everyone's budget, so everyone swipes the same places.
2. **Join** with the 4-letter code or link. No sign-up needed: every visitor gets a guest account (Better Auth anonymous sign-in). Signing in with email moves your seats and votes to the real account, so you can rejoin from another phone.
3. **Budget** per person filters the deck before swiping: the group uses its lowest budget. Places with no price on Google are kept.
4. **Swipe**: ✕ nope = 0, ♥ yum = 1, ★ love = 2. One 🚫 veto per person knocks a place out for everyone. Other people's swipes stay hidden until results.
5. **Results** when everyone is done (or the host reveals early):
   - Clear top score → winner.
   - Tie → **👆 Tap war**: every tied place goes on screen; after a 3-2-1 countdown everyone has 10 seconds to tap the one they want. Most taps wins (capped at 150 taps per person).
   - Still tied (or nobody liked anything) → **🎰 Wheel of fate**. The server picks the winner; phones only animate, so everyone lands on the same place.

## Code map

Three layers: pure rules, room actions, SQL.

- `lib/domain/` — pure rules with unit tests, no database: ranking and tie-breaks (`scoring.ts`), budgets (`budget.ts`), which places make the deck (`deck.ts`), how a round ends and tap limits (`outcome.ts`), input cleanup (`input.ts`)
- `lib/service/actions.ts` — one table of actions (join, vote, tap, …), each with its host/lobby checks. Each runs in one transaction that locks the room row (`FOR UPDATE`), so actions on one room apply one at a time, then bumps the room's version. A new feature is a new entry there, plus a test in `actions.test.ts` (runs against a real Postgres)
- `lib/service/view.ts` — what a phone may see, read in one REPEATABLE READ transaction. Other people's swipes stay hidden until results
- `lib/repo/` — SQL only, one file per table
- `lib/db/schema.ts` — `rooms` (settings, phase, outcome), `room_members`, `room_places` (a room's candidates and deck), `places` (Google details cached once and shared by rooms), `votes`, `taps`, plus the Better Auth tables. Foreign keys cascade: deleting a room removes its rows, and renaming a member (guest → real account) carries their votes and taps. One veto per person is a unique index. Rooms expire after 7 days: creating a room deletes expired ones and the places only they used
- `lib/auth.ts` / `lib/auth-client.ts` — Better Auth: email + password, guest accounts; room APIs identify you by session cookie
- `lib/google-places.ts` — Google Places search + sample fallback. Routes call it before taking the room lock, so a slow search never holds up other phones
- `app/api/photo` — streams Google photos so the API key never reaches the browser
- `app/r/[code]` — lobby, swipe deck, tap war, wheel, results. Phones poll every 1.5s (0.4s during a tap war), sending the version they hold; the server answers "unchanged" from the `rooms` row alone and only builds the full view when the version moved
