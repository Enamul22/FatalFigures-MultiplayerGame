# Render + Neon hosting and safe releases

Public game: **https://fatalfigures-enamul22.onrender.com**. Application version remains **1.0.0**. Resource identities, plans, costs and actual verification are recorded in [DEPLOYMENT_RECORD.md](DEPLOYMENT_RECORD.md).

The service runs the existing Docker image containing the built React frontend and Node/Express/Socket.IO server. PostgreSQL is a dedicated game-only Neon project owned by Enamul. FleetCare, ServicePlan and FleetPulse must never supply credentials or share this database.

## Production configuration

Render service `fatalfigures-enamul22` / `srv-dbl25qnb9u1s738oi7q0`, Frankfurt, Free, exactly one instance, no autoscaling. Auto-Deploy is **Off**. The workspace has a **$0 pipeline spend limit** and no payment card. Do not enable automatic deploys, add replicas, buy compute/disks or change domains without review.

Privately configured on Render:

- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `PORT=10000` (the actual Render public HTTP port)
- `ORIGIN=https://fatalfigures-enamul22.onrender.com` (exact origin)
- `DATABASE_URL`: private pooled TLS Neon game connection
- `DATABASE_URL_UNPOOLED`: private direct TLS connection for the authority lease and migrations
- `FATAL_RELEASE_COMMIT`: the approved full Git commit SHA for this deployment
- `FATAL_LEASE_WAIT_MS=180000`: bounded startup wait for an operator-controlled handover

`render.yaml` records the public configuration and the commit-checking `/app/render-start.sh` entrypoint. This service was configured directly in Render; the YAML is a reproducible reference, not a second linked Blueprint or an automatic deployment pipeline. Do not create a duplicate service when applying infrastructure changes. Database URLs and release approval values are supplied through Render's environment editor. No credentials are baked into the image or prefixed with `VITE_`. Keep private operator environment files ignored and mode 0600. TLS verification must remain enabled; `sslmode=verify-full` explicitly retains node-postgres's current verification semantics.

Health/readiness path: **`/api/health`**. It returns 200 only while this process holds its direct PostgreSQL lease and can query the database. A waiting replacement does not listen for HTTP or accept Socket.IO actions. Do not replace this with a placeholder healthy response.

## Migrations

1. Verify the selected Neon project is **FatalFigures** (`withered-river-63517116`) and the database is `fatalfigures`.
2. Branch from the game production branch into an isolated validation branch. Reuse the existing `deployment-validation` branch appropriately.
3. Supply its **direct** URL privately and run `npm run migrate`. Repeat to verify idempotence; test the application against the branch and review the schema changes.
4. Only after validation, apply the same numbered migrations to the game production database using its private direct URL.

Migration 001 was tested twice on the isolated branch before first production application. The versioned runner uses a transaction and migration advisory lock. It skips recorded versions; it does not reset or truncate the database. No migrations run in Render's build or startup command. Free Render services have no pre-deploy command, so this is an explicit operator step.

## Why ordinary rolling deployments are unsafe

Render normally starts a replacement before stopping the current instance. One replica and the workspace's **Wait** overlapping-deploy policy do not change that. The original process holds an exclusive **session advisory lock**, key `82304712`, on the direct game database connection. A second writer must not steal it.

The hosted startup waits only for the specific ownership-contention error, up to `FATAL_LEASE_WAIT_MS` (maximum accepted value 300000ms). Other errors fail normally; default local behavior remains immediate refusal. Failed attempts close their unused pools. The original advisory lock and transaction-level `lease_id` fencing are unchanged.

A replacement never becomes HTTP-ready merely because it is waiting. After the old session is deliberately stopped, the replacement acquires the original exclusive lock, updates the fenced authority row and only then starts HTTP. Old in-flight transactions serialize against that row. The old process marks itself unhealthy on lease loss, disconnects sockets, and cannot acknowledge or commit further actions; even a worker that misses the connection event is rejected by fencing.

The Docker Command also refuses to run a build whose `RENDER_GIT_COMMIT` differs from the approved `FATAL_RELEASE_COMMIT`. A mismatched or unapproved build stays parked without connecting to the game database. This checks the **replacement's identity**. It is not a way to change the already-running instance's environment.

## Updating to a new commit

Use a quiet maintenance window. A gap over 10 seconds or crossing the current stage deadline records active matches as **Interrupted**. Completed history remains intact. Never promise a zero-downtime update for this single-authority game.

1. Push the reviewed commit and wait for **its CI** to pass. Review migrations on the isolated Neon branch first, if present.
2. From a trusted local terminal, load the private direct game URL from an ignored environment file. Run a **dry run** to record the current authority PID:

   ```sh
   npx tsx --env-file=/secure/fatalfigures-production.env \
     scripts/handover-authority.ts \
     --expected-host=ep-winter-base-baq1v1cu.c-8.eu-central-1.aws.neon.tech
   ```

   This helper requires the exact reviewed host and `fatalfigures` database. It checks the lock in the **current database**, owned by the current role, and changes no rows.

3. In Render → Environment, set `FATAL_RELEASE_COMMIT` to the reviewed **full SHA** and retain `FATAL_LEASE_WAIT_MS=180000`. Choose **Save only**, wait for saving to finish, and reveal this nonsecret SHA to verify the saved value matches. Render loads existing masked values asynchronously; verify the persisted value before deploying. Do not alter database URLs or origin for an ordinary code update.
4. Choose **Manual Deploy → Deploy a specific commit**, supplying that same full SHA. Keep Auto-Deploy Off. Select the actual replacement deploy and wait until its fresh logs say:

   ```text
   Waiting for previous game authority to stop; HTTP readiness remains unavailable.
   ```

5. While that replacement is waiting, deliberately stop **only the previously recorded authority session**:

   ```sh
   npx tsx --env-file=/secure/fatalfigures-production.env \
     scripts/handover-authority.ts \
     --expected-host=ep-winter-base-baq1v1cu.c-8.eu-central-1.aws.neon.tech \
     --expected-pid=PID_FROM_THE_PRE_DEPLOY_DRY_RUN --terminate
   ```

   The helper refuses if the owner PID changed, if there is not exactly one game lease, if the endpoint is pooled, or if the host/database is wrong. Do not substitute a broad `pg_terminate_backend` query or kill all database sessions. It issues no DDL/DML and does not alter saved game records. Do not repeat termination against a newly acquired replacement PID.

6. Watch the replacement acquire ownership and become **Live**. Verify its deployed commit, `/api/health`, real friend-room reconnect/receipt, completed history and replay. Check that the old instance is unhealthy/draining and eventually stops. Never report success from a deployment-trigger response alone.

If the bounded wait expires before step 5, the replacement fails and the current authority remains protected. Inspect its actual state and retry the manual release; never bypass the ownership check. If the replacement fails **after** the old session is stopped, restore the last successful deployment with the controlled restart below, then investigate. Rollbacks to versions that predate the bounded startup helper require separate review; don't use an ordinary rolling rollback to those builds.

## Restarting the same deployed commit

For a controlled restart without changing code or environment:

1. Render → Settings → **Suspend Web Service**; confirm the exact game service.
2. Verify HTTP is unavailable and the old direct ownership lease is released. A read-only Neon check is:

   ```sql
   SELECT count(*) AS lease_holders
   FROM pg_locks
   WHERE locktype = 'advisory'
     AND classid = 0 AND objid = 82304712 AND granted
     AND database = (SELECT oid FROM pg_database WHERE datname = current_database());
   ```

   Run it on the dedicated game's production database. Require zero before resuming.

3. Click **Resume Web Service**. Wait for `/api/health` and verify saved history.

**Observed Render behavior:** Resume uses the previous successful build and its previous deployment configuration; it does not fetch new commits or apply staged start-command/environment changes. Use the fenced new-commit procedure above for updates. Do not use **Manual Deploy → Restart service** as a substitute for stopping the old authority first.

## Verification and limits

The local fixture suite checks original rules/scoring, privacy, PostgreSQL durability, SIGKILL recovery and multiplayer browser flows. Added tests execute the actual Render commit guard and test bounded startup refusal, termination of exactly the old lease backend, durable data and rejection of stale writes after handover. Public verification uses production clocks and independent browser contexts; see the deployment record for the actual results and screenshots.

Render Free may sleep after 15 minutes without incoming HTTP/WebSocket traffic and may restart at any time. Cold starts can take about a minute. Neon stores history independently of Render's ephemeral filesystem. The open lease and regular heartbeat keep Neon compute active while the server runs: at 0.25 CU, its 100 CU-hour Free allowance provides about 400 running hours monthly across the project's computes, not a full 24/7 month. Monitor quotas. No uptime pingers, paid upgrades or purchases were added.

Source references: [Render deploys](https://render.com/docs/deploys), [health checks](https://render.com/docs/health-checks), [Free limits](https://render.com/docs/free), [Neon plans](https://neon.com/docs/introduction/plans). Hosting tests do not establish load capacity, a physical-device audio/keyboard guarantee, production-grade availability or a full anti-cheat guarantee.
