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

### Requirements

- Ubuntu 20.04 or later
- Root access (`sudo`)
- Internet connection (installer downloads Docker, Nginx, Certbot, Node.js)

### Steps

**1. Clone the repository**

```bash
git clone https://github.com/ezzdin-atef/infra-panel
cd infra-panel
```

**2. Run the installer**

```bash
sudo bash scripts/install.sh
```

The installer will:

- Install Docker (CE), Nginx, Certbot (snap), UFW, and PostgreSQL client
- Create `/opt/infra-panel`, `/var/backups/infra-panel`, `/var/lib/infra-panel`
- Generate `/opt/infra-panel/.env` with random `JWT_SECRET`, DB password, and Redis password
- Pre-configure UFW to allow ports 22, 80, and 443
- Install Node.js (via nvm) and pnpm if not already present
- Build the monorepo and register `infra-panel-api` / `infra-panel-web` as systemd services

**3. Review the generated `.env`**

The installer writes `/opt/infra-panel/.env` with auto-generated credentials. Open it and note the `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, and `DATABASE_URL` values — they must be consistent with each other.

```bash
cat /opt/infra-panel/.env
```

Also add the three Postgres vars that Docker Compose needs (copy the values from `DATABASE_URL`):

```bash
# Append to /opt/infra-panel/.env
POSTGRES_USER=infrapanel
POSTGRES_PASSWORD=<generated-password>
POSTGRES_DB=infrapanel
```

**4. Start the database**

```bash
cd /opt/infra-panel
docker compose up postgres redis -d

# Wait until postgres is healthy
docker compose ps postgres
```

**5. Apply the database schema**

Run this once on a fresh install to create all tables:

```bash
cd /opt/infra-panel
pnpm db:generate
pnpm db:migrate
```

**6. Start the panel services**

```bash
systemctl start infra-panel-api infra-panel-web
```

**7. Open the setup wizard**

Navigate to `http://<your-server-ip>:3000/setup` and create your admin account.

> The setup wizard is only available on the first launch. Once an admin account exists it is permanently disabled.

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
- Docker (for PostgreSQL and Redis)

### Steps

**1. Install dependencies**

```bash
pnpm install
```

**2. Configure environment variables**

```bash
cp .env.example .env
```

The defaults in `.env.example` match the Docker Compose services and require no changes for local development.

**3. Start PostgreSQL and Redis**

```bash
docker compose up postgres redis -d
```

**4. Apply the database schema**

Run once after cloning, and again after any schema change:

```bash
pnpm db:generate
pnpm db:migrate
```

**5. Start all apps**

```bash
pnpm dev
```

This starts:
- API at `http://localhost:3001` (Fastify, tsx watch)
- Web at `http://localhost:3000` (Next.js dev server)
- Worker (BullMQ)

**6. Open the setup wizard**

Visit `http://localhost:3000/setup` to create the first admin account.

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | Full PostgreSQL connection string |
| `POSTGRES_USER` | Yes | `infra` | PostgreSQL username (must match `DATABASE_URL`) |
| `POSTGRES_PASSWORD` | Yes | `infra` | PostgreSQL password (must match `DATABASE_URL`) |
| `POSTGRES_DB` | Yes | `infra_panel` | PostgreSQL database name (must match `DATABASE_URL`) |
| `REDIS_URL` | Yes | — | Redis connection string |
| `REDIS_PASSWORD` | No | — | Redis password (leave empty for no auth) |
| `JWT_SECRET` | Yes | — | Secret for signing JWTs (min 32 chars) |
| `JWT_ACCESS_EXPIRES_IN` | No | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | No | `7d` | Refresh token lifetime |
| `API_PORT` | No | `3001` | Port the Fastify server listens on |
| `API_HOST` | No | `0.0.0.0` | Host the Fastify server binds to |
| `CORS_ORIGIN` | No | `http://localhost:3000` | Allowed CORS origin |
| `NEXT_PUBLIC_API_URL` | Yes | — | API base URL used by the web app |
| `NGINX_SITES_DIR` | No | `/etc/nginx/sites-available/infra-panel` | Where Nginx config files are written |
| `BACKUP_DIR` | No | `/var/backups/infra-panel` | Where pg_dump backup files are stored |

> `DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` must all refer to the same credentials. Docker Compose uses the `POSTGRES_*` vars to initialize the container; the API uses `DATABASE_URL` to connect.

---

## Database Commands

```bash
# Generate SQL migration files from the current schema (run after schema changes)
pnpm db:generate

# Apply pending migrations to the database
pnpm db:migrate

# Push schema directly without migration files (dev only — skips migration history)
pnpm db:push

# Open Drizzle Studio (browser GUI for the database)
pnpm db:studio
```

---

## Running Tests

Unit tests use Node's built-in `node:test` runner.

```bash
cd apps/api
pnpm test
```

Tests cover: AES-256-GCM crypto roundtrip, backup schedule computation, UFW SSH port detection, and audit error-swallowing behavior.

End-to-end tests use Playwright:

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

## Full Docker Compose Stack

To run everything — including the API, worker, and web — in containers:

```bash
cp .env.example .env   # configure credentials first
docker compose up --build
```

Then apply migrations once the postgres container is healthy:

```bash
pnpm db:generate
pnpm db:migrate
```

The compose file mounts `/var/run/docker.sock` into `api` and `worker` so they can manage host Docker resources.

---

## Troubleshooting

**`pnpm db:migrate` fails with "password authentication failed"**

The `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` vars in `.env` must match the credentials in `DATABASE_URL`. If the postgres container was already created with different credentials, tear it down and recreate it:

```bash
docker compose down postgres
docker volume rm infra-panel_postgres_data
docker compose up postgres -d
pnpm db:generate
pnpm db:migrate
```

**`pnpm db:migrate` fails with "Can't find meta/_journal.json"**

Migration files haven't been generated yet. Run `pnpm db:generate` first, then `pnpm db:migrate`.

**API health check fails after install**

```bash
journalctl -u infra-panel-api -n 50
```

Common causes: postgres container not running, `.env` missing or misconfigured, port 3001 blocked by UFW.

**Nginx reload errors**

The panel runs `nginx -t` before applying any config change. If validation fails the previous config is automatically restored. Check `GET /api/domains/nginx/health` for the nginx status.

**Certbot not found**

```bash
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot
```

**UFW rules not applying**

```bash
sudo ufw status
```

The panel rejects deny rules for port 22 to prevent SSH lockout.
