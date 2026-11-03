# Authority, privacy and recovery

## Supported topology

One long-running Node.js 24 process serves the Vite build and Socket.IO. A separate
PostgreSQL database stores a dedicated `fatalfigures` schema. No other portfolio
repository or database is imported. Public configuration without database URLs or
without migrations fails; there is no in-memory persistence fallback.

This is a modest single-authority design, not a horizontally coordinated service.
A direct Postgres connection holds an exclusive session advisory lock. A second
process against the same database refuses to start. An authority row fences later
writers: every room transaction checks its lease ID under a shared row lock;
lease replacement waits for preceding transactions. Mutations additionally take
the room row `FOR UPDATE` and compare its version. Loss of the direct authority
connection makes health fail and disconnects sockets. Restart the process after
the database recovers; it does not silently regain authority.

The app pool may use a Neon pooled TLS URL. The lease and migrations must use a
**direct** connection. Keep one replica, disable overlapping rolling starts, and
use stop-then-start releases. Neither sticky sessions nor the default Socket.IO
memory adapter provides coordination across instances. There is no optional
Vercel deployment path in this release.

## State and transaction boundary

`shared/rules.ts` contains bounded exact rational arithmetic; `shared/engine.ts`
is a deterministic state machine with injected time and phase entropy. There are
no network or storage calls in the engine. `shared/draw.ts` is a deterministic
SHA-256 committed draw. Inputs are integer-validated before mutation.

Each transaction performs:

1. Verify fenced authority and lock the room row; read its current version.
2. Validate the seat/action against authoritative state and **current server
   receipt time after obtaining the lock**, not the client timer or callback time.
3. Store unique `(match_id, round_id, seat_id)` choice receipts and the private
   checkpoint. Duplicate same-value retry recovers the receipt; changed values fail.
4. Append a public snapshot event when public state changes and increment sequence.
5. Update version/checkpoint, commit, then broadcast and acknowledge success.

Commit precedes success acknowledgement. If delivery is uncertain, Sync/resume
recovers the seat’s own committed pick. No replacement number is accepted. Round
resolution is one versioned state change; duplicate callbacks cannot apply losses
a second time. The event ledger contains complete public snapshots, enabling
missed-event catch-up; reconnect also returns a full current snapshot. The unique
choice ledger preserves acknowledged picks from interrupted/unresolved rounds
without making them public. Checkpoints include exact rule snapshots, bot plans,
phase seeds, round deadlines, scores, histories and seat token hashes.

Every active room advances on a 500ms scheduling tick; inactive lobbies need no
clock polling. Clients estimate from server time and absolute deadlines. Clock
transitions use the previously scheduled timestamp, so normal callback latency
does not add mandatory time. Receipt at or after the deadline is rejected even
if the timer has not run. Public broadcasts occur on state changes, not idle ticks.
Database writes keep an authority heartbeat for restart policy. A gap over 10 seconds
also interrupts an already-running authority before it can resolve a backlog of
expired states. A blocked event loop does not turn into invented catch-up losses.

## Public and private boundaries

Public snapshots are built with an explicit allowlist: seat IDs/display names,
ready/connected/withdrawn state, rule, scores, deadline, locked IDs, resolved rounds,
completed seeds and history. They never spread the room/seat record. Hidden picks,
bot plans, token hashes and current/future phase seeds stay private. There are no
anonymous room or replay REST data endpoints. The host has lobby controls only,
with no input inspection or live rule editing. Replays are resolved records,
never a dump of checkpoints.

An invitation code grants lobby access only. A 256-bit random resume capability
is bound to a random UUID seat and compared against a server-side SHA-256 verifier.
The raw capability is issued once to that seat, held in per-tab `sessionStorage`,
and sent only as a private resume request. It never enters invite URLs, public
snapshots, screenshots, analytics or application logs. JavaScript can read that
storage; React escaping, restrictive nicknames, CSP and no third-party scripts
reduce XSS exposure. HTTPS is mandatory for real hosting. A trusted compromised
browser/server remains outside this guest-capability model.

Tabs sharing a capability recover the same seat, not a new seat. Multiple sockets
can observe their own receipt, but unique choice constraints and room locking
prevent conflicting effects. New sockets do not get room state until join/resume
is authorized. Eliminated/withdrawn/nonparticipant seats cannot act. Lobby joins
are row-locked against the 5-seat cap and start; live matches accept no new seats.
Host departure transfers lobby control to a connected human; reconnecting during
play preserves host identity. Results transfer control if the old host is absent.
No replacement bots enter a live game.

Socket handshake origin checking, bounded payloads, nickname validation, HTTP
rate limits, per-IP connection/action/create quotas and per-socket action quotas
limit basic abuse. Limits are in-process and reset on restart; this is not a
DDoS-hardened public matchmaking service. IP uses the direct socket address;
behind a reverse proxy, tune upstream per-client limits (NAT/proxy clients may
share the app quota). No analytics or external fonts are loaded.

## Recovery and failure policy

Startup reads nonfinished checkpoints. Resume a playing match only if the server
heartbeat gap is **≤10 seconds**, the current deadline is still in the future and
the hard deadline has not arrived. Original start/deadline, acknowledged choices,
handicaps and history remain intact. Disconnected seats get no individual clock
extension. A reconnect proves seat ownership again and returns public missed events
(up to 100) plus the authoritative full snapshot, so the page never requires
transport recovery to succeed.

If any recovery condition fails, record **Interrupted**, without catch-up rounds,
extra losses or a champion. Choice receipts remain in PostgreSQL and the last unresolved round remains in
the private checkpoint so each seat can still recover its own uncertain acknowledgement;
unresolved choices stay outside public state and replay. If all connected human participants leave/withdraw,
record **Abandoned** after 60 seconds. A new connection using the same seat can
restore activity within that existing match budget. All active humans gone does
not cause bot replacements. A watchdog records Interrupted by 30 minutes under
normal supported operation; no system can persist an outcome while its database
is unreachable. A supervisor/health check should restart the unhealthy process
when infrastructure returns, at which point the interruption policy applies.

## Bots and verification boundary

Each bot receives a deeply frozen clone of public rules/resolved history and its
own prior choices, with an independent seeded RNG unrelated to the tie draw.
Plans are chosen when choosing opens, before hidden human inputs, persisted
privately, then committed after an independent delay. Anchor explores uniformly;
Analyst predicts from public history under the current phase formula; Contrarian
plays displaced/extreme forecasts; Adapter perturbs its current-rule forecast.
None reads the engine’s live picks. Tests vary hidden opponent picks while fixing
public history/seed and require invariant bot actions.

`verify:replay` recomputes exact results, totals, handicaps, elimination keys and
committed fallback; `verify:draw` checks the sorted candidates, rejection counter
and chosen index. Exported replay does not prove receipt timing, a secure server
operator or independently auditable entropy generation. The application trusts
its PostgreSQL administrator and server. Draw seeds are independent per phase and
only the resolved phase’s seed is revealed.

## Primary technical references checked

- [Socket.IO rooms](https://socket.io/docs/v4/rooms/)
- [Connection recovery](https://socket.io/docs/v4/connection-state-recovery/)
- [Delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/)
- [Vite guide](https://vite.dev/guide/)
- [Node.js release guidance](https://nodejs.org/en/about/previous-releases)
- [Neon pooled/direct connections](https://neon.com/docs/connect/connection-pooling)

Socket.IO transport ordering/recovery is useful but does not itself implement
this application’s durable exactly-once effects. Those follow from transactions,
receipts, fenced authority and versioned resolution.

## Playing-room presentation

The current CSS/SVG room consumes the same public snapshots and seat-private lock
receipts. Its isolated countdown component cannot submit or advance play. Fixed
seat IDs, read-only own receipt dialogs, retained resolved results, quiet resync
baselines and optional gesture-unlocked audio do not change the authority or
privacy protocol. See [ROOM_PRESENTATION.md](ROOM_PRESENTATION.md).

The decisive final main/tiebreak resolution now calls the existing phase-finisher
before the same transaction commits. Final result, seed/draw evidence, elimination,
champion, finished status and timestamp are atomic. Earlier phases retain their
original transitions. A tied main final finishes its reveal and then opens its
required tiebreak without an intermission. No schema/protocol change is needed.
