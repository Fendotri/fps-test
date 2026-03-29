# Cube Strike Backend (Multiplayer-Ready Foundation)

This backend is designed as a base for persistent progression and future real-time multiplayer.

## Features

- Account system (`register`, `login`, `me`) with signed access tokens.
- Persistent user data (wallet, inventory, equipped cosmetics, stats).
- Shop and case opening endpoints.
- FFA stats reporting (`kills`, `wins`, `deaths`) with rewards.
- Leaderboard service (`daily`, `weekly`, `all`) for `kills` and `wins`.
- WebSocket gateway scaffold for room join + state broadcast (`/ws`).

## Run

```bash
npm run backend:start
```

Server default URL:

```text
http://localhost:8787
```

## Environment

Create env values (optional):

- `BACKEND_HOST` default: `0.0.0.0`
- `BACKEND_PORT` default: `8787`
- `CORS_ORIGIN` default: `http://localhost:5173` (`*` or comma-separated list supported)
- `AUTH_SECRET` default: `change-me-in-production`
- `ADMIN_API_KEY` default: empty/disabled. Required for Content Studio backend save/load and asset uploads.
- `TOKEN_TTL_SECONDS` default: `1209600` (14 days)
- `WS_TICK_RATE` default: `20`
- `DATA_FILE` default: `backend/data/db.json`

The backend now auto-loads environment values from `backend/.env` if present.

## API Overview

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/profile`
- `GET /api/shop/offers`
- `POST /api/shop/purchase`
- `GET /api/inventory`
- `POST /api/inventory/open-case`
- `POST /api/inventory/equip`
- `GET /api/leaderboard?period=daily|weekly|all&metric=kills|wins&limit=20`
- `POST /api/matches/ffa/report`
- `GET /api/multiplayer/bootstrap`
- `WS /ws` (Bearer token in header or `?token=...`)

## Multiplayer Roadmap Integration

The current websocket implementation is intentionally minimal and ready to evolve:

1. Server-authoritative movement simulation.
2. Matchmaking and dedicated room allocation.
3. Anti-cheat validation pipeline for input and hit events.
4. Snapshot delta compression and rewind/interpolation.
5. Persistent match history and ranked queues.
