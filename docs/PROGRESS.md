# Engineering decisions and development history

## Multiplayer engine

React/Vite and Express/Socket.IO share a TypeScript rule engine with exact rational scoring. PostgreSQL transactions combine versioned checkpoints, public event records and unique choice receipts. An advisory lease and fenced authority row enforce one active game server per database.

Three-round elimination phases use changing statistical rules and a cyclic two-player final. Bounded tiebreaks and committed random draws support a finite match duration. Replay tools independently recompute the recorded effects.

## Recovery and verification

Acknowledged choices survive reconnects and server restarts. Short restarts preserve the original deadline; longer interruptions record an Interrupted match instead of inventing catch-up penalties. Bot decisions consume public history and independent randomness.

The initial remote verification included 47 tests, Chromium/Firefox multiplayer scenarios, 4,000 seeded matches and a Docker build. Later refinements expanded backend and browser coverage. See [VERIFICATION.md](VERIFICATION.md) for current recorded evidence and simulation limitations.

## Playing room

The room evolved into an oval CSS/SVG table with stable seats, avatars, private entry dialogs, visible figure/phase-total cards, an accessible timer and on-demand scoring details. Successful locks return immediately to the table. The decisive final result commits the champion without a redundant end-screen wait.

Continuous CC0 background music and original event cues support mute and volume controls. Reduced motion, mobile layouts and reconnect-safe presentation are covered by the room verification record. See [ROOM_PRESENTATION.md](ROOM_PRESENTATION.md) and [audio credits](../web/public/audio/README.md).

## Public deployment — 3 November 2026

The game runs on Render with Neon PostgreSQL in Frankfurt. Migrations were validated on an isolated database branch before application. Bounded authority handover handles overlapping server replacement while preserving the exclusive lease.

Hosted verification exercised independent sessions, privacy, phone/audio controls, ordinary and tied finals, replay, rematch and durable restart. A PostgreSQL JSONB key-order issue in the draw verifier was fixed with regression coverage. Deployment evidence, resource limits and maintenance procedures are documented in [DEPLOYMENT_RECORD.md](DEPLOYMENT_RECORD.md) and [HOSTING.md](HOSTING.md).
