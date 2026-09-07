# Card Tracker

NFL trading card collection tracker with photo identification, catalog matching, and valuation.

## Local setup

### Prerequisites

- Node.js 22+
- pnpm (`npm i -g pnpm`)
- PostgreSQL (Postgres.app or Docker)

### Database

**Postgres.app (recommended):**

Download from [postgresapp.com](https://postgresapp.com). Open it — the server starts automatically. It uses your macOS username with no password.

```bash
# Create the database (one time)
/Applications/Postgres.app/Contents/Versions/latest/bin/createdb card_tracker
```

Set `DATABASE_URL` in `.env.local`:
```
DATABASE_URL=postgresql://YOUR_USERNAME@localhost:5432/card_tracker
```

Postgres.app does **not** auto-start on reboot. To start it:
```bash
open /Applications/Postgres.app
```
Or enable "Automatically start" in Postgres.app preferences.

**Docker (alternative):**

```bash
docker compose up -d
```

Set `DATABASE_URL` in `.env.local`:
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/card_tracker
```

### Environment

```bash
cp .env.example .env.local
# Fill in: DATABASE_URL, AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET
# Generate AUTH_SECRET: openssl rand -base64 33
```

### Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create an OAuth 2.0 Client ID (Web application)
3. Authorized JavaScript origin: `http://localhost:3000`
4. Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
5. Copy Client ID to `AUTH_GOOGLE_ID`, Client Secret to `AUTH_GOOGLE_SECRET`

### Install, migrate, seed, run

```bash
pnpm install
pnpm db:generate    # Generate Prisma client
pnpm db:push        # Push schema to database
pnpm db:seed        # Seed ~15 fake cards
pnpm dev            # http://localhost:3000
```

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Start dev server |
| `pnpm test` | Run unit tests (no API keys needed) |
| `pnpm e2e` | Run Playwright E2E tests |
| `pnpm smoke:identify` | Run identification on real fixture cards (live APIs) |
| `pnpm typecheck` | TypeScript check |
| `pnpm lint` | ESLint |
| `pnpm db:studio` | Open Prisma Studio (database browser) |

## Test suite notes

- Unit tests (`pnpm test`) use fake providers — no API keys or database needed.
- Integration guard tests (`tests/integration/`) hit live APIs — need keys in `.env.local`.
- E2E tests (`pnpm e2e`) need the dev server and database running.
- No tests assume Docker — Postgres.app or any local Postgres works.
