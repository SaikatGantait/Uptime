# Quick Start Guide

This guide will get your uptime monitoring platform running locally in under 5 minutes.

## Prerequisites

- [Bun](https://bun.sh) 1.2.2+ installed
- [Node.js](https://nodejs.org) 18+ installed
- [PostgreSQL](https://www.postgresql.org/) running locally

## Step 1: Install Dependencies

```bash
cd dpin-uptime-main
bun install
```

## Step 2: Set Up Database

1. Create a PostgreSQL database:

```bash
createdb uptime
```

2. The `.env` file is already created with default settings. Update if needed:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/uptime"
```

3. Run migrations:

```bash
cd packages/db
npx prisma migrate dev
npx prisma generate
cd ../..
```

## Step 3: Start the Services

Open **4 separate terminals** and run each service:

### Terminal 1: API (port 5050)
```bash
cd apps/api
bun run dev
```

### Terminal 2: Hub (WebSocket port 8081)
```bash
cd apps/hub
bun run dev
```

### Terminal 3: Validator
```bash
cd apps/validator
cp .env.example .env
# Edit .env and add a valid PRIVATE_KEY (Solana keypair)
bun run dev
```

### Terminal 4: Frontend (port 3000)
```bash
cd apps/frontend
bun run dev
```

## Step 4: Use the Dashboard

1. Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard)
2. Click "Add Website"
3. Enter a URL (e.g., `https://google.com`)
4. Watch as validators check it every 60 seconds
5. View uptime history with 3-minute aggregated windows

## Authentication

By default, auth is disabled (`DISABLE_AUTH=true` in `.env`).

To enable Clerk authentication:
1. Sign up at [clerk.com](https://clerk.com)
2. Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` in `.env`
3. Set `DISABLE_AUTH=false` in `.env`
4. Set `JWT_PUBLIC_KEY` to your Clerk JWT public key

## Validator Payouts

Validators earn 100 lamports per successful check. Process payouts via:

```bash
curl -X POST http://localhost:5050/api/v1/payout/<validatorId>
```

Make sure `PAYER_PRIVATE_KEY` in `.env` has sufficient SOL balance.

## Troubleshooting

**Q: Build fails with Prisma errors**  
A: Run `cd packages/db && npx prisma generate`

**Q: Validator can't connect**  
A: Ensure the hub is running on port 8081

**Q: Frontend shows no websites**  
A: Check that the API is running on port 5050 and the database is seeded

**Q: "Invalid PRIVATE_KEY format"**  
A: Ensure validator `.env` has a valid Solana keypair as a JSON array of 64 bytes

## Architecture Overview

```
┌─────────────┐
│  Frontend   │  (Next.js on :3000)
│  Dashboard  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│     API     │  (Express on :5050)
│  (REST)     │
└──────┬──────┘
       │
       ▼
┌─────────────┐      WebSocket       ┌─────────────┐
│     Hub     │◄────────────────────►│  Validator  │
│  (WS:8081)  │                      │   Agents    │
└──────┬──────┘                      └─────────────┘
       │
       ▼
┌─────────────┐
│  PostgreSQL │
│  (Prisma)   │
└─────────────┘
```

## Next Steps

- Scale validators: run multiple validator instances with different keypairs
- Enable authentication: integrate Clerk for multi-user support
- Deploy: containerize with Docker or deploy to cloud platforms
- Monitor: add Prometheus/Grafana for operational metrics
- Extend: add email/SMS alerts, custom check intervals, status pages

Happy monitoring! 🚀
