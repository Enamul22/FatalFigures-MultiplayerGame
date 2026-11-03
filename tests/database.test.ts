import { beforeEach, it, expect } from "vitest";
import { Store, hash } from "../server/store.js";
import { createRoom } from "../shared/engine.js";
import { TEST_URL, resetDb } from "./db-helper.js";
beforeEach(resetDb);
it("real PostgreSQL rolls back failures and serializes competing room updates", async () => {
  const s = new Store(TEST_URL);
  await s.claim(TEST_URL);
  try {
    const room = createRoom(
      "ABC234",
      {
        id: "a",
        nickname: "A",
        tokenHash: hash("private"),
        ready: false,
        withdrawn: false,
        connected: true,
      },
      0,
    );
    await s.insert(room);
    await expect(
      s.change(
        "ABC234",
        () => 1,
        "bad",
        (r) => {
          r.notice = "must rollback";
          throw Error("failure");
        },
      ),
    ).rejects.toThrow("failure");
    expect((await s.read("ABC234")).notice).toBe("");
    await Promise.all(
      Array.from({ length: 20 }, () =>
        s.change(
          "ABC234",
          () => 2,
          "increment",
          (r) => {
            r.notice = String((Number(r.notice) || 0) + 1);
          },
        ),
      ),
    );
    const r = await s.read("ABC234");
    expect(r.notice).toBe("20");
    expect(r.version).toBe(20);
    expect(r.seq).toBe(20);
    const events = await s.events("ABC234", 0);
    expect(events.map((x) => x.seq)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
    expect(events.every((e) => !JSON.stringify(e).includes("tokenHash"))).toBe(
      true,
    );
  } finally {
    await s.close();
  }
});
it("refuses a second authoritative process against the same game store", async () => {
  const a = new Store(TEST_URL),
    b = new Store(TEST_URL);
  try {
    await a.claim(TEST_URL);
    await expect(b.claim(TEST_URL)).rejects.toThrow("one authoritative");
  } finally {
    await a.close();
    await b.close();
  }
});
it("fails safely without database configuration", () => {
  expect(() => new Store("")).toThrow("DATABASE_URL");
});

it("verifies committed draws after an actual PostgreSQL JSONB round trip", async () => {
  const { draw, verifyDraw } = await import("../shared/draw.js");
  const s = new Store(TEST_URL);
  try {
    const original = draw("jsonb-regression", ["c", "a", "b"]);
    const restored = (
      await s.pool.query("select $1::jsonb as value", [
        JSON.stringify(original),
      ])
    ).rows[0].value;
    expect(verifyDraw(restored)).toBe(true);
    expect(verifyDraw({ ...restored, eliminated: "tampered" })).toBe(false);
  } finally {
    await s.close();
  }
});
