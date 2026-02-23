# frontend

Next.js dashboard UI for the uptime monitoring platform.

## Features

- Website management (add, view, delete)
- Real-time uptime status visualization
- 30-minute tick history with aggregated 3-minute windows
- Optional Clerk authentication
- Dark mode by default

## Running

```bash
bun run dev     # Development server (port 3000)
bun run build   # Production build
bun run start   # Production server
```

## Environment Variables

Required:
- `NEXT_PUBLIC_API_URL` - Backend API URL (default: `http://localhost:5050`)

Optional:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk authentication key (leave empty to disable auth)

## Routes

- `/` - Landing page with features and pricing
- `/dashboard` - Main dashboard for managing and monitoring websites

## Authentication

If `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is set, the app uses Clerk for authentication and passes JWT tokens to the backend.

If not set, the app runs in demo mode and the backend should have `DISABLE_AUTH=true`.

