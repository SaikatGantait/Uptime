# api

Express backend REST API for the uptime monitoring platform.

## Features

- Website CRUD operations (create, list, disable)
- Website status and tick retrieval
- Validator payout processing via Solana
- JWT authentication (optional)

## Running

```bash
bun run dev     # Development with hot reload
bun run start   # Production
```

The API listens on port **5050** (configurable via `PORT` env var).

## Environment Variables

Required:
- `DATABASE_URL` - PostgreSQL connection string
- `PAYER_PRIVATE_KEY` - Solana keypair for payouts (JSON array format)

Optional:
- `PORT` - Server port (default: 5050)
- `DISABLE_AUTH` - Set to `true` to bypass JWT verification (dev only)
- `DEMO_USER_ID` - User ID when auth is disabled
- `JWT_PUBLIC_KEY` - RSA public key for JWT verification

## API Endpoints

### `POST /api/v1/website`
Create a new website to monitor. Requires auth.

**Body:** `{ "url": "https://example.com" }`

### `GET /api/v1/websites`
List all websites for the authenticated user.

### `GET /api/v1/website/status?websiteId=<id>`
Get status and tick history for a specific website.

### `DELETE /api/v1/website`
Disable a website (soft delete).

**Body:** `{ "websiteId": "uuid" }`

### `POST /api/v1/payout/:validatorId`
Process pending payouts for a validator. Transfers lamports via Solana and resets `pendingPayouts` to 0.

