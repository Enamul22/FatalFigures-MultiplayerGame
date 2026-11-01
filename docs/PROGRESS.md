# Implementation record

2026-11-01: Read the complete approved master prompt. Verified GitHub connector ID
135505234 / Enamul22 and matching SSH identity. All three existing repositories
were clean at baseline. No existing application/database is an implementation target.

Decisions: React/Vite + Express/Socket.IO, exact bounded rational rule engine,
PostgreSQL checkpoint + public event ledger + unique choice receipts in one
transaction. A direct-connection advisory lease enforces one authoritative server;
no cross-instance routing claim. Separate `fatalfigures` schema. Real local
PostgreSQL verification avoids touching existing Neon records. Production timers
are 90/20/10 seconds; phase briefing 15 and phase end 10, one 30+15 second tie.
Maximum five-seat schedule: 28m40s (under the approved 29-minute budget).

Recovery policy: retain the original clock if restart is within 10 seconds AND
before the current deadline. Otherwise record Interrupted; never synthesize a
backlog of timeout rounds. Committed choice receipts remain durable even when
an interrupted round does not enter public replay.

Implementation and verification ongoing; results will be recorded after checks.

Implemented vertical slice through complete rule engine, real Socket.IO rooms,
private durable locks, server-owned clock, committed bounded ties, bot practice,
replay verification, rematch, mobile UI and original SVG/synth cues. Real local
PostgreSQL 18 and isolated test databases were created; no cloud database or
existing repository was used for writes.

Browser review found and fixed a production SVG path issue and host identity
changing on in-match refresh. The five-session Chromium/Firefox elimination
ladder and rematch passed. Added a live authority-stall guard, real OS-process
SIGKILL/restart test, full replay recomputation and seat-order permutation tests.
Latest simulations use four strategy families and independent choice seeds;
ordinary mixed play is reported separately from deliberate timeout/tie stress.
See VERIFICATION.md for quantitative findings; approved rules remain unchanged.

Delivery: application commit `4cda8c307c4a2fbb72921f1668e0858f1d7b660a` pushed to
Enamul22/FatalFigures-MultiplayerGame main. GitHub attributed the commit to
Enamul22. Actual remote run 41254110331 completed successfully: 47 tests,
3 Chromium/Firefox browser scenarios, 4,000 seeded matches and Docker build.
A separate clean clone built and started after pruning dev dependencies; its
health check passed and that temporary server was stopped. Main review server
and persistent local PostgreSQL remain on ports 3000 / 5544.

Final checks found the three original repositories clean and at the exact
baseline commits (FleetCare 2fede6a, ServicePlan 5824d47, FleetPulse 17d4c84).
No existing database or hosting settings were touched. No deployment performed.
The final documentation commit records this evidence; runtime code is unchanged.

Landing-page refinement requested by Enamul: renamed the computer-play button to
"Play with computer", removed the maximum-duration marketing block, and removed
"MEAN × 0.8" from the yellow illustration. Actual phase rules and production
timing remain unchanged. Build and the desktop/phone browser scenario passed;
updated both landing screenshots and the existing button selectors.
