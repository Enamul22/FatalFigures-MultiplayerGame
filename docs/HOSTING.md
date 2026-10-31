# Manual hosting handoff — not deployed

This game needs a reachable, long-running **Node server with WebSockets** and
PostgreSQL. A static frontend or Streamlit deployment is insufficient. Enamul
reviews and deploys manually. No hosting account, paid plan, cloud secret or
existing app database was modified for this implementation.

## Database isolation

For local development, `npm run db:local` starts persistent real PostgreSQL 18.
Alternatively `docker compose up -d db` uses the same loopback port 5544. Do not
run both. Copy `.env.example` when using Docker; embedded setup writes `.env`
only when absent. Never copy FleetCare or ServicePlan credentials.

For hosted play, create a **dedicated game database and role**, preferably in a
separate game-only Neon Free project/branch owned by **Enamul22 / Enamul Haque**.
Check the Free quota in your account before provisioning. No paid upgrade is
needed by the application. Test migrations on an isolated development branch
before applying to the reviewed game target. The application uses only
`fatalfigures.*`, but a dedicated database/role adds a clear permission boundary.
Do not point any command here at an existing portfolio database.

Configuration, supplied privately to the server:

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
ORIGIN=https://your-reviewed-game-domain.example
DATABASE_URL=postgresql://GAME_ROLE:PRIVATE_PASSWORD@GAME_POOLER/GAME_DB?sslmode=require
DATABASE_URL_UNPOOLED=postgresql://GAME_ROLE:PRIVATE_PASSWORD@GAME_DIRECT/GAME_DB?sslmode=require
```

Use the provider’s real full URLs, not the placeholders. Pooled TLS URL for the
application pool; direct TLS URL for migrations and the server ownership lease.
Do not disable certificate checks. The app uses node-postgres’s normal TLS URL
handling. Keep `.env` ignored and do not prefix secrets with `VITE_`.

Run `npm run migrate` from a trusted development environment against the isolated
game development URL first. The versioned migration runner holds a migration
advisory lock and wraps unapplied numbered SQL files in one transaction. On later
runs it skips recorded versions. This release has only migration 001. No destructive
reset, schema dropping or data migration from another project occurs.

## Container path

Build and run only after review:

```sh
docker build -t fatalfigures:1.0.0 .
# Start your game-only database; for local compose:
docker compose up -d db
# Use your reviewed production ORIGIN in the environment/.env.
docker compose --profile game run --rm game node dist/server/migrate.js
docker compose --profile game up -d game
```

The production image contains Node 24, compiled shared/server code, built frontend,
versioned migrations and production dependencies. It runs as the `node` user.
Database initialization is an explicit one-shot step, not a hidden startup mutation.
For managed PostgreSQL, inject the URLs into a single container using the host’s
secret manager; do not use the local compose database credentials on the internet.

Set up a TLS reverse proxy to port 3000, support HTTP upgrades and keep the socket
connection open. Set `ORIGIN` to the exact public scheme/host/port. Do not accept
arbitrary browser origins. `/api/health` returns 200 only while the process retains
its direct database authority; use it for readiness and a restart policy.

**Exactly one replica per game database.** Disable autoscaling and overlapping
rolling starts; stop the old server before starting the new one. A second server
will refuse the advisory lease. The default in-memory Socket.IO adapter is used
for fan-out only within that one authority. Horizontal routing, sticky sessions or
reconnecting into arbitrary instances are not supported. This is why the default
is a container-oriented long-running process. There is no optional Vercel path or
blanket claim about its current WebSocket capabilities.

## Release and restart review

- Run build, PostgreSQL tests, process restart test, seeded simulation and browsers
  on isolated fixtures. Inspect the actual remote CI for the reviewed commit.
- Choose a quiet maintenance window; a deployment gap over 10 seconds, or crossing
  an active stage deadline, marks that match Interrupted on restart. No clock reset
  or backlog of invented losses. Completed history remains.
- Back up the game-only database and set an appropriate retention policy. This
  portfolio release does not automatically erase rooms/history; room codes and
  session capabilities are access controls, not permanent user accounts.
- Confirm two remote devices can join, lock, reveal and resume against the same
  reachable Node endpoint. This local review does not assert remote network uptime.

## Local review environment evidence

Local PostgreSQL 18 and real Node processes were used for transaction, concurrency,
refresh and restart checks. Docker was unavailable on the authoring machine; the
repository CI includes a Docker image build on Ubuntu. No external Neon game
project was provisioned or live cloud persistence claim made. The three existing
portfolio databases were neither queried nor mutated by this project.

Before wider public hosting: establish backups/retention, monitor resource limits,
load-test the intended room count, and add appropriate upstream abuse controls.
No capacity/uptime, full anti-cheat or human-fun guarantee is implied by automated
rules/simulation tests.
