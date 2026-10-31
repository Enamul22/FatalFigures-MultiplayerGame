# Verification record

Review date: **1 November 2026**. Node **24.22.1**, TypeScript, real local
PostgreSQL **18**, Chromium **156** and Firefox **157**. No cloud deployment.

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
- `npm test`: **47 tests**, including PostgreSQL, real clients and process restart.
- `npm run simulate`: **4,000 matches**, 1,000 per starting count; every resolved
  simulation replay independently recomputed.
- `npm run test:browser`: **3 end-to-end scenarios**; game flows cover the cases
  above. Browser-only test clocks are 8s choosing, 1.4s reveal, .2s intermission,
  1.2s briefing, 1s phase result, and 6+1.2s tie. Those are deliberately shortened
  fixture settings; the production clock proof uses 90/20/10s, 15+10s phase
  screens and 30+15s ties.
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
| 2        | 7m10s      | 7.25%                     | n/a                  | 8.75%                  |
| 3        | 14m20s     | 1.75%                     | 6.09%                | 12.04%                 |
| 4        | 21m30s     | 1.75%                     | 11.96%               | 16.75%                 |
| 5        | **28m40s** | 1.50%                     | 14.79%               | 18.13%                 |

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

## Isolation and limits

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
Remote run/commit verification will be linked here after the first push; local
success is not presented as evidence of a remote run.
