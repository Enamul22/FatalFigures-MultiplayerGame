# Fatal Figures hosted deployment record

Application version: **1.0.0**. Public origin: **https://fatalfigures-enamul22.onrender.com**.

## Ownership and resources

- GitHub: `Enamul22/FatalFigures-MultiplayerGame`, verified account ID `135505234`.
- Render account: Enamul Haque, `enamulhaque16022@gmail.com`.
- Render workspace: **FatalFigures**, `tea-dbkvfjdbedkc73em9b70`, one member, Hobby.
- Render web service: **fatalfigures-enamul22**, `srv-dbl25qnb9u1s738oi7q0`, **Frankfurt (EU Central)**, Docker, **Free** (0.1 CPU / 512 MB RAM).
- Render project/environment: automatically created **My project / Production**; only this game service was configured.
- Neon organization: **Enamul FDE**, `org-spring-snow-49853488`, Free.
- Neon project: **FatalFigures**, `withered-river-63517116`, PostgreSQL 18, **AWS eu-central-1 (Frankfurt)**.
- Game production branch: **production**, `br-tiny-poetry-ba8abhur`.
- Isolated validation branch: **deployment-validation**, `br-square-brook-baicezkb`.
- Dedicated database / role: `fatalfigures` / `fatalfigures_app`.
- Both Neon computes are fixed at **0.25 CU**; no larger compute or paid plan was selected.

No FleetCare, ServicePlan or FleetPulse application/database was modified. No custom domain, payment method, paid compute, disk, worker or other billable service was added.

## Configuration and initial release

The existing Dockerfile builds the frontend and compiled Node server. Render runs its existing `CMD`, listens on `0.0.0.0:$PORT` with `PORT=10000`, and uses `/api/health` for readiness. Exact `ORIGIN` is the public HTTPS URL above. Pooled and direct Neon URLs are private Render variables; neither is present in Git, frontend assets or this document. The direct URL is reserved for the ownership lease and migration runner.

Automatic deploys are **Off**. Free compute supports one instance and no autoscaling. Workspace overlapping-deploy policy is **Wait**; that policy alone does not prevent old/new instance overlap. The database ownership protection remains intact.

Initial live application commit: `230d0a75069b9a326a38c405cb6bb6491f205a3d`.
Initial Render deploy: `dep-dbl25rfb9u1s738oi96g`.

Migration 001 was applied twice on the isolated validation branch, confirming idempotence. An actual second writer was refused the advisory lease there. Only then was migration 001 applied to the initially empty game production database. No reset, truncation or production test seed was used.

The initial public health response was `{ "status": "ok", "authority": "single", "durable": true }`. The HTTPS index, production SVG/JS/CSS and local music are served by Render. The downloaded public music SHA-256 matches the licensed original: `ddbab80963268c0d118abed143db95950bd552fc58e36412b1eb7ff5b7ae70e4`.

## Cost and availability limits

Verified Render billing at setup: **$0.00 unbilled**, **no card on file**, **$0 monthly pipeline spend limit**. Hobby includes **750 free instance hours**, **500 Starter pipeline minutes**, and **5 GB outbound bandwidth** monthly in this workspace. Free services sleep after 15 minutes without incoming HTTP/WebSocket traffic; a cold start can take roughly a minute. Free compute can be restarted by Render, has no persistent disk, shell or pre-deploy command, and provides no always-on uptime guarantee. Existing WebSocket traffic can keep it awake. Do not add uptime pingers to defeat inactivity limits.

The verified Neon Free plan includes **100 CU-hours per project per month**, **1 GB database storage**, **5 GB public network transfer**, **10 branches**, a **6-hour history window**, and **one manual snapshot**. It scales idle compute to zero after five minutes. The game's direct lease and regular heartbeat/query traffic keep the production compute active while the server runs. At 0.25 CU, 100 CU-hours covers about **400 running hours** across the project's computes, less if the validation branch is also active. This is insufficient for an uninterrupted 24/7 month. Monitor both providers' quotas; request approval before any upgrade or purchase.

Completed rooms live in Neon and survive Render restarts/cold starts. Active matches follow the existing 10-second/deadline interruption rules; a long maintenance gap records Interrupted rather than inventing catch-up scores or a champion. No automatic history-retention deletion is configured.

Sources checked at setup: [Render Free](https://render.com/docs/free), [build pipeline limits](https://render.com/docs/build-pipeline), [deploy lifecycle](https://render.com/docs/deploys), [health checks](https://render.com/docs/health-checks), [Neon plans](https://neon.com/docs/introduction/plans). Account usage/billing is the source of truth for the selected workspace.

## Verification workflow

Local production build and all **50 backend/PostgreSQL/process-restart tests** passed again before deployment. Existing application CI run [41655375412](https://github.com/Enamul22/FatalFigures-MultiplayerGame/actions/runs/41655375412) passed build, 50 tests, 4,000 simulations, 14 browser scenarios and Docker for initial application commit `230d0a7`.

`playwright.hosted.config.ts` deliberately has no fixture server, database reset or shortened timer. It requires an explicit reviewed `FATAL_PUBLIC_URL`. The hosted test creates only its own labelled QA rooms, exercises actual HTTPS/WebSocket traffic with independent contexts, uses production deadlines, and coordinates a real maintenance restart using a private operator-control file. It does not deploy or suspend any service itself.

Run from a trusted operator terminal:

```sh
FATAL_PUBLIC_URL=https://fatalfigures-enamul22.onrender.com \
FATAL_RESTART_CONTROL=/tmp/fatalfigures-qa-control.json \
npx playwright test -c playwright.hosted.config.ts
```

The operator must use the verified safe maintenance procedure, then set the control JSON `stage` to `restart-complete` after the service is healthy. The test then verifies completed history and the active-match Interrupted outcome. Keep control files private. Browser screenshots use synthetic QA nicknames; do not publish seat capabilities or private connection files.
