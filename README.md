# KDeenOff — Leaderboard & Raffles

The official leaderboard, wager race and raffle site for the **KDeenOff** channel.

## Tech stack

- **Frontend:** Eleventy (11ty) + vanilla CSS + vanilla JS
- **Bundling:** esbuild (CSS & JS minification)
- **Backend:** Cloudflare Worker (JSON API, page rewrites, scheduled wager growth)
- **Database:** Cloudflare D1 (SQLite), schema and seed data in `migrations/`

## Getting started

### Install dependencies

```bash
npm install
```

### Build

```bash
npm run build
```

Builds the static site into `dist/` and minifies CSS and JS.

### Local development

```bash
npm run serve
```

Runs the Worker locally at http://localhost:8080 with a local D1 database.

### Deploy to Cloudflare

```bash
npm run deploy
```

Builds the project and deploys it with `wrangler deploy`.

## Features

- **Home page:** hero with the promo code, raffle steps, partner bonuses, leaderboard and contacts.
- **Raffles (`/raffles/`):** ongoing and past raffles, with prizes and winners.
- **Leaderboards (`/leaderboards/<slug>/`):** prize pool, countdown timer and a ranked player table.
- **Admin panel (`/admin/`):**
  - Create, edit and archive leaderboards
  - Manage players (add, edit wager and prize, remove)
  - Import players from CSV
  - Auto-rank players by wager
  - Automatic wager growth with a 72-hour schedule preview
  - Fixed prizes per spot (spot prizes)
  - Raffle management
  - Site settings (promo code, partner links, socials)
  - Audit log of admin actions

## Art pipeline

Generated images are processed by `scripts/process-art-v2.py`, which upscales them with Real-ESRGAN before they are used on the site.
