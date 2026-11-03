# Verification record

Review date: **3 November 2026**. Node **24.22.1**, TypeScript, real local
PostgreSQL **18**, Chromium **156** and Firefox **157**. The original local
verification is retained below; the subsequent public deployment is recorded in
[DEPLOYMENT_RECORD.md](DEPLOYMENT_RECORD.md).

## Automated checks

The final local suite and remote CI are recorded below; this document does not
substitute a mocked store for durable verification.

| Area                   | Evidence                                                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact math and scoring | Approved target fixtures, odd/even medians, duplicate inclusion, true distance ties, reduced rationals, rank/timeout/collision precedence, all seat counts and double stakes                      |
| Circle                 | All **10,201 pairs**, **101 self-draws**, 50 wins/50 losses per figure, antisymmetry, wrap, draw and timeout scoring                                                                              |
| Phase structure        | Three main rounds, one elimination, phase-score reconstruction, fresh/shared handicaps, final 0/−1 advantage and rematch reset                                                                    |
| Bounded ties           | One tiebreak, only still-tied fallback candidates, 6,000-seed frequency sanity check, deterministic verification and full-match seat-order reversal invariance                                    |
| Clock                  | Injected production clock for 2/3/4/5 starters, all timeouts, maximum tiebreak budgets, deadline boundary and duplicate late callback                                                             |
| PostgreSQL             | Real row-lock concurrency, rollback, version/sequence consistency, unique choice receipts, second-authority refusal; no mock persistence                                                          |
| Socket.IO              | Concurrent create/join/start/lock, sixth-seat denial, private receipts, identical/conflicting retry, two tabs, capability denial, room isolation, refresh, host departure, eliminated seat denial |
| Privacy                | Actual Socket.IO network/public/private/replay payload inspection before reveal; not merely a hidden-DOM assertion. Bots invariant to hidden opponent choices with fixed public state/seed        |
| Recovery               | New app/store instances retain choices/history/handicaps and original deadline; long outage and live heartbeat stall record Interrupted without extra rounds/losses                               |
| Real process           | Production-timed server child process receives **SIGKILL** after a durable lock; a new OS process restores the same seat, pick, round and deadline, with idempotent retry                         |
| Browsers               | Five independent Chromium/Firefox sessions complete **5 → 4 → 3 → 2 → champion**, timeout, shared handicap, tiebreak, replay and rematch; a two-seat practice match completes                     |
| Interface              | 1440px desktop, 390×844 phone/touch, native range validation, keyboard/modal focus/Escape, mute, reduced motion, actual locked versus revealed state; original SVG logo loads in production build |
| Replay                 | Independent recalculation of exact effects, phase totals, handicaps, bounded elimination and committed draw; altered scores/candidates fail verification                                          |

- `npm run build`: typecheck, Vite frontend build and compiled Node server.
- `npm test`: **50 tests**, including PostgreSQL, real clients and process restart.
- `npm run simulate`: **4,000 matches**, 1,000 per starting count; every resolved
  simulation replay independently recomputed.
- `npm run test:browser`: **14 end-to-end scenarios**; game flows cover the cases
  above. Browser-only test clocks are 12s choosing, 2s reveal, .7s intermission,
  1.2s briefing, 1.5s phase result, and 9+1.5s tie. Those are deliberately shortened
  fixture settings; the production clock proof uses 90/20/10s, 15+10s earlier-phase
  screens and 30+15s earlier ties. The decisive final resolution commits the
  champion immediately; see the current room notes for final transition details.
- `npm run format:check`: repository code and documentation formatting.

The production-timed Chrome review also played a five-seat practice table with
real locks, valid target distances, duplicates and double stakes. See screenshot 13. Fixture screenshots 01–12 use accelerated clocks and contain synthetic guest
names; screenshots are not a live hosting claim. All screenshots were visually
inspected. The broken production logo and host-refresh/rematch issue discovered
in browser review were fixed before handoff.

## Reproducible simulation findings

Seed: `FatalFigures-review-v2`. Four strategy families: balanced rotation,
Analyst/Adapter, Anchor/Contrarian and homogeneous rotating strategy. Seat
assignments are randomized. Bot choices have independent deterministic seeds and
receive the same public history before any hidden submission is committed.
Each 1,000-match group contains **100 all-timeout**, **100 all-identical-pick** and
**800 mixed-strategy** matches. Mixed play includes 4% per-seat timeouts. Full
choosing windows model ceilings, not normal human match lengths.

| Starters | Maximum    | Mixed-phase tiebreak rate | Mixed collision rate | Mixed circle draw rate |
| -------- | ---------- | ------------------------- | -------------------- | ---------------------- |
| 2        | 6m35s      | 7.25%                     | n/a                  | 8.75%                  |
| 3        | 13m45s     | 1.75%                     | 6.09%                | 12.04%                 |
| 4        | 20m55s     | 1.75%                     | 11.96%               | 16.75%                 |
| 5        | **28m05s** | 1.50%                     | 14.79%               | 18.13%                 |

The overall tiebreak rate is higher (21.2–25.8%) because deliberate timeout/equal
stress cases force ties. Those cases must not be interpreted as ordinary human
play. Mixed-game committed random fallbacks occurred 10 / 6 / 17 / 12 times across
the 800 matches at each respective starting count. Full breakdowns by scenario
and strategy family are in [simulation-results.json](simulation-results.json).

**Balance concerns to review with people:**

- Duplicate risk grows with crowd size: almost 15% of mixed five-seat submissions
  collided in these strategy mixes. Make sure people understand that matching a
  friend’s number is not a shared statistical win.
- Among mixed finals with different earned starting handicaps, the zero-handicap
  finalist won **504/794 (63.5%)**, **491/799 (61.5%)**, and **491/799 (61.5%)** for
  three/four/five starters. That is observational, confounded by prior performance;
  it is not a causal experiment isolating the handicap.
- Mixed five-seat strategy wins per appearance were Anchor **154/1105 (13.9%)**,
  Analyst **187/905 (20.7%)**, Contrarian **201/895 (22.5%)**, Adapter
  **258/1095 (23.6%)**. Strategy families/opponents are not identical controls.
  The strategies are visibly different; they are not equally strong in this model.
- Randomized initial join positions won 506/494 with two seats; 332/334/334 with
  three; 258/260/244/238 with four; 190/188/212/200/210 with five. This is a sanity
  check, not a proof of complete game fairness. Separate exact permutation tests
  confirm outcomes do not depend on join order when inputs and entropy are fixed.

The approved scoring, multipliers and handicaps were **not changed** to improve
these results. Automated mathematical symmetry and these bot simulations do not
prove fun, optimal strategy, immunity to exploitation or human comprehension.

## Original local delivery isolation and limits (historical)

All database tests used game-only local `*_test` fixtures. The live local review
uses its own `fatalfigures` database. No existing Neon database was queried or
modified, and no game cloud resources were provisioned. No credentials are in Git.

Docker is unavailable locally; CI builds the supplied Dockerfile on Ubuntu. No
real hosted reverse proxy, remote phone over the public internet, production
load, paid hosting or external-Neon latency test was performed. Responsive phone
checks use Chromium touch emulation. Multi-instance deployment is intentionally
unsupported and fails on a second writer; capacity under sustained load is not
measured. Broader human playtesting, hosting choice and deployment remain Enamul’s
review steps.

## Remote CI

The GitHub workflow runs the build, formatting, 47 tests against PostgreSQL 18,
seeded simulation, Chromium/Firefox end-to-end flows, and Docker image build.
[GitHub Actions run 41254110331](https://github.com/Enamul22/FatalFigures-MultiplayerGame/actions/runs/41254110331)
completed **successfully** against application commit
`4cda8c307c4a2fbb72921f1668e0858f1d7b660a`. Actual job logs confirmed **47 tests
passed**, **3 browser scenarios passed**, all 4,000 seeded simulations completed,
and the Docker image exported successfully on Ubuntu. The database service was
PostgreSQL 18; no portfolio/cloud credentials were supplied.

An independent clean SSH clone also passed `npm ci` and the full build, then
`npm prune --omit=dev`. The compiled server started with **only production
dependencies** against a game-only local test fixture and returned
`{status: "ok", authority: "single", durable: true}` from `/api/health`. That
additional smoke-test server was stopped; the main local review server remains
available on port 3000. Local Docker execution remains untested; the actual
remote Docker build above is the recorded container verification.

## November 1 presentation follow-up (historical)

See [ROOM_PRESENTATION.md](ROOM_PRESENTATION.md) for the oval table, stable seats,
local dialogs, retained result, isolated countdown, optional audio, reduced motion
and expanded browser checks. That update left backend/scoring/timing/persistence
source and version unchanged and passed 47 backend tests and 10 browser scenarios.
[Its successful CI run](https://github.com/Enamul22/FatalFigures-MultiplayerGame/actions/runs/41326029404)
verifies commit `489b325`. The following section records the current refinements.

## November 3 room refinements

Current local evidence: build, format check, **50 backend tests**, **14 browser
scenarios**, and all **4,000 seeded matches** passed. The three added engine tests
assert atomic ordinary/tied final completion with production clocks. Four added
browser cases exercise both immediate finals (including final choices,
refresh/replay/rematch), actual server rejection and retry, active-leave
confirmation, and lost acknowledgement/snapshot fault injection followed by sync.
The original ten browser flows cover 2–5-seat friend rooms, full ladder,
computer play, private choices, stable seats, spectator/elimination states,
reconnects, reduced motion and audio failure paths. Music is a real local CC0
media file; the browser checks playback time advancing across stages alongside
real oscillator cues, volume and mute. Chrome and phone screenshots were
visually inspected. [Full current design, licensing and limits](ROOM_PRESENTATION.md).

The initial delivery CI links above are historical evidence for those commits,
not a claim that they ran the current refinements. The existing workflow runs
the current checks on this push. No deployment or portfolio/cloud DB change.

## Authorized Render + Neon deployment

See [DEPLOYMENT_RECORD.md](DEPLOYMENT_RECORD.md) for the actual public resources,
CI commits, HTTPS browser checks, controlled restart evidence and screenshots
18–22. [HOSTING.md](HOSTING.md) records the tested exclusive-authority handover.
Public tests use real production timers and game-only QA rooms without resetting
the production database. Render/Neon Free quotas and cold-start limits apply.
