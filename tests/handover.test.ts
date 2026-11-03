import { it, expect, beforeEach } from "vitest";
import pg from "pg";
import { startAuthority } from "../server/startup.js";
import { createRoom } from "../shared/engine.js";
import { hash, AuthorityBusyError } from "../server/store.js";
import { TEST_URL, resetDb } from "./db-helper.js";
beforeEach(resetDb);
const options = {
  url: TEST_URL,
  direct: TEST_URL,
  origin: "http://localhost:3000",
  now: () => 0,
};
it("bounded replacement wait never steals a healthy authority lease", async () => {
  const old = await startAuthority(options);
  try {
    await expect(startAuthority(options, 80)).rejects.toBeInstanceOf(
      AuthorityBusyError,
    );
    expect(old.store.healthy).toBe(true);
    await expect(old.store.ping()).resolves.toBeUndefined();
  } finally {
    await old.close();
  }
});
it("fenced handover after terminating only the old lease session preserves data and rejects stale writes", async () => {
  const old = await startAuthority(options),
    admin = new pg.Client({ connectionString: TEST_URL });
  let next: Awaited<ReturnType<typeof startAuthority>> | undefined;
  try {
    const room = createRoom(
      "HND234",
      {
        id: "a",
        nickname: "Handover",
        tokenHash: hash("private-test-only"),
        ready: true,
        withdrawn: false,
        connected: true,
      },
      0,
    );
    room.notice = "Durable pre-release record";
    await old.store.insert(room);
    const pid = (await old.store.lease!.query("select pg_backend_pid() pid"))
      .rows[0].pid;
    let acquired = false;
    const pending = startAuthority(options, 3000).then((v) => {
      acquired = true;
      return v;
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(acquired).toBe(false);
    await admin.connect();
    expect(
      (await admin.query("select pg_terminate_backend($1) stopped", [pid]))
        .rows[0].stopped,
    ).toBe(true);
    next = await pending;
    expect((await next.store.read("HND234")).notice).toBe(
      "Durable pre-release record",
    );
    expect(old.store.healthy).toBe(false);
    await expect(
      old.store.change(
        "HND234",
        () => 0,
        "stale",
        (r) => {
          r.notice = "bad";
        },
      ),
    ).rejects.toThrow("Authority unavailable");
    // Even a stale worker that misses its connection event cannot bypass fencing.
    old.store.healthy = true;
    await expect(
      old.store.change(
        "HND234",
        () => 0,
        "stale",
        (r) => {
          r.notice = "bad";
        },
      ),
    ).rejects.toThrow("Stale authority lease");
    old.store.healthy = false;
    expect((await next.store.read("HND234")).notice).toBe(
      "Durable pre-release record",
    );
    expect(
      (
        await admin.query(
          "select count(*)::int count from pg_locks where locktype='advisory' and classid=0 and objid=82304712 and granted and database=(select oid from pg_database where datname=current_database())",
        )
      ).rows[0].count,
    ).toBe(1);
  } finally {
    await admin.end();
    await old.close();
    await next?.close();
  }
});
