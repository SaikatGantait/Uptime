# common

Shared TypeScript types for WebSocket messages between hub and validators.

## Usage

```typescript
import type { IncomingMessage, OutgoingMessage } from "common/types";
```

## Message Types

### Hub-side (IncomingMessage)
Messages received by the hub from validators:
- `SignupIncomingMessage` - Validator registration
- `ValidateIncomingMessage` - Validation results

### Validator-side (OutgoingMessage)
Messages sent by the hub to validators:
- `SignupOutgoingMessage` - Registration confirmation
- `ValidateOutgoingMessage` - Validation request

All messages are signed with Solana keypairs for authenticity verification.

