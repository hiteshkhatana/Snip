# Snip

A URL shortener with click analytics. Two separate apps: a Node/Express/TypeScript API and a React/Vite dashboard, backed by PostgreSQL via Prisma.

## Live links

- **Frontend:** https://snip-three-alpha.vercel.app
- **API:** https://snip-lx8i.onrender.com
- **Demo login:** `demo@snip.local` / `DemoPass123!`

> The API is hosted on Render's free tier, which sleeps after inactivity. The first request after idling can take 30-60 seconds to wake up — that's a cold start, not a bug.

## Local setup

**Requirements:** Node 20+, a PostgreSQL database.

```bash
# Backend
cd backend
npm install
cp .env.example .env        # fill in DATABASE_URL, JWT_SECRET, etc.
npx prisma migrate deploy   # creates tables
npm run seed                # creates the demo account
npm run dev                 # http://localhost:4000

# Frontend (separate terminal)
cd frontend
npm install
cp .env.example .env        # point VITE_API_URL at the backend above
npm run dev                 # http://localhost:5173
```

Run backend tests with `npm test` inside `backend/`.

## Schema

Three tables, managed by Prisma migrations (`backend/prisma/schema.prisma`):

- **users** — `id`, `email` (unique), `passwordHash`, `createdAt`
- **links** — `id`, `userId`, `shortCode` (unique, case-insensitive via Postgres `citext`), `originalUrl`, `expiresAt`, `createdAt`, `deletedAt` (soft delete)
- **clicks** — `id`, `linkId`, `clickedAt`, `referrer`, `userAgent`

No click-counter column anywhere. Every click is its own row; totals and breakdowns are always computed with SQL `COUNT()` at read time. This is what keeps counts correct when many requests hit the same link at once — there's no shared counter for two inserts to race on.

## How short codes work

No alias given → a random 6-8 character code is generated and inserted. The `shortCode` column has a unique constraint in Postgres, so on the rare chance of a collision, the insert fails and the code is retried (up to 5 times) rather than assuming it will never happen.

A custom alias is validated (4-30 characters, letters/numbers/hyphens, not a reserved word like `api` or `health`) and uses the exact same unique-constraint-and-retry path — Postgres is the single source of truth for uniqueness, not a pre-check query, which avoids a race between "check if it's free" and "insert it."

## 301 vs 302

Redirects use **302 (temporary)**, not 301. A 301 tells browsers to cache the redirect forever and stop asking the server on future visits — which would silently break click counting for anyone who visits the same link twice. A 302 keeps every visit hitting the server, so every click gets recorded, and it's also the more honest status code here since a link's destination can be edited later.

## How click counts stay accurate under load

Every redirect does one write — insert a row into `clicks` — before responding. There's no read-modify-write counter step, so there's nothing for concurrent requests to race on; two simultaneous redirects just produce two independent insert statements. Verified by firing 50 truly concurrent requests at one link and confirming exactly 50 click rows were recorded, not 50 ± some lost count.

## JWT expiry

Tokens expire after **30 minutes**. The frontend stores the token in `localStorage` (documented trade-off: readable by injected JavaScript if the site ever had an XSS bug, but the short expiry limits how long a stolen token would work). Any API call that comes back `401` clears the stored token and sends the user to `/login`, so an expired session degrades cleanly instead of hanging in a broken state.

## Known issues / what's incomplete

- **Click-write scaling:** at very high volume, the per-click insert sits on the same request as the redirect. At real scale this would move to an async/batched write (e.g. a queue) so redirect latency isn't coupled to the analytics write — not needed at this project's scale, but it's the known next step.


## Where AI was used

Built with Claude Code (Anthropic) as a pair-programming tool throughout: scaffolding, implementing each backend route and frontend page, writing tests, debugging the production deployment (Supabase connection pooling, Vercel SPA routing, CORS config), and a production-readiness audit that caught and fixed two real issues before deploy (a CORS fallback that could allow any origin if `FRONTEND_URL` was ever unset, and no startup check for missing secrets). Every change was explained in plain language, reviewed, and verified by running tests or the actual app before being accepted — not generated and merged blindly.
