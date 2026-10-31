import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  PRODUCTION,
  advance,
  createRoom,
  start,
  activePhase,
  lock,
  performance,
  recover,
  rematch,
  snapshot,
  type Room,
  type Seat,
} from "../shared/engine.js";
import { q, handicaps } from "../shared/rules.js";
const seats = (n: number) =>
  Array.from({ length: n }, (_, i): Seat => ({
    id: `seat-${i}`,
    nickname: `P${i}`,
    tokenHash: "x",
    ready: true,
    withdrawn: false,
    connected: true,
  }));
export function game(n: number) {
  const list = seats(n),
    r = createRoom("ABC234", list[0], 0);
  r.seats = list;
  let seq = 0;
  const entropy = () => `independent-phase-${seq++}`;
  start(r, list[0].id, 0, "match-id", entropy);
  return { r, entropy };
}
function finish(r: Room, entropy: () => string, onChoose?: (r: Room) => void) {
  let now = 0,
    steps = 0;
  while (r.match!.status === "playing") {
    if (++steps > 120) throw Error("Unbounded match");
    now = r.deadline;
    if (r.stage === "choosing") onChoose?.(r);
    advance(r, now, entropy);
  }
  return now;
}
describe("phase lifecycle and finite clocks", () => {
  for (const n of [2, 3, 4, 5])
    it(`${n} seats: all timeouts, every tiebreak, exactly one elimination per phase within production budget`, () => {
      const { r, entropy } = game(n),
        end = finish(r, entropy);
      expect(end).toBe((n - 1) * (3 * 120000 + 45000 + 25000));
      expect(end).toBeLessThan(1740001);
      expect(r.match!.phases).toHaveLength(n - 1);
      expect(r.match!.status).toBe("champion");
      for (const p of r.match!.phases) {
        expect(p.rounds).toHaveLength(3);
        expect(p.tiebreak).not.toBeNull();
        expect(p.draw?.candidates).toEqual([...p.active].sort());
        expect(p.eliminated).toBeTruthy();
        expect(p.revealedSeed).toBe(p.seed);
        for (const id of p.active) {
          expect(p.handicaps[id]).toBe(0);
          expect(p.scores[id]).toBe(
            p.handicaps[id] +
              p.rounds.reduce(
                (v, r) => v + r.rows.find((x) => x.seatId === id)!.delta,
                0,
              ),
          );
        }
      }
      expect(new Set(r.match!.phases.map((p) => p.seed)).size).toBe(n - 1);
    });
  it("uses actual start count, all-zero initial scores, and exactly three main rounds", () => {
    for (const n of [2, 3, 4, 5]) {
      const { r, entropy } = game(n);
      expect(activePhase(r)!.active).toHaveLength(n);
      expect(Object.values(activePhase(r)!.scores).every((v) => v === 0)).toBe(
        true,
      );
      finish(r, entropy);
      expect(r.match!.phases.flatMap((p) => p.rounds)).toHaveLength(
        (n - 1) * 3,
      );
    }
  });
  it("rejects obsolete, eliminated, nonparticipant, malformed and boundary-deadline locks", () => {
    const { r, entropy } = game(3);
    advance(r, r.deadline, entropy);
    const at = 15001;
    expect(() => lock(r, "outsider", r.roundId, 0, at)).toThrow("cannot act");
    expect(() => lock(r, "seat-0", "old", 0, at)).toThrow("ended");
    expect(() => lock(r, "seat-0", r.roundId, "0", at)).toThrow("whole");
    expect(() => lock(r, "seat-0", r.roundId, 0, r.deadline)).toThrow(
      "deadline",
    );
    lock(r, "seat-0", r.roundId, 35, at);
    expect(lock(r, "seat-0", r.roundId, 35, at).retry).toBe(true);
    expect(() => lock(r, "seat-0", r.roundId, 36, at)).toThrow("already");
  });
  it("resolves exactly once despite late timer callbacks", () => {
    const { r, entropy } = game(3);
    advance(r, r.deadline, entropy);
    const deadline = r.deadline;
    advance(r, deadline + 100, entropy);
    expect(activePhase(r)!.rounds).toHaveLength(1);
    const before = structuredClone(activePhase(r)!.scores);
    advance(r, deadline + 200, entropy);
    expect(activePhase(r)!.scores).toEqual(before);
    expect(activePhase(r)!.rounds).toHaveLength(1);
  });
  it("reveals early only when every required participant locked", () => {
    const { r, entropy } = game(2);
    advance(r, 15000, entropy);
    lock(r, "seat-0", r.roundId, 0, 15001);
    expect(advance(r, 15002, entropy)).toBe(false);
    lock(r, "seat-1", r.roundId, 34, 15003);
    expect(advance(r, 15003, entropy)).toBe(true);
    expect(r.stage).toBe("reveal");
    expect(r.deadline).toBe(35003);
  });
  it("assigns fresh survivor handicaps from main performance, with no historical stacking", () => {
    const { r, entropy } = game(5);
    finish(r, entropy, (r) => {
      for (const [i, id] of (r.tie
        ? r.tieIds
        : activePhase(r)!.active
      ).entries())
        lock(r, id, r.roundId, [20, 35, 40, 50, 80][i], r.deadline - 1);
    });
    for (let i = 1; i < r.match!.phases.length; i++) {
      const prev = r.match!.phases[i - 1],
        p = r.match!.phases[i];
      expect(p.handicaps).toEqual(
        handicaps(
          performance(prev).filter((s) => s.id !== prev.eliminated),
          prev.rule,
        ),
      );
      expect(
        Object.values(p.handicaps).every(
          (v) => v <= 0 && v >= -(p.active.length - 1),
        ),
      ).toBe(true);
    }
    const final = r.match!.phases.at(-1)!;
    expect(Object.values(final.handicaps).sort()).toEqual([-1, 0]);
  });
  it("tiebreak only involves bottom ties and never adds main-phase losses", () => {
    const { r, entropy } = game(3);
    let saw = false;
    finish(r, entropy, (r) => {
      if (r.tie) {
        saw = true;
        const before = { ...activePhase(r)!.scores };
        for (const id of r.tieIds) lock(r, id, r.roundId, 0, r.deadline - 1);
        expect(activePhase(r)!.scores).toEqual(before);
      }
    });
    expect(saw).toBe(true);
  });
  it("keeps all hidden input and future seed/bot plans outside public payloads", () => {
    const { r, entropy } = game(3);
    advance(r, r.deadline, entropy);
    lock(r, "seat-0", r.roundId, 77, 15001);
    r.botPlans["seat-1"] = { pick: 91, at: 20000 };
    const pub = snapshot(r, 15001);
    expect(pub.locked).toEqual(["seat-0"]);
    expect(pub.match!.phases[0]).not.toHaveProperty("seed");
    expect(pub).not.toHaveProperty("picks");
    expect(pub).not.toHaveProperty("botPlans");
    expect(pub.seats[0]).not.toHaveProperty("tokenHash");
    expect(pub.match!.phases[0].rounds).toEqual([]);
  });
  it("short restart retains lock and clock; long restart interrupts without fictitious losses", () => {
    const { r, entropy } = game(3);
    advance(r, r.deadline, entropy);
    lock(r, "seat-0", r.roundId, 0, 15001);
    r.heartbeat = 15001;
    const deadline = r.deadline;
    recover(r, 19000);
    expect(r.match!.status).toBe("playing");
    expect(r.picks["seat-0"]).toBe(0);
    expect(r.deadline).toBe(deadline);
    recover(r, deadline + 1);
    expect(r.match!.status).toBe("Interrupted");
    expect(activePhase(r)!.rounds).toHaveLength(0);
    expect(activePhase(r)!.scores["seat-0"]).toBe(0);
  });
  it("watchdog interrupts without a champion and wholly abandoned rooms terminate", () => {
    const { r, entropy } = game(5);
    advance(r, 1800000, entropy);
    expect(r.match!.status).toBe("Interrupted");
    expect(r.match!.champion).toBeUndefined();
    const g = game(2);
    g.r.emptySince = 1;
    advance(g.r, 60001, g.entropy);
    expect(g.r.match!.status).toBe("Abandoned");
  });
  it("rematch archives old identity and resets choices and handicap", () => {
    const { r, entropy } = game(2);
    finish(r, entropy);
    const old = structuredClone(r.match);
    rematch(r, r.host);
    expect(r.history[0]).toEqual(old);
    expect(r.stage).toBe("lobby");
    expect(r.match).toBeNull();
    r.seats.forEach((s) => (s.ready = true));
    start(r, r.host, 2000000, randomUUID(), entropy);
    expect(r.match!.id).not.toBe(old!.id);
    expect(activePhase(r)!.scores).toEqual({ "seat-0": 0, "seat-1": 0 });
    expect(r.picks).toEqual({});
  });
  it("never allows a readiness gate after start", () => {
    const { r, entropy } = game(2);
    r.seats.forEach((s) => (s.ready = false));
    expect(finish(r, entropy)).toBe(430000);
  });
});
import { verifyReplay } from "../shared/replay.js";
it("independently recomputes replay and rejects tampered scores or random candidates", () => {
  for (const n of [2, 3, 4, 5]) {
    const { r, entropy } = game(n);
    finish(r, entropy);
    const replay = snapshot(r, r.match!.finishedAt!).match!;
    expect(verifyReplay(replay)).toBe(true);
    const bad = structuredClone(replay);
    bad.phases[0].rounds[0].rows[0].delta--;
    expect(verifyReplay(bad)).toBe(false);
    const wrong = structuredClone(replay);
    wrong.phases[0].draw!.candidates.pop();
    expect(verifyReplay(wrong)).toBe(false);
  }
});
it("full-match outcomes and handicaps are invariant to reversed seat/join order with fixed choices and entropy", () => {
  for (const n of [2, 3, 4, 5])
    for (const style of ["timeout", "equal", "distinct"]) {
      function run(reverse: boolean) {
        const list = seats(n);
        if (reverse) list.reverse();
        const r = createRoom("ABC234", list[0], 0);
        r.seats = list;
        let seed = 0;
        const entropy = () => `order-invariance-${seed++}`;
        start(r, r.host, 0, "same-match", entropy);
        finish(r, entropy, (r) => {
          if (style === "timeout") return;
          for (const id of r.tie ? r.tieIds : activePhase(r)!.active)
            lock(
              r,
              id,
              r.roundId,
              style === "equal" ? 0 : Number(id.split("-")[1]) * 17,
              r.deadline - 1,
            );
        });
        return r.match!;
      }
      const a = run(false),
        b = run(true);
      expect(a.champion).toBe(b.champion);
      expect(a.phases.map((p) => p.eliminated)).toEqual(
        b.phases.map((p) => p.eliminated),
      );
      expect(a.phases.map((p) => p.handicaps)).toEqual(
        b.phases.map((p) => p.handicaps),
      );
    }
});
