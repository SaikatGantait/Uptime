# db

Shared Prisma database client for the uptime monitoring platform.

## Usage

This package is referenced by other apps via workspace imports:

```typescript
import { prismaClient } from "db/client";
```

## Database Schema

- **User** - Platform users
- **Website** - Monitored websites
- **Validator** - Registered validator nodes
- **WebsiteTick** - Individual uptime check results

## Setup

1. Set `DATABASE_URL` in the root `.env` file
2. Run migrations:

```bash
cd packages/db
npx prisma migrate dev
npx prisma generate
```

## Adding Migrations

```bash
npx prisma migrate dev --name description_of_change
```

## Seeding

```bash
npx prisma db seed
```

