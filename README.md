# KDeenOff — Leaderboard & Raffles

The official leaderboard, wager race and raffle site for the **KDeenOff** channel.

## Tech stack

- **Backend:** NestJS 11 (TypeScript, Node.js) in [`backend/`](file:///e:/work/html/leaderbord/kdeenoff/backend) — JSON API (`/api/*`), Cloudflare Access admin gate (`/admin*`, `/api/admin*`), scheduled tasks (`@nestjs/schedule`), and SPA/static serving
- **Frontend:** React 19 + TypeScript + Vite 6 + React Router 7 in [`frontend/`](file:///e:/work/html/leaderbord/kdeenoff/frontend) — two SPAs (`public` and `admin`) sharing static CSS/fonts/images in `frontend/public/`
- **Database:** SQLite via `better-sqlite3` (`DATABASE_PATH`, default `data/kdeenoff.sqlite`), schema and seed data in [`migrations/`](file:///e:/work/html/leaderbord/kdeenoff/migrations)

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` in the repository root and fill in optional credentials (`KICK_CLIENT_ID`, `KICK_CLIENT_SECRET`, `RESEND_API_KEY`, `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`).

### 3. Build

```bash
npm run build
```

Builds the public and admin React apps into `frontend/dist/public` and `frontend/dist/admin`, then compiles the NestJS backend into `backend/dist`.

### 4. Local development (acceptance preview)

```bash
npm run serve
```

Runs `vite build --watch` for both React apps alongside `nest start --watch` at http://localhost:8080/ with the local SQLite database (migrations in `migrations/` are applied automatically on startup).

For optional Vite HMR on port 5173 (proxying `/api` to `:8080`):

```bash
npm run dev:hmr
```

### 5. Production run

```bash
npm run build
npm start
```

### 6. Typechecking & database utilities

```bash
npm run typecheck
npm run migrate
npm run db:import -w backend -- path/to/d1-dump.sql
```

## Features

- **Home page (`/`):** hero with the promo code, raffle steps, partner bonuses, leaderboard and contacts.
- **Raffles (`/raffles/`):** ongoing and past raffles, with prizes and winners.
- **Leaderboards (`/leaderboards/`, `/leaderboards/<slug>/`):** prize pool, countdown timer and a ranked player table.
- **Bonuses (`/bonuses/`):** partner bonus cards with filtering and search.
- **Daily cases (`/cases/`):** token-unlocked daily cases paying out in coins.
- **Account (`/account/`):** Kick account link, email verification, token balance and history.
- **Admin panel (`/admin/`):**
  - Create, edit and archive leaderboards
  - Manage players (add, edit wager and prize, remove)
  - Import players from CSV
  - Auto-rank players by wager
  - Automatic wager growth with a 72-hour schedule preview
  - Fixed prizes per spot (spot prizes)
  - Raffle management
  - Daily cases (unlock threshold, prizes in coins with weights)
  - Ranks and XP amounts
  - Site settings (promo code, partner links, socials)
  - Audit log of admin actions

## Raffle tokens

- A viewer with a linked Kick account presses **Join** on a live raffle (`POST /api/raffles/<id>/join`).
- Each entry grants **1 token** that lasts **30 days** from the moment it was granted. Tokens are never spent; they just stop counting after expiry. The balance is shown in the header and listed on `/account/`.
- Tokens belong to the Kick account (one Kick account = one entry per raffle). Everything is decided on the server: raffle open window, amount, expiry. The client only sends the raffle id.
- Writes need the CSRF token and a same-origin request. Repeat or parallel joins are blocked by unique keys inside one SQLite transaction.
- The scheduled task removes expired tokens every 15 minutes. Deleting a raffle removes its entries but keeps tokens already earned.

## Daily cases and coins

- Page `/cases/`. Admin page `/admin/cases/`. Schema in `migrations/0007_daily_cases.sql`.
- A case unlocks while the Kick account holds at least **N live tokens** (starter set: 3 / 16 / 28). Tokens are **not spent**.
- Each case opens **once every 24 hours** per Kick account, counted from the last opening of that case.
- A prize is an amount of **coins** (a separate currency); `0` coins means "nothing". Each prize row has a weight; chance = weight / sum of weights. Visitors see the chances.
- The server rolls the prize (`crypto.getRandomValues`) and writes it with one conditional `INSERT` that re-checks visibility, the token threshold, the cooldown and that the prize table did not change. Parallel opens cannot pass twice.
- Coin balance = sum of all openings (`case_opens`). It is shown on `/cases/` and `/account/`. Deleting a case keeps coins already won.
- API: `GET /api/cases`, `POST /api/cases/<id>/open` (CSRF + same origin), admin CRUD at `/api/admin/cases`.

## Ranks and XP

- Admin page `/admin/ranks/`. Schema in `migrations/0008_ranks.sql`. XP belongs to the Kick account.
- **Raffle:** XP on entry, in the same transaction as the token (default 10).
- **Leaderboard:** paid once when the board ends (cron every 15 minutes, or the admin button "Pay out finished leaderboards now"). A player gets XP only if their leaderboard name matches a Kick account linked to the site (case-insensitive). Participation XP + place bonus (1st / 2nd / 3rd / 4–10). Players without a linked account get nothing, and it is not kept for later. Hidden boards wait until visible. Boards that ended before this migration do not pay.
- A rank is reached at its XP. The starting rank stays at 0 XP and cannot be deleted; a rank with cases cannot be deleted.
- Every case has a rank. A viewer sees and opens only the cases of the highest reached rank that has visible cases, so a new rank swaps the set (starter sets: Rookie 0, Regular 100, Veteran 400, Legend 1000 XP).
- Rank and XP show on `/account/`, `/cases/` and in the menu.

## Admin access (Cloudflare Access)

The NestJS server only lets `/admin*` and `/api/admin*` through with a valid Cloudflare Access JWT.

1. Zero Trust → Access → Applications → add a self-hosted app for your domain with paths `admin` and `api/admin`, and a policy allowing only your email(s).
2. Copy the app's **Application Audience (AUD) tag**.
3. Set the environment variables in `.env`:

```ini
CF_ACCESS_TEAM_DOMAIN=myteam.cloudflareaccess.com
CF_ACCESS_AUD=your_aud_tag_here
```

Without these two values the admin answers 503 in production (`NODE_ENV=production`, fail closed). Local `npm run serve` on loopback (`localhost` / `127.0.0.1`) stays open in development.

## Art pipeline

Generated images are processed by `scripts/process-art-v2.py`, which upscales them with Real-ESRGAN before outputting WebP assets into `frontend/public/img/`.
