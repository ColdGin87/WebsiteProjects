# Goldendale Scorecard

Handicapped **team** competitions for [Goldendale Golf Club](https://maps.google.com/?q=1901+N+Columbus+Ave,+Goldendale,+WA+98620) (1901 N Columbus Ave, Goldendale, WA 98620). Nine holes played twice for 18.

This repo used to be a Bandon Dunes match-play retreat site (`golf-retreat-match-play` in `package.json`). The product is now **Goldendale Scorecard**. Match play remains a second format on the same login and rounds.

Default format: **lowest 1 gross + lowest 2 nets**, three different players.

## Stack

Express + static `public/` UI on **Vercel**, **Turso/libSQL** for the database, JWT + bcrypt for accounts. Scoring rules live in a pure module (`lib/scoring`) so they can be tested without a database.

A Next.js + Supabase rewrite would not fit this Vercel/Express repo cleanly. Optional Supabase env names are listed in `.env.example` for a later migration — do not commit real keys.

## First-time local setup

```bash
npm install
cp .env.example .env
npm test
npm start
```

Open [http://localhost:3000](http://localhost:3000).

With no `TURSO_DATABASE_URL`, the app creates `data/goldendale.db`. The first registered account is the course admin.

## Vercel + Turso

1. Create a free Turso database ([turso.tech](https://turso.tech)).
2. Import the GitHub repo into Vercel.
3. Set environment variables (Project → Settings → Environment Variables):

   | Name | Value |
   | --- | --- |
   | `TURSO_DATABASE_URL` | `libsql://your-database-name.turso.io` |
   | `TURSO_AUTH_TOKEN` | Turso auth token |
   | `JWT_SECRET` | long random string |
   | `APP_BASE_URL` | `https://your-vercel-app.vercel.app` |

4. Deploy. Tables and the Goldendale seed run on the first API request.
5. Create the first account in the UI (that user can edit courses).

Never put real Turso, JWT, or Supabase secrets in git. `.env` is gitignored. Only `.env.example` is committed.

## Product rules that ship

- Email + password, magic link, password reset (links are returned in the API when no mail provider is configured).
- Profile: display name, optional handicap, optional home tee.
- Per-round organizer vs player. Join with a 6-character code or share link.
- Guest players (name + handicap, no login). Max 20 players.
- Users only see rounds they organize or joined.
- Public leaderboard via an unguessable token — read-only, no login.
- Course records (not a hardcoded UI array). Goldendale is seeded:
  - White/Blue 5683 yds, par 72, 67.9 / 112 (men)
  - Red/Gold 5066 yds, 64.8 / 110 (men) and 69.6 / 119 (women)
  - Red/Gold **per-hole** yards are estimated and labeled when official split yardage is missing
- Admin page to edit and add courses. 18 / front 9 / back 9.
- Dots: whole, decimal (nearest), plus as `+2`. Editable mid-round.
- Team settings: gross balls, net balls, dual-count off by default, allowance 75/80/90/100.
- Tie-break: back 9, last 6, last 3, 18, hardest SI.
- Live poll (~5s) plus offline score queue with an unsynced badge.
- Results: winning team, which balls counted, copy as text, CSV, history.
- Gross scores validated **1–15** on the server.

## Tests

```bash
npm test
npm run test:scorecard
```

`npm test` is the pure scoring module (no server).

`npm run test:scorecard` is the automated scorecard filler: it signs up, creates a Goldendale 18-hole team round, adds guests A/B/C/D with handicaps 4/11/18/24, assigns Team 1, enters hole-1 gross 5/6/7/8, and **fails** unless dots are 1/1/1/2, nets are 4/5/6/6, and the team hole is **16**. It starts a temporary file-DB app (no Vercel secrets). To point it at an already running local server:

```bash
SCORECARD_TEST_URL=http://127.0.0.1:3000 npm run test:scorecard
```

This is an HTTP/API tester so CI can run it without a browser. Playwright is not required.

Required case: players H 4, 11, 18, 24 on hole 1 (SI 1, par 5), gross 5/6/7/8 → nets 4/5/6/6 → team hole **16**.
