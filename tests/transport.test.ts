import { beforeEach, afterEach, it, expect } from "vitest";
import { io, type Socket } from "socket.io-client";
import { createApp } from "../server/app.js";
import { PRODUCTION, type Snapshot } from "../shared/engine.js";
import { TEST_URL, resetDb } from "./db-helper.js";
let server: Awaited<ReturnType<typeof createApp>>,
  clients: Socket[] = [],
  time = 1000,
  port: number;
const states = new Map<Socket, Snapshot>();
const ask = (s: Socket, event: string, data: any = {}): Promise<any> =>
  new Promise((resolve, reject) =>
    s
      .timeout(3000)
      .emit(event, data, (e: any, r: any) => (e ? reject(e) : resolve(r))),
  );
async function ok(s: Socket, event: string, data: any = {}) {
  const r = await ask(s, event, data);
  expect(r.ok, r.error).toBe(true);
  return r.value;
}
async function connect() {
  const s = io(`http://127.0.0.1:${port}`, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
  });
  clients.push(s);
  s.on("state", (v) => states.set(s, v));
  await new Promise<void>((res, rej) => {
    s.on("connect", () => res());
    s.on("connect_error", rej);
  });
  return s;
}
async function waitFor(fn: () => boolean) {
  const end = Date.now() + 4000;
  while (!fn()) {
    if (Date.now() > end) throw Error("State wait timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}
async function boot() {
  server = await createApp({
    url: TEST_URL,
    direct: TEST_URL,
    origin: "http://localhost:3000",
    now: () => time,
    tickMs: 10,
  });
  await new Promise<void>((res) =>
    server.http.listen(0, "127.0.0.1", () => res()),
  );
  port = (server.http.address() as { port: number }).port;
}

// Model a healthy sequence of intervening heartbeat ticks when advancing fake
// wall time directly to a deadline. Separate stall tests deliberately omit this.
async function jump(next: number) {
  await server.store.pool.query(
    "UPDATE fatalfigures.rooms SET checkpoint=jsonb_set(checkpoint,'{heartbeat}',$1::jsonb) WHERE checkpoint->>'stage' NOT IN ('lobby','finished')",
    [JSON.stringify(next)],
  );
  time = next;
}
async function room(n = 2) {
  const cs = await Promise.all(Array.from({ length: n }, connect)),
    owner = await ok(cs[0], "create", { nickname: "Owner" }),
    caps = [owner];
  for (let i = 1; i < n; i++)
    caps.push(
      await ok(cs[i], "join", { nickname: `Guest${i}`, code: owner.code }),
    );
  await Promise.all(cs.map((s) => ok(s, "ready", { ready: true })));
  await ok(cs[0], "start");
  await jump(time + PRODUCTION.briefing);
  await waitFor(() => states.get(cs[0])?.stage === "choosing");
  return { cs, caps, code: owner.code };
}
beforeEach(async () => {
  time = 1000;
  states.clear();
  await resetDb();
  await boot();
});
afterEach(async () => {
  clients.forEach((s) => s.disconnect());
  clients = [];
  await server.close();
});
it("real clients lock privately, retry idempotently, reject conflicting multi-tab choices, then reveal together", async () => {
  const { cs, caps, code } = await room(3),
    id = states.get(cs[0])!.roundId,
    phase = states.get(cs[0])!.match!.phases[0];
  expect(phase).not.toHaveProperty("seed");
  const first = await ok(cs[0], "lock", { roundId: id, pick: 17 });
  expect(first.pick).toBe(17);
  expect((await ok(cs[1], "sync")).pick).toBeNull();
  expect(states.get(cs[1])!.match!.phases[0].rounds).toEqual([]);
  expect(JSON.stringify(states.get(cs[1]))).not.toContain('"pick":17');
  const retry = await ok(cs[0], "lock", { roundId: id, pick: 17 });
  expect(retry.retry).toBe(true);
  const tab = await connect();
  await ok(tab, "resume", { ...caps[0], after: 0 });
  expect((await ok(tab, "sync")).pick).toBe(17);
  expect((await ask(tab, "lock", { roundId: id, pick: 18 })).ok).toBe(false);
  await ok(cs[1], "lock", { roundId: id, pick: 45 });
  await ok(cs[2], "lock", { roundId: id, pick: 77 });
  await waitFor(() => states.get(cs[2])!.stage === "reveal");
  for (const s of cs)
    expect(
      states.get(s)!.match!.phases[0].rounds[0].rows.map((r) => r.pick),
    ).toEqual([17, 45, 77]);
  expect(
    (await server.store.pool.query("SELECT * FROM fatalfigures.choices"))
      .rowCount,
  ).toBe(3);
  expect((await server.store.read(code)).match!.phases[0].rounds).toHaveLength(
    1,
  );
});
it("capacity and start races are serialized, and host cannot change formula or see opponent picks", async () => {
  const owner = await connect(),
    cap = await ok(owner, "create", { nickname: "Owner" }),
    others = await Promise.all(Array.from({ length: 6 }, connect));
  const joins = await Promise.all(
    others.map((s, i) => ask(s, "join", { code: cap.code, nickname: `P${i}` })),
  );
  expect(joins.filter((x) => x.ok)).toHaveLength(4);
  const joined = [owner, ...others.filter((_, i) => joins[i].ok)];
  await Promise.all(joined.map((s) => ok(s, "ready", { ready: true })));
  const starts = await Promise.all([ask(owner, "start"), ask(owner, "start")]);
  expect(starts.filter((x) => x.ok)).toHaveLength(1);
  expect(
    (
      await ask(
        others.find((_, i) => !joins[i].ok)!,
        "lock",
        { roundId: "a", pick: 0 },
      )
    ).ok,
  ).toBe(false);
  expect((await server.store.read(cap.code)).match!.phases).toHaveLength(1);
});
it("room codes cannot reclaim seats, nickname is not identity, rooms and private receipts stay isolated", async () => {
  const a = await connect(),
    one = await ok(a, "create", { nickname: "Same" }),
    b = await connect(),
    two = await ok(b, "create", { nickname: "Same" }),
    c = await connect();
  expect(
    (
      await ask(c, "resume", {
        code: one.code,
        seatId: one.seatId,
        token: two.token,
      })
    ).ok,
  ).toBe(false);
  const other = await ok(c, "join", { code: one.code, nickname: "Same" });
  expect(other.seatId).not.toBe(one.seatId);
  const otherState = await ok(b, "sync");
  expect(otherState.state.code).toBe(two.code);
  expect(otherState.state.seats).toHaveLength(1);
  expect((await ask(b, "lock", { roundId: "foreign-round", pick: 0 })).ok).toBe(
    false,
  );
});
it("disconnect and refresh restore a seat and exact acknowledged pick without extending its deadline", async () => {
  const { cs, caps, code } = await room(2),
    s = states.get(cs[0])!,
    deadline = s.deadline;
  await ok(cs[0], "lock", { roundId: s.roundId, pick: 68 });
  cs[0].disconnect();
  time += 500;
  const refreshed = await connect(),
    v = await ok(refreshed, "resume", { ...caps[0], after: 0 });
  expect(v.pick).toBe(68);
  expect(v.state.deadline).toBe(deadline);
  expect(v.state.seats).toHaveLength(2);
  expect(v.events.length).toBeGreaterThan(0);
  const raw = JSON.stringify(v.events);
  expect(raw).not.toContain('"pick":68');
  expect((await server.store.read(code)).picks[caps[0].seatId]).toBe(68);
});
it("rejects receipt at the exact deadline and applies timeout only once", async () => {
  const { cs, code } = await room(2),
    s = states.get(cs[0])!;
  await jump(s.deadline);
  expect((await ask(cs[0], "lock", { roundId: s.roundId, pick: 1 })).ok).toBe(
    false,
  );
  await waitFor(() => states.get(cs[0])!.stage === "reveal");
  time += 100;
  await new Promise((r) => setTimeout(r, 80));
  const r = await server.store.read(code);
  expect(r.match!.phases[0].rounds).toHaveLength(1);
  expect(r.match!.phases[0].scores).toEqual(
    Object.fromEntries(r.seats.map((s) => [s.id, -2])),
  );
});
it("restart against the same real store preserves lock/history; a longer outage records Interrupted without new penalties", async () => {
  const { cs, caps, code } = await room(3),
    s = states.get(cs[0])!;
  await ok(cs[0], "lock", { roundId: s.roundId, pick: 39 });
  const before = await server.store.read(code);
  await server.close();
  clients.forEach((c) => c.disconnect());
  time += 1000;
  await boot();
  const resumed = await connect(),
    v = await ok(resumed, "resume", caps[0]);
  expect(v.pick).toBe(39);
  expect(v.state.deadline).toBe(before.deadline);
  expect(v.state.match.id).toBe(before.match!.id);
  await server.close();
  clients.forEach((c) => c.disconnect());
  time = before.deadline + 1000;
  await boot();
  const after = await connect(),
    result = await ok(after, "resume", caps[0]);
  expect(result.state.match.status).toBe("Interrupted");
  expect(result.pick).toBe(39);
  expect(
    (await ok(after, "lock", { roundId: before.roundId, pick: 39 })).retry,
  ).toBe(true);
  expect(
    (await ask(after, "lock", { roundId: before.roundId, pick: 40 })).ok,
  ).toBe(false);
  expect(JSON.stringify(result.state)).not.toContain('"pick":39');
  expect(result.state.match.phases[0].rounds).toHaveLength(0);
  expect(Object.values(result.state.match.phases[0].scores)).toEqual([0, 0, 0]);
  const receipts = await server.store.pool.query(
    "SELECT pick FROM fatalfigures.choices WHERE match_id=$1",
    [before.match!.id],
  );
  expect(receipts.rows).toEqual([{ pick: 39 }]);
  expect((await server.store.read(code)).match!.champion).toBeUndefined();
});
it("transfers host after lobby departure and abandons an empty live human room without a champion", async () => {
  const a = await connect(),
    cap = await ok(a, "create", { nickname: "A" }),
    b = await connect();
  await ok(b, "join", { code: cap.code, nickname: "B" });
  a.disconnect();
  await waitFor(() => states.get(b)?.host !== cap.seatId);
  await ok(b, "ready", { ready: true });
  const c = await connect();
  await ok(c, "resume", cap);
  await ok(c, "ready", { ready: true });
  const host = states.get(b)!.host === cap.seatId ? c : b;
  await ok(host, "start");
  b.disconnect();
  c.disconnect();
  await new Promise((r) => setTimeout(r, 40));
  await jump(time + PRODUCTION.abandon + 1);
  await new Promise((r) => setTimeout(r, 100));
  expect((await server.store.read(cap.code)).match!.status).toBe("Abandoned");
});
it("a real restart retains completed phase history and earned handicaps, and an eliminated seat cannot submit", async () => {
  const { cs, caps, code } = await room(3);
  for (let i = 0; i < 30; i++) {
    const s = states.get(cs[0])!;
    if (s.stage === "choosing" && s.match!.phases.length === 2) break;
    if (s.stage === "choosing") {
      for (let j = 0; j < 3; j++)
        await ok(cs[j], "lock", { roundId: s.roundId, pick: [10, 35, 90][j] });
      await waitFor(() => states.get(cs[0])!.stage === "reveal");
    }
    const before = states.get(cs[0])!,
      key = `${before.stage}:${before.roundId}:${before.match!.phases.length}`;
    await jump(before.deadline);
    await waitFor(() => {
      const v = states.get(cs[0])!;
      return `${v.stage}:${v.roundId}:${v.match!.phases.length}` !== key;
    });
  }
  const s = states.get(cs[0])!;
  expect(s.match!.phases).toHaveLength(2);
  expect(s.stage).toBe("choosing");
  expect((await ask(cs[2], "lock", { roundId: s.roundId, pick: 1 })).ok).toBe(
    false,
  );
  await ok(cs[0], "lock", { roundId: s.roundId, pick: 78 });
  const checkpoint = await server.store.read(code);
  expect(Object.values(checkpoint.match!.phases[1].handicaps).sort()).toEqual([
    -1, 0,
  ]);
  await server.close();
  clients.forEach((c) => c.disconnect());
  time += 1000;
  await boot();
  const client = await connect(),
    resumed = await ok(client, "resume", caps[0]);
  expect(resumed.pick).toBe(78);
  expect(resumed.state.match.phases).toEqual(s.match!.phases);
  expect(resumed.state.deadline).toBe(checkpoint.deadline);
});

it("a live authority stall interrupts instead of fast-forwarding fictitious losses", async () => {
  const { cs, code } = await room(3),
    s = states.get(cs[0])!;
  await ok(cs[0], "lock", { roundId: s.roundId, pick: 37 });
  time += 10001;
  await waitFor(() => states.get(cs[0])?.stage === "finished");
  const r = await server.store.read(code);
  expect(r.match!.status).toBe("Interrupted");
  expect(r.match!.phases[0].rounds).toHaveLength(0);
  expect(Object.values(r.match!.phases[0].scores)).toEqual([0, 0, 0]);
  expect(
    (await server.store.pool.query("SELECT pick FROM fatalfigures.choices"))
      .rows,
  ).toEqual([{ pick: 37 }]);
});
