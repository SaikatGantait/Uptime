# DPin Uptime Monitor

A distributed uptime monitoring platform built with TurboRepo.

## Architecture

- **apps/api** - Express backend serving website management and status APIs
- **apps/frontend** - Next.js dashboard UI
- **apps/hub** - WebSocket coordination hub for validators
- **apps/validator** - Distributed validator agents that perform uptime checks
- **packages/db** - Shared Prisma database client
- **packages/common** - Shared types for WebSocket messages

## Getting Started

### 1. Install dependencies

```bash
bun install
```

### 2. Set up database

Create a PostgreSQL database, then update the `.env` file:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/uptime"
```

### 3. Run database migrations

```bash
cd packages/db
npx prisma migrate dev
npx prisma generate
```

### 4. Start the services

**API Server** (port 5050)
```bash
cd apps/api
bun run dev
```

**Hub** (WebSocket on port 8081)
```bash
cd apps/hub
bun run dev
```

**Validator** (connect to hub)
```bash
cd apps/validator
cp .env.example .env
# Add your Solana keypair to PRIVATE_KEY in .env
bun run dev
```

**Frontend** (port 3000)
```bash
cd apps/frontend
bun run dev
```

### 5. Access the dashboard

Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard) and add websites to monitor.

## Environment Variables

See `.env` for required configuration. Key variables:

- `DATABASE_URL` - PostgreSQL connection string
- `DISABLE_AUTH` - Set to `true` for local dev (bypasses JWT auth)
- `DEMO_USER_ID` - User ID when auth is disabled
- `PAYER_PRIVATE_KEY` - Solana keypair for validator payouts

## Development

```bash
# Build all packages
bun run build

# Lint all packages
bun run lint

# Type-check
bun run check-types
```

## How It Works

1. Users add websites via the frontend dashboard
2. The hub polls the database every 60 seconds for active websites
3. For each website, the hub broadcasts a validation request to all connected validators
4. Validators perform HTTP checks and report status + latency back
5. The hub verifies signatures and stores results in WebsiteTick records
6. Validators accumulate pending payouts in lamports
7. Payouts are processed via the `/api/v1/payout/:validatorId` endpoint

