CREATE SCHEMA IF NOT EXISTS fatalfigures;
CREATE TABLE IF NOT EXISTS fatalfigures.migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS fatalfigures.rooms (
 code text PRIMARY KEY, version integer NOT NULL, checkpoint jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fatalfigures.events (
 code text NOT NULL REFERENCES fatalfigures.rooms(code), seq integer NOT NULL,
 kind text NOT NULL, public_state jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(code,seq)
);
CREATE TABLE IF NOT EXISTS fatalfigures.choices (
 match_id text NOT NULL, round_id text NOT NULL, seat_id text NOT NULL, pick smallint NOT NULL CHECK(pick BETWEEN 0 AND 100),
 committed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(match_id,round_id,seat_id)
);
-- Match IDs and all round/phase rule snapshots live in immutable public event
-- snapshots and the versioned private room checkpoint. No other app's tables.
CREATE TABLE IF NOT EXISTS fatalfigures.authority (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), lease_id text NOT NULL
);
