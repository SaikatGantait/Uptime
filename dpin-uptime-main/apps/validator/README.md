# validator

Distributed validator agent that performs website uptime checks.

## Setup

1. Copy the example environment file:

```bash
cp .env.example .env
```

2. Set `PRIVATE_KEY` to your Solana keypair secret key (JSON array of 64 bytes):

```bash
PRIVATE_KEY="[0,1,2,...,63]"
```

You can generate a keypair using:

```bash
solana-keygen new --outfile validator-keypair.json
```

Then convert it to the required format.

## Running

```bash
bun run dev     # Development with hot reload
bun run start   # Production
```

The validator connects to the hub WebSocket at `ws://localhost:8081`.

## How It Works

1. On startup, signs a message with its keypair and registers with the hub
2. Listens for `validate` messages from the hub
3. Performs HTTP GET requests to the target URL
4. Measures latency and determines status (Good/Bad)
5. Signs the response and sends it back to the hub
6. Accumulates pending payouts for successful validations

## Payouts

Validators earn **100 lamports** per successful validation. Payouts are processed by calling:

```
POST http://localhost:5050/api/v1/payout/:validatorId
```

