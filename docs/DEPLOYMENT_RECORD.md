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

The existing Dockerfile builds the frontend and compiled Node server. Render runs the tested `/app/render-start.sh` entrypoint, listens on `0.0.0.0:$PORT` with `PORT=10000`, and uses `/api/health` for readiness. Exact `ORIGIN` is the public HTTPS URL above. Pooled and direct Neon URLs are private Render variables; neither is present in Git, frontend assets or this document. The direct URL is reserved for the ownership lease and migration runner.

Automatic deploys are **Off**. Free compute supports one instance and no autoscaling. Workspace overlapping-deploy policy is **Wait**; that policy alone does not prevent old/new instance overlap. The database ownership protection remains intact.

Initial live application commit: `230d0a75069b9a326a38c405cb6bb6491f205a3d`.
Initial Render deploy: `dep-dbl25rfb9u1s738oi96g`.

First successful guarded handover commit: `fe5ea11cf5d055a7b40f16188c2b97e1662c8b64`.
Its Render deploy: `dep-dbl4ap8ae00c73bov0kg`.

Final approved live application commit: `b3af1627fd1d37328867c758f0e1619d317da93e`.
Final successful Render deploy: `dep-dbl4h3bncjis73b6ved0`.
[Final application CI 41714941224](https://github.com/Enamul22/FatalFigures-MultiplayerGame/actions/runs/41714941224) passed production build, **57 tests**, **14 browser scenarios**, **4,000 simulations** and Docker export.

The new build was observed waiting without HTTP readiness while the old authority
held its lease. The reviewed helper terminated only the pre-recorded old lease
backend (PID 680); the replacement acquired the exclusive lease (PID 9518),
became Live and returned healthy readiness. No saved records were modified by
the handover. The existing fencing and exclusive advisory lock remain enabled.
A later same-commit Suspend/Resume was verified with HTTP 503 and exactly zero
game lease holders while stopped, followed by healthy readiness after resume.
Resume reused the approved successful build.

The final release repeated the safe handover: old PID 11239 → new PID 12069.
A concurrent 121-sample database observer saw a maximum of **one** game lease
holder. The candidate was visibly unready before release of the exact old session,
then Render reported the exact `b3af162` commit Live and public readiness passed.

A failed nested-shell command and a deliberately parked mismatched release did
not cause authority handover: the old server remained authoritative. The final
image uses an executable entrypoint file and the persisted approval SHA was
verified before deployment. See HOSTING.md for the supported procedure.

Migration 001 was applied twice on the isolated validation branch, confirming idempotence. An actual second writer was refused the advisory lease there. Only then was migration 001 applied to the initially empty game production database. No reset, truncation or production test seed was used.

The initial public health response was `{ "status": "ok", "authority": "single", "durable": true }`. The HTTPS index, production SVG/JS/CSS and local music are served by Render. The downloaded public music SHA-256 matches the licensed original: `ddbab80963268c0d118abed143db95950bd552fc58e36412b1eb7ff5b7ae70e4`.

## Cost and availability limits

Verified Render billing at setup: **$0.00 unbilled**, **no card on file**, **$0 monthly pipeline spend limit**. Hobby includes **750 free instance hours**, **500 Starter pipeline minutes**, and **5 GB outbound bandwidth** monthly in this workspace. Free services sleep after 15 minutes without incoming HTTP/WebSocket traffic; a cold start can take roughly a minute. Free compute can be restarted by Render, has no persistent disk, shell or pre-deploy command, and provides no always-on uptime guarantee. Existing WebSocket traffic can keep it awake. Render may also suspend Free services for unusually high service-initiated public traffic, including external database traffic. Do not add uptime pingers to defeat inactivity limits.

The verified Neon Free plan includes **100 CU-hours per project per month**, **1 GB database storage**, **5 GB public network transfer**, **10 branches**, a **6-hour history window**, and **one manual snapshot**. It scales idle compute to zero after five minutes. The game's direct lease and regular heartbeat/query traffic keep the production compute active while the server runs. At 0.25 CU, 100 CU-hours covers about **400 running hours** across the project's computes, less if the validation branch is also active. This is insufficient for an uninterrupted 24/7 month. Monitor both providers' quotas; request approval before any upgrade or purchase.

Completed rooms live in Neon and survive Render restarts/cold starts. Active matches follow the existing 10-second/deadline interruption rules; a long maintenance gap records Interrupted rather than inventing catch-up scores or a champion. No automatic history-retention deletion is configured.

Sources checked at setup: [Render Free](https://render.com/docs/free), [build pipeline limits](https://render.com/docs/build-pipeline), [deploy lifecycle](https://render.com/docs/deploys), [health checks](https://render.com/docs/health-checks), [Neon plans](https://neon.com/docs/introduction/plans). Account usage/billing is the source of truth for the selected workspace.

## Verification workflow

Local production build and all **56 backend/PostgreSQL/process-restart/hosting tests** passed before the final application deployment. Final application [CI 41711635149](https://github.com/Enamul22/FatalFigures-MultiplayerGame/actions/runs/41711635149) passed **56 tests**, **14 browser scenarios**, **4,000 simulations**, formatting, production build and Docker image export for `fe5ea11`. Existing application CI run [41655375412](https://github.com/Enamul22/FatalFigures-MultiplayerGame/actions/runs/41655375412) passed build, 50 tests, 4,000 simulations, 14 browser scenarios and Docker for initial application commit `230d0a7`.

`playwright.hosted.config.ts` deliberately has no fixture server, database reset or shortened timer. It requires an explicit reviewed `FATAL_PUBLIC_URL`. The hosted test creates only its own labelled QA rooms, exercises actual HTTPS/WebSocket traffic with independent contexts, uses production deadlines, and coordinates a real maintenance restart using a private operator-control file. It does not deploy or suspend any service itself.

Run from a trusted operator terminal:

```sh
FATAL_PUBLIC_URL=https://fatalfigures-enamul22.onrender.com \
FATAL_RESTART_CONTROL=/tmp/fatalfigures-qa-control.json \
npx playwright test -c playwright.hosted.config.ts
```

The operator must use the verified safe maintenance procedure, then set the control JSON `stage` to `restart-complete` after the service is healthy. The test then verifies completed history and the active-match Interrupted outcome. Keep control files private. Browser screenshots use synthetic QA nicknames; do not publish seat capabilities or private connection files.

## Public browser evidence

The HTTPS run used independent desktop and touch-phone browser contexts to create
and join the same friend room. It checked sealed choices before reveal, automatic
entry closure on acknowledged locks, a refresh retaining the seat/private receipt
and original deadline, revealed scoring, required tiebreak plus committed draw,
and immediate champion presentation (`finishedAt === decisive resolvedAt`).
Computer play, advancing local music playback, volume/mute, replay and rematch
passed against the public server. A separate three-seat computer ladder completed
with an ordinary final, exact replay verification and retained dim eliminated
seats. The public final timestamps confirmed no redundant final delay.

A real Suspend/Resume returned HTTP 503 and zero database lease holders while
stopped, then healthy readiness after resuming. The recovered public seat retained
its private acknowledged 37; the completed champion/history and replay remained
correct. The active rematch became Interrupted with zero resolved rounds and no
invented champion. No database reset or manual record repair was performed.

The verification initially exposed two issues: its observer missed a reconnect
snapshot carried by Socket.IO's polling acknowledgement, and the draw verifier
compared JSON property order after PostgreSQL JSONB reordered keys. The observer
now covers polling and WebSocket acknowledgements. The verifier compares the same
draw values independently of object-key order; generation, scoring and the saved
results did not change. Regression coverage includes a real PostgreSQL JSONB
round trip and tamper rejection. A private checkpoint recovery browser test passed
against the actual restarted room.

Screenshots 18–22 show the actual public landing, table, phone reveal, tied
champion and persistent history. Desktop and emulated-phone screenshots were
visually reviewed. No physical phone, sustained-load capacity or always-on
availability claim is made. The existing CI browser suite additionally covers
2–5 seats, spectator/reconnect behavior, failed/uncertain submissions, reduced
motion and blocked audio; these are distinguished from the production-clock
public scenarios above.

The corrected full public gameplay/restart scenario subsequently passed end to
end in **2.7 minutes**. The separate public three-seat ladder passed in **3.7
minutes**; the private-checkpoint recovery scenario passed in **2.1 seconds**.
Earlier interrupted/instrumentation-failed attempts are described above rather
than counted as passing runs.

The complete public HTTPS gameplay/restart scenario was repeated **after the final
`b3af162` deployment** and passed in **2.8 minutes**. This repeat again covered
independent friend sessions, private lock/refresh receipt, production-clock tied
final, computer/audio/replay/rematch, and a real Suspend → zero leases/HTTP 503 →
Resume → healthy readiness cycle. Completed history persisted and the active
rematch became Interrupted without invented rounds or a champion. Screenshots
18–22 were refreshed from that final live release. Auto-Deploy remains Off.
