# infra-panel

A self-hosted server management panel for Ubuntu servers. Manage Docker containers, Nginx domains, SSL certificates, PostgreSQL databases, firewall rules, backups, and more from a single web UI.

## Features

- **Docker** — list, start, stop, restart, inspect containers; manage images, networks, and volumes
- **Applications** — deploy Docker-based apps with ports, env vars, and restart policies
- **Domains & Nginx** — generate and reload Nginx configs for your apps
- **SSL** — issue and renew Let's Encrypt certificates via Certbot
- **PostgreSQL** — manage database servers, databases, users, and permissions
- **Backups** — scheduled and manual pg_dump backups with retention and restore
- **Firewall** — manage UFW rules (allow/deny ports and IPs) with SSH lockout protection
- **Audit logs** — filterable activity history for all panel actions
- **Settings** — change password, view active sessions, run system health checks

## Architecture

```
infra-panel/
  apps/
    api/      Fastify 5 REST API
    web/      Next.js 15 App Router (Tailwind CSS v4)
    worker/   BullMQ background worker
  packages/
    database/ Drizzle ORM schema + migrations (PostgreSQL 16)
    config/   Zod-validated environment config
    shared/   JWT helpers, bcrypt, AES-256-GCM crypto
    types/    Shared TypeScript types
```

Backing services: **PostgreSQL 16**, **Redis 7** (BullMQ queues).

---

## Production Installation (Ubuntu)

The installer handles all dependencies, builds the panel, and registers systemd services.

### Requirements

- Ubuntu 20.04 or later
- Root access (`sudo`)
- Internet connection (installer downloads Docker, Nginx, Certbot, Node.js)

### Steps

**1. Clone the repository**

```bash
git clone https://github.com/your-org/infra-panel.git
cd infra-panel
```

**2. Run the installer**

```bash
sudo bash scripts/install.sh
```

The installer will:

- Install Docker (CE), Nginx, Certbot (snap), UFW, and PostgreSQL client
- Create `/opt/infra-panel`, `/var/backups/infra-panel`, `/var/lib/infra-panel`
- Generate a `/opt/infra-panel/.env` with random `JWT_SECRET`, DB password, and Redis password
- Pre-configure UFW to allow ports 22, 80, and 443
- Install Node.js (via nvm) and pnpm if not already present
- Build the monorepo (`pnpm install && pnpm build`)
- Register and start `infra-panel-api` and `infra-panel-web` as systemd services
- Verify the API health endpoint and web UI

**3. Run the database migration**

```bash
cd /opt/infra-panel
pnpm db:migrate
```

**4. Open the setup wizard**

Navigate to `http://<your-server-ip>:3000/setup` and create your admin account.

> The setup wizard is only available on the first launch. Once an admin exists it is permanently disabled.

### Default ports

| Service | Port |
|---------|------|
| Web UI  | 3000 |
| API     | 3001 |

### Systemd commands

```bash
# View status
systemctl status infra-panel-api
systemctl status infra-panel-web

# Restart
systemctl restart infra-panel-api infra-panel-web

# View logs
journalctl -u infra-panel-api -n 100 -f
journalctl -u infra-panel-web  -n 100 -f
```

---

## Local Development

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- Docker (for PostgreSQL and Redis via Docker Compose)

### Steps

**1. Install dependencies**

```bash
pnpm install
```

**2. Copy and configure environment variables**

```bash
cp .env.example .env
```

Edit `.env` as needed. The defaults work with the Docker Compose services below.

```env
# Database
DATABASE_URL=postgres://infra:infra@localhost:5432/infra_panel

# Redis
REDIS_URL=redis://localhost:6379

# JWT (change in production — must be at least 32 characters)
JWT_SECRET=change-me-in-production-at-least-32-chars
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# API
API_PORT=3001
API_HOST=0.0.0.0
CORS_ORIGIN=http://localhost:3000

# Web
NEXT_PUBLIC_API_URL=http://localhost:3001
```

**3. Start PostgreSQL and Redis**

```bash
docker compose up postgres redis -d
```

**4. Apply the database schema**

```bash
pnpm db:push
```

**5. Start all apps in development mode**

```bash
pnpm dev
```

This starts:
- `apps/api` on `http://localhost:3001` (tsx watch)
- `apps/web` on `http://localhost:3000` (Next.js dev server)
- `apps/worker` (BullMQ worker)

**6. Open the setup wizard**

Visit `http://localhost:3000/setup` to create the first admin account.

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `REDIS_URL` | Yes | — | Redis connection string |
| `JWT_SECRET` | Yes | — | Secret for signing JWTs (min 32 chars) |
| `JWT_ACCESS_EXPIRES_IN` | No | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | No | `7d` | Refresh token lifetime |
| `API_PORT` | No | `3001` | Port the Fastify server listens on |
| `API_HOST` | No | `0.0.0.0` | Host the Fastify server binds to |
| `CORS_ORIGIN` | No | `http://localhost:3000` | Allowed CORS origin |
| `NEXT_PUBLIC_API_URL` | Yes | — | API base URL used by the web app |
| `NGINX_SITES_DIR` | No | `/etc/nginx/sites-available/infra-panel` | Where Nginx config files are written |
| `BACKUP_DIR` | No | `/var/backups/infra-panel` | Where pg_dump backup files are stored |

---

## Database Commands

```bash
# Push schema changes (dev — no migration files)
pnpm db:push

# Generate + apply a migration (production-safe)
pnpm db:migrate

# Open Drizzle Studio (GUI for the database)
pnpm db:studio
```

---

## Running Tests

Unit tests use Node's built-in `node:test` runner — no extra packages required.

```bash
# Run API unit tests
cd apps/api
pnpm test
```

Tests cover: AES-256-GCM crypto roundtrip, backup schedule computation, UFW SSH port detection, and audit error-swallowing behavior.

End-to-end tests use Playwright (`apps/web/e2e/`):

```bash
cd apps/web
pnpm exec playwright test
```

---

## Building for Production

```bash
pnpm build
```

Outputs:
- `apps/api/dist/` — compiled Fastify server
- `apps/web/.next/` — Next.js build (standalone output)

---

## Docker Compose (full stack)

To run the entire stack in containers (including api, worker, and web):

```bash
docker compose up --build
```

The compose file mounts `/var/run/docker.sock` into `api` and `worker` so they can manage host Docker resources.

---

## Troubleshooting

**API health check fails after install**

```bash
journalctl -u infra-panel-api -n 50
```

Common causes: missing `.env`, database not migrated, port 3001 blocked.

**Nginx reload errors**

The panel runs `nginx -t` before applying any config. If validation fails the old config is automatically restored. Check `GET /api/domains/nginx/health` for the nginx version.

**Certbot not found**

Install certbot manually:

```bash
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot
```

**UFW rules not applying**

Ensure UFW is enabled: `sudo ufw status`. The panel rejects deny rules for port 22 to prevent SSH lockout.
