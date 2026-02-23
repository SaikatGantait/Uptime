# hub

WebSocket coordination hub that orchestrates validators and website checks.

## Features

- Accepts validator registrations via WebSocket
- Verifies validator signatures using Solana keypair authentication
- Broadcasts website validation requests every 60 seconds
- Receives and stores uptime check results
- Increments validator pending payouts

## Running

```bash
bun run dev     # Development with hot reload
bun run start   # Production
```

The hub listens on WebSocket port **8081**.

## Message Protocol

See `packages/common/index.ts` for message type definitions.

### Validator → Hub (Signup)

```json
{
  "type": "signup",
  "data": {
    "callbackId": "uuid",
    "ip": "127.0.0.1",
    "publicKey": "...",
    "signedMessage": "..."
  }
}
```

### Hub → Validator (Validate Request)

```json
{
  "type": "validate",
  "data": {
    "callbackId": "uuid",
    "url": "https://example.com",
    "websiteId": "uuid"
  }
}
```

### Validator → Hub (Validate Response)

```json
{
  "type": "validate",
  "data": {
    "callbackId": "uuid",
    "status": "Good",
    "latency": 123.45,
    "websiteId": "uuid",
    "validatorId": "uuid",
    "signedMessage": "..."
  }
}
```

