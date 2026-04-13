# Excalidraw Atelier

A self-hosted Excalidraw workspace with authentication, realtime collaboration, and a distinctive editorial design language. Built for small teams who want a private whiteboard tool they fully control.

## What you get

- **Admin-provisioned accounts** — no public signup, email/password auth with self-service password change
- **Autosave to MongoDB** — 1s debounce, content-aware change detection, WAL-backed crash recovery
- **Realtime collaboration** — Socket.IO WebSocket transport, cursor presence, element reconciliation
- **Offline resilience** — exponential backoff retries, localStorage WAL, network status detection
- **Sharing** — per-user viewer/editor grants, ownership transfer, email autocomplete
- **Organization** — folders (with drag-and-drop), tags, stars, search, sort
- **Bulk operations** — multi-select cards, batch move/tag/share/delete
- **Snapshot versioning** — 5-minute throttled snapshots, 5-version cap, restore from history
- **Soft-delete trash** — 30-day auto-prune
- **Storage quotas** — per-user limits (default 500 MB), admin-overridable, QuotaBar + stats dashboard
- **Templates** — server-managed, auto-seeded Kanban + Class Diagram, admin CRUD
- **Libraries** — per-user `.excalidrawlib` upload
- **Admin panel** — user management, template management, all-scenes list, app-wide storage stats
- **Export** — `.excalidraw`, PNG, SVG with watermark
- **Fun features** — brainstorm board, weekly leaderboard, achievement badges, tamagotchi pets, activity log, drawing streaks, konami code easter egg

## Architecture

```
         +----------------+
         |  Reverse proxy |
         | (nginx/openresty/etc)
         +----+-------+---+
              |       |
       /      |       |  /api + ws
              v       v
   +----------+-+  +--+---------+
   |  frontend  |  |  backend   |
   | nginx:alpine| | node:20    |
   |  Vite SPA  |  | Express +  |
   +-------------+ | Socket.IO  |
                    +------+-----+
                           |
                           v
                  +--------+--------+
                  |    MongoDB 7    |
                  | (replica set or |
                  |   standalone)   |
                  +-----------------+
```

## Quick start

### Prerequisites

- Docker and Docker Compose

### Run the full stack

```bash
docker compose up --build
```

- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:4100
- **Mongo**: internal to the docker network

### Seed users

There is no public signup. Create accounts via the admin CLI:

```bash
docker compose exec backend node dist/scripts/createUser.js alice@team.com pw "Alice"
docker compose exec backend node dist/scripts/createUser.js bob@team.com   pw "Bob"
docker compose exec backend node dist/scripts/createUser.js carol@team.com pw "Carol"
```

`alice@team.com` is the admin in local dev (set via `ADMIN_EMAILS` in `docker-compose.yml`). Log in at http://localhost:5173.

Templates (Kanban Board, Class Diagram) are auto-seeded on first boot.

### Running individually

Backend (hot reload):

```bash
cd backend && npm install
MONGO_URI=mongodb://localhost:27017/excalidraw \
JWT_SECRET=devsecret \
ADMIN_EMAILS=alice@team.com \
ENABLE_COLLAB=true \
npm run dev
```

Frontend (Vite dev server, proxies `/api` to localhost:4000):

```bash
cd frontend && npm install && npm run dev
```

## Environment variables

### Backend

| Variable          | Required | Default   | Description                                          |
| ----------------- | -------- | --------- | ---------------------------------------------------- |
| `MONGO_URI`       | one of   | —         | Full Mongo connection string (local dev)             |
| `DB_USERNAME`     | one of   | —         | Mongo username (production)                          |
| `DB_PASSWORD`     | one of   | —         | Mongo password                                       |
| `DB_HOST`         | no       | —         | Mongo hostname                                       |
| `DB_NAME`         | no       | `excalidraw` | Database name                                     |
| `JWT_SECRET`      | yes      | —         | Secret for signing JWTs (`openssl rand -hex 32`)     |
| `ADMIN_EMAILS`    | no       | `""`      | Comma-separated emails granted admin access          |
| `PORT`            | no       | `4000`    | HTTP port                                            |
| `FRONTEND_ORIGIN` | no       | `*`       | CORS origin                                          |
| `ENABLE_COLLAB`   | no       | `"false"` | Set `"true"` to enable realtime collaboration        |
| `NODE_ENV`        | no       | `production` | Standard Node env flag                            |

Supports two Mongo connection modes: a full `MONGO_URI`, or `DB_USERNAME` + `DB_PASSWORD` + `DB_HOST` (the URI is composed at runtime). Either works; one must be present.

### Frontend

| Variable             | Required | Default   | Description                                        |
| -------------------- | -------- | --------- | -------------------------------------------------- |
| `VITE_API_URL`       | no       | `""`      | Backend API base URL (empty = relative `/api/*`)   |
| `VITE_ENABLE_COLLAB` | no       | `"false"` | Set `"true"` to enable the collaboration UI        |

`VITE_API_URL` is baked in at build time. For production behind a reverse proxy, leave it empty so requests hit `/api/*` on the same origin.

## Deploying to Kubernetes

Example Kubernetes manifests and GitHub Actions workflows are provided in `infra/` and `.github/workflows/` (`.example` files). To use them:

1. Copy the `.example` files and remove the extension
2. Update hostnames, image registry, and namespace to match your environment
3. Create the backend secret:

```bash
kubectl create secret generic excalidraw-backend-secret \
  --from-literal=DB_USERNAME=your-db-user \
  --from-literal=DB_PASSWORD=your-db-password \
  --from-literal=JWT_SECRET=$(openssl rand -hex 32) \
  --from-literal=ADMIN_EMAILS=admin@example.com
```

4. Configure your reverse proxy to route traffic to the frontend and backend services
5. Seed your first admin user:

```bash
kubectl exec deploy/excalidraw-backend -- \
  node dist/scripts/createUser.js admin@example.com '<password>' "Admin"
```

## Smoke tests

277 assertions across 4 test suites (features, collab, resilience, save):

```bash
docker compose up -d --build --wait
# seed test users first (see above)
node smoke-tests/run-all.mjs
```

CI runs these on every push via `.github/workflows/smoke-tests.yml`.

## Design language

The UI follows an **Editorial Atelier** aesthetic — cream paper backgrounds, serif italic headings (Instrument Serif), hairline rules instead of shadows, square corners, and restrained use of accent colors. The palette, typography, and motifs are defined in `frontend/tailwind.config.js`.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl + K` or `/` | Focus search |
| `Cmd/Ctrl + N` | New document |
| `Cmd/Ctrl + A` | Select all visible (home) |
| `Delete` / `Cmd+Backspace` | Delete selected |
| `g h` | Go home |
| `g t` | Go to trash |
| `g a` | Go to admin |
| `?` | Shortcut help |
| `Esc` | Close modal |

## Tech stack

- **Backend**: Node 20, Express, TypeScript, Mongoose 8, Socket.IO 4
- **Frontend**: Vite 5, React 18, TypeScript, Tailwind 3, Excalidraw 0.17.6
- **Database**: MongoDB 7
- **Containers**: Docker Compose (dev), Kubernetes (prod)

## License

MIT
