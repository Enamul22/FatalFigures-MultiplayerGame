import { describe, it, expect } from "vitest";
import {
  q,
  add,
  cmp,
  target,
  resolveRound,
  circle,
  winningRange,
  validPick,
  handicaps,
  ruleFor,
  type Rule,
} from "../shared/rules.js";
import { draw, verifyDraw, commitment } from "../shared/draw.js";
import { BOT_NAMES, botPick, rng } from "../shared/bots.js";
const ids = ["a", "b", "c", "d", "e"];
const round = (rule: Rule, picks: Record<string, number>, count = 5, m = 1) =>
  resolveRound("round", rule, ids.slice(0, count), picks, {}, m, 0);
describe("exact statistical targets", () => {
  it("matches the three approved fixtures", () => {
    expect(target("crowd", [20, 35, 40, 50, 80])).toEqual(q(36));
    expect(target("balance", [10, 30, 70, 90])).toEqual(q(45));
    expect(target("extremes", [10, 35, 90])).toEqual(q(35));
  });
  it("handles odd/even medians and missing picks without zeros", () => {
    expect(target("balance", [90, 10, 30])).toEqual(q(27));
    expect(target("balance", [10, 11])).toEqual(q(189, 20));
    expect(target("extremes", [9, 35, 90])).toEqual(q(693, 20));
    expect(target("crowd", [80])).toBeNull();
  });
  it("includes collisions in target while invalidating their rank", () => {
    const r = round("crowd", { a: 10, b: 10, c: 40, d: 50, e: 90 });
    expect(r.target).toEqual(q(32));
    expect(r.rows[0].status).toBe("collision");
    expect(r.rows[0].delta).toBe(-4);
    expect(r.rows.find((x) => x.winner)?.seatId).toBe("c");
  });
  it("uses competition ranks for exact equidistance", () => {
    const r = round("balance", { a: 40, b: 50, c: 10, d: 100 }, 4);
    expect(r.target).toEqual(q(81, 2));
    expect(r.rows[0].delta).toBe(0);
    const symmetric = round("extremes", { a: 15, b: 55, c: 85 }, 3);
    expect(symmetric.target).toEqual(q(35));
    expect(symmetric.rows[0].delta).toBe(0);
    expect(symmetric.rows[1].delta).toBe(0);
    expect(symmetric.rows[2].delta).toBe(-2);
  });
  it("ranking never uses a rounded UI target", () => {
    const r = round("crowd", { a: 20, b: 21, c: 22 }, 3);
    expect(r.target).toEqual(q(84, 5));
    for (const row of r.rows)
      expect(row.distance).toEqual(q(Math.abs(15 * row.pick! - 4 * 63), 15));
    expect(cmp(q(1, 3), q(3333, 10000))).toBe(1);
  });
  it("respects rank, multiplier and maximum deductions at every statistical seat count", () => {
    for (const n of [3, 4, 5])
      for (const m of [1, 2]) {
        const r = round(
          ruleFor(n),
          Object.fromEntries(ids.slice(0, n).map((id, i) => [id, i * 20 + 3])),
          n,
          m,
        );
        for (const row of r.rows) {
          expect(row.delta).toBe(-row.basePenalty * m || 0);
          expect(row.basePenalty).toBeLessThan(n);
          expect(row.total).toBe(row.startingScore + row.delta);
        }
      }
  });
  it("keeps zero a real submission and treats none, one, all duplicate explicitly", () => {
    const none = round("crowd", {});
    expect(none.target).toBeNull();
    expect(none.rows.every((r) => r.basePenalty === 5 && !r.winner)).toBe(true);
    const one = round("crowd", { a: 0 });
    expect(one.rows[0]).toMatchObject({
      status: "forfeit",
      pick: 0,
      delta: 0,
      distance: null,
      accuracy: q(0),
      winner: true,
    });
    expect(one.target).toBeNull();
    const all = round("extremes", { a: 0, b: 0, c: 0 }, 3, 2);
    expect(
      all.rows.every(
        (r) =>
          r.status === "collision" &&
          !r.winner &&
          r.delta === -4 &&
          r.accuracy.n === 101,
      ),
    ).toBe(true);
  });
  it("lets a sole unique eligible pick win among collisions", () => {
    const r = round("crowd", { a: 20, b: 20, c: 90, d: 90, e: 100 });
    expect(r.rows.find((r) => r.winner)?.seatId).toBe("e");
    expect(r.target).toEqual(q(256, 5));
  });
  it("rejects ambiguous/invalid picks", () => {
    for (const value of [
      "1",
      "",
      NaN,
      Infinity,
      -1,
      101,
      1.1,
      null,
      true,
      {},
      undefined,
    ])
      expect(validPick(value)).toBe(false);
    for (let i = 0; i <= 100; i++) expect(validPick(i)).toBe(true);
  });
  it("rational arithmetic is safe across all possible target denominator combinations", () => {
    for (let a = 1; a <= 50; a++)
      for (let b = 1; b <= 50; b++) {
        const r = add(q(101, a), q(202, b));
        expect(Number.isSafeInteger(r.n)).toBe(true);
        expect(cmp(r, q(101 * b + 202 * a, a * b))).toBe(0);
      }
  });
});
describe("101-position Final Circle", () => {
  it("exhausts 10,201 pairs: self draw, 50 wins, 50 losses, antisymmetry", () => {
    let draws = 0;
    for (let a = 0; a <= 100; a++) {
      let wins = 0,
        losses = 0;
      for (let b = 0; b <= 100; b++) {
        const r = circle(a, b);
        expect(r === 0 ? 0 : r).toBe(circle(b, a) === 0 ? 0 : -circle(b, a));
        if (r === 0) draws++;
        else if (r === 1) wins++;
        else losses++;
      }
      expect(wins).toBe(50);
      expect(losses).toBe(50);
    }
    expect(draws).toBe(101);
  });
  it("demonstrates the cycle and wrapped ranges", () => {
    expect(circle(0, 34)).toBe(1);
    expect(circle(34, 68)).toBe(1);
    expect(circle(68, 0)).toBe(1);
    expect(winningRange(68)).toBe("69–100 and 0–17");
    expect(winningRange(100)).toBe("0–49");
  });
  it("circle duplicates draw and timeouts lose twice ordinary loss", () => {
    expect(
      round("circle", { a: 30, b: 30 }, 2, 2).rows.map((r) => r.delta),
    ).toEqual([0, 0]);
    expect(
      round("circle", { a: 0, b: 34 }, 2, 2).rows.map((r) => r.delta),
    ).toEqual([0, -2]);
    expect(round("circle", { a: 0 }, 2, 2).rows.map((r) => r.delta)).toEqual([
      0, -4,
    ]);
    expect(round("circle", {}, 2, 2).rows.map((r) => r.delta)).toEqual([
      -4, -4,
    ]);
  });
});
describe("rank handicaps and committed fallback", () => {
  it("assigns competition handicaps, no arbitrary ordering for genuine ties", () => {
    const ps = [
      { id: "a", score: -1, accuracy: q(5), wins: 0 },
      { id: "b", score: -1, accuracy: q(5), wins: 0 },
      { id: "c", score: -2, accuracy: q(1), wins: 0 },
    ];
    expect(handicaps(ps, "crowd")).toEqual({ a: 0, b: 0, c: -2 });
    expect(handicaps(ps.reverse(), "crowd")).toEqual({ c: -2, b: 0, a: 0 });
  });
  it("reproduces draw, commitment, stable ordering and detects alteration", () => {
    const d = draw("secret", ["c", "a", "b"]);
    expect(d).toEqual(draw("secret", ["a", "b", "c"]));
    expect(d.commitment).toBe(commitment("secret"));
    expect(verifyDraw(d)).toBe(true);
    expect(verifyDraw({ ...d, index: (d.index + 1) % 3 })).toBe(false);
    expect(d.candidates).toEqual(["a", "b", "c"]);
  });
  it("has no seat-order bias and a broad deterministic frequency sanity check", () => {
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 6000; i++) {
      const d = draw(`seed-${i}`, ["c", "b", "a"]);
      counts[d.eliminated]++;
      expect(d.eliminated).toBe(draw(`seed-${i}`, ["a", "b", "c"]).eliminated);
    }
    for (const n of Object.values(counts)) expect(n).toBeGreaterThan(1800);
    for (const n of Object.values(counts)) expect(n).toBeLessThan(2200);
  });
  it("bots use public state only and always submit legal current-phase choices", () => {
    for (const bot of BOT_NAMES)
      for (const rule of Object.keys({
        crowd: 1,
        balance: 1,
        extremes: 1,
        circle: 1,
      }) as Rule[]) {
        const a = {
            rule,
            count: rule === "circle" ? 2 : 4,
            history: [],
            own: [],
            hiddenOpponents: [0, 1],
          },
          b = { ...a, hiddenOpponents: [99, 100] };
        expect(botPick(bot, a, rng(44))).toBe(botPick(bot, b, rng(44)));
        expect(validPick(botPick(bot, a, rng(48)))).toBe(true);
      }
  });
});
