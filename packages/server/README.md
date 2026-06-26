# pi Cloud Coding Agent — Server

Hono HTTP/WS API server for the pi cloud coding agent. See the [root README](../../README.md) for an overview.

## Configuration

All settings via environment variables (see `src/config.ts`):

| Variable | Default | Description |
|----------|---------|-------------|
| `PI_PORT` | `3000` | HTTP listen port |
| `PI_HOST` | `0.0.0.0` | Listen address |
| `PI_DATABASE_URL` | — | PostgreSQL connection string (required) |
| `PI_API_KEY` | — | API key for auth (unset = disabled) |
| `PI_CWD` | `process.cwd()` | Default workspace for agent sessions |
| `PI_MODEL` | — | Default model (`provider/modelId`) |
| `PI_WEB_ROOT` | — | Path to built web UI for static serving |
| `PI_MISSION_TIMEOUT_MS` | `600000` | Per-mission timeout |
| `PI_MAX_ACTIVE_SESSIONS` | `50` | Max in-memory sessions before idle eviction |
| `PI_SESSION_IDLE_TIMEOUT_MS` | `1800000` | Idle session eviction timeout |

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Healthcheck |
| `GET` | `/api/models` | List available models |
| `POST` | `/api/sessions` | Create session `{ model?, cwd? }` |
| `GET` | `/api/sessions` | List sessions |
| `GET` | `/api/sessions/:id` | Get session detail |
| `DELETE` | `/api/sessions/:id` | Delete session |
| `POST` | `/api/sessions/:id/fork` | Fork session |
| `POST` | `/api/missions` | Submit mission `{ prompt, sessionId?, model? }` |
| `GET` | `/api/missions` | List missions |
| `GET` | `/api/missions/:id` | Get mission detail |
| `DELETE` | `/api/missions/:id` | Cancel/delete mission |

WebSocket at `/ws?sessionId=X&apiKey=Y` for real-time interaction.

## Database

Migrations are applied automatically on startup via Drizzle ORM. To generate new migrations:

```bash
npm run db:generate
```
