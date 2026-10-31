import pg from "pg";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import type { Room, Snapshot } from "../shared/engine.js";
import { snapshot } from "../shared/engine.js";
export const entropy = () => randomBytes(32).toString("hex");
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function authorized(hashValue: string, token: string) {
  const a = Buffer.from(hashValue, "hex"),
    b = Buffer.from(hash(token), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
export class Store {
  pool: pg.Pool;
  lease: pg.Client | null = null;
  healthy = true;
  owner = entropy();
  pingWork: Promise<void> = Promise.resolve();
  constructor(url: string) {
    if (!url)
      throw Error("DATABASE_URL is required. No temporary store is supported.");
    this.pool = new pg.Pool({
      connectionString: url,
      max: 8,
      connectionTimeoutMillis: 10000,
      query_timeout: 15000,
    });
    this.pool.on("error", () => {
      this.healthy = false;
    });
  }
  async migrate(direct: string) {
    const c = new pg.Client({ connectionString: direct });
    await c.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(82304711)");
      await c.query("CREATE SCHEMA IF NOT EXISTS fatalfigures");
      await c.query(
        "CREATE TABLE IF NOT EXISTS fatalfigures.migrations(version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
      );
      for (const file of (await readdir("migrations"))
        .filter((f) => /^\d+.*\.sql$/.test(f))
        .sort()) {
        const version = Number(file.split("_")[0]);
        if (
          !(
            await c.query(
              "SELECT 1 FROM fatalfigures.migrations WHERE version=$1",
              [version],
            )
          ).rowCount
        ) {
          await c.query(await readFile(`migrations/${file}`, "utf8"));
          await c.query(
            "INSERT INTO fatalfigures.migrations(version) VALUES($1)",
            [version],
          );
        }
      }
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      await c.end();
    }
  }
  async claim(direct: string) {
    if (new URL(direct).hostname.includes("-pooler"))
      throw Error("Authority lease requires a direct, unpooled PostgreSQL URL");
    const c = new pg.Client({ connectionString: direct, keepAlive: true });
    await c.connect();
    const { rows } = await c.query(
      "SELECT pg_try_advisory_lock(82304712) AS owned",
    );
    if (!rows[0].owned) {
      await c.end();
      throw Error(
        "Fatal Figures supports one authoritative server. Another writer holds the database lease.",
      );
    }
    await c.query(
      "INSERT INTO fatalfigures.authority(singleton,lease_id) VALUES(true,$1) ON CONFLICT(singleton) DO UPDATE SET lease_id=EXCLUDED.lease_id",
      [this.owner],
    );
    this.lease = c;
    c.on("error", () => {
      this.healthy = false;
    });
    c.on("end", () => {
      this.healthy = false;
    });
  }
  async ping() {
    if (!this.healthy || !this.lease) throw Error("Authority unavailable");
    this.pingWork = this.pingWork.then(async () => {
      await this.lease!.query("SELECT 1");
    });
    await this.pingWork;
  }
  async insert(room: Room) {
    if (!this.healthy) throw Error("Authority unavailable");
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const lease = await c.query(
        "SELECT lease_id FROM fatalfigures.authority WHERE singleton=true FOR SHARE",
      );
      if (lease.rows[0]?.lease_id !== this.owner)
        throw Error("Stale authority lease");
      await c.query(
        "INSERT INTO fatalfigures.rooms(code,version,checkpoint) VALUES($1,0,$2)",
        [room.code, room],
      );
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async read(code: string): Promise<Room> {
    const { rows } = await this.pool.query(
      "SELECT checkpoint FROM fatalfigures.rooms WHERE code=$1",
      [code],
    );
    if (!rows.length) throw Error("Room not found");
    return rows[0].checkpoint;
  }
  async list(playingOnly = false): Promise<string[]> {
    const { rows } = await this.pool.query(
      playingOnly
        ? "SELECT code FROM fatalfigures.rooms WHERE checkpoint->>'stage' NOT IN ('finished','lobby')"
        : "SELECT code FROM fatalfigures.rooms WHERE checkpoint->>'stage' != 'finished'",
    );
    return rows.map((row) => row.code);
  }
  async change<T>(
    code: string,
    now: () => number,
    kind: string,
    fn: (r: Room, at: number) => T,
  ): Promise<{ value: T; room: Room; public: Snapshot; changed: boolean }> {
    if (!this.healthy) throw Error("Authority unavailable");
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const authority = await c.query(
        "SELECT lease_id FROM fatalfigures.authority WHERE singleton=true FOR SHARE",
      );
      if (authority.rows[0]?.lease_id !== this.owner)
        throw Error("Stale authority lease");
      const { rows } = await c.query(
        "SELECT checkpoint,version FROM fatalfigures.rooms WHERE code=$1 FOR UPDATE",
        [code],
      );
      if (!rows.length) throw Error("Room not found");
      const r: Room = rows[0].checkpoint,
        at = now(),
        before = JSON.stringify(snapshot(r, 0));
      const value = fn(r, at);
      r.heartbeat = at;
      // A unique effect receipt is written in the SAME transaction as its checkpoint.
      if (r.match)
        for (const [seatId, pick] of Object.entries(r.picks)) {
          const result = await c.query(
            "INSERT INTO fatalfigures.choices(match_id,round_id,seat_id,pick) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING pick",
            [r.match.id, r.roundId, seatId, pick],
          );
          if (!result.rowCount) {
            const old = await c.query(
              "SELECT pick FROM fatalfigures.choices WHERE match_id=$1 AND round_id=$2 AND seat_id=$3",
              [r.match.id, r.roundId, seatId],
            );
            if (old.rows[0].pick !== pick)
              throw Error("Choice receipt conflict");
          }
        }
      r.version = rows[0].version + 1;
      const changed =
        before !==
        JSON.stringify(snapshot({ ...r, version: rows[0].version }, 0));
      if (changed) r.seq++;
      const pub = snapshot(r, at);
      const updated = await c.query(
        "UPDATE fatalfigures.rooms SET checkpoint=$2,version=$3,updated_at=now() WHERE code=$1 AND version=$4",
        [code, r, r.version, rows[0].version],
      );
      if (updated.rowCount !== 1) throw Error("Concurrent checkpoint conflict");
      if (changed)
        await c.query(
          "INSERT INTO fatalfigures.events(code,seq,kind,public_state) VALUES($1,$2,$3,$4)",
          [code, r.seq, kind, pub],
        );
      await c.query("COMMIT");
      return { value, room: r, public: pub, changed };
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async events(code: string, after: number) {
    const { rows } = await this.pool.query(
      "SELECT seq,kind,public_state FROM fatalfigures.events WHERE code=$1 AND seq>$2 ORDER BY seq LIMIT 100",
      [code, after],
    );
    return rows;
  }
  async close() {
    if (this.lease) {
      await this.lease.end();
      this.lease = null;
    }
    await this.pool.end();
  }
}
