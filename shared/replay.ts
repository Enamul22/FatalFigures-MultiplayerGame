import assert from "node:assert/strict";
import { commitment, verifyDraw } from "./draw.js";
import { performance, type PublicMatch } from "./engine.js";
import {
  resolveRound,
  ruleFor,
  validPick,
  handicaps,
  comparePerformance,
  add,
  q,
  type Performance,
} from "./rules.js";
/** Recomputes every published effect; cannot prove a trusted server's timestamps. */
export function verifyReplay(match: PublicMatch): boolean {
  try {
    for (let i = 0; i < match.phases.length; i++) {
      const p = match.phases[i];
      assert.equal(p.rule, ruleFor(p.active.length));
      assert.equal(p.index, i + 1);
      if (i > 0)
        assert.deepEqual(
          [...p.active].sort(),
          match.phases[i - 1].active
            .filter((id) => id !== match.phases[i - 1].eliminated)
            .sort(),
        );
      const expectedHandicap =
        i === 0
          ? Object.fromEntries(p.active.map((id) => [id, 0]))
          : handicaps(
              performance(match.phases[i - 1]).filter(
                (s) => s.id !== match.phases[i - 1].eliminated,
              ),
              match.phases[i - 1].rule,
            );
      assert.deepEqual(p.handicaps, expectedHandicap);
      const totals = { ...p.handicaps },
        accuracy = Object.fromEntries(p.active.map((id) => [id, q(0)])),
        wins = Object.fromEntries(p.active.map((id) => [id, 0]));
      for (const [index, r] of p.rounds.entries()) {
        const picks = Object.fromEntries(
          r.rows
            .filter((x) => x.pick !== null)
            .map((x) => {
              assert(validPick(x.pick));
              return [x.seatId, x.pick!];
            }),
        );
        const expected = resolveRound(
          r.id,
          p.rule,
          p.active,
          picks,
          totals,
          index === 2 ? 2 : 1,
          r.resolvedAt,
        );
        assert.deepEqual(r, expected);
        for (const row of expected.rows) {
          totals[row.seatId] = row.total;
          accuracy[row.seatId] = add(accuracy[row.seatId], {
            n: row.accuracy.n * row.multiplier,
            d: row.accuracy.d,
          });
          wins[row.seatId] += Number(row.winner);
        }
      }
      assert(p.rounds.length <= 3);
      assert.deepEqual(p.scores, totals);
      assert.deepEqual(p.accuracy, accuracy);
      assert.deepEqual(p.wins, wins);
      if (p.eliminated) {
        assert.equal(p.rounds.length, 3);
        assert(p.revealedSeed);
        assert.equal(commitment(p.revealedSeed), p.commitment);
        const ranked = performance(p);
        assert.deepEqual(p.ranks, ranked);
        let risk = ranked
          .filter((x) => comparePerformance(x, ranked.at(-1)!, p.rule) === 0)
          .map((x) => x.id);
        if (risk.length > 1) {
          assert(p.tiebreak);
          const r = p.tiebreak,
            picks = Object.fromEntries(
              r.rows
                .filter((x) => x.pick !== null)
                .map((x) => [x.seatId, x.pick!]),
            );
          const expected = resolveRound(
            r.id,
            p.rule,
            risk,
            picks,
            Object.fromEntries(risk.map((id) => [id, 0])),
            1,
            r.resolvedAt,
            true,
          );
          assert.deepEqual(r, expected);
          const rankedTie: Performance[] = r.rows
            .map((row) => ({
              id: row.seatId,
              score: row.delta,
              accuracy: row.accuracy,
              wins: Number(row.winner),
            }))
            .sort((a, b) => comparePerformance(a, b, p.rule));
          risk = rankedTie
            .filter(
              (x) => comparePerformance(x, rankedTie.at(-1)!, p.rule) === 0,
            )
            .map((x) => x.id);
        }
        if (risk.length > 1) {
          assert(p.draw);
          assert.deepEqual(p.draw.candidates, [...risk].sort());
          assert.equal(p.draw.seed, p.revealedSeed);
          assert(verifyDraw(p.draw));
          assert.equal(p.eliminated, p.draw.eliminated);
        } else {
          assert.equal(p.eliminated, risk[0]);
          assert(!p.draw);
        }
      }
    }
    if (match.status === "champion") {
      const final = match.phases.at(-1)!;
      assert.equal(final.active.length, 2);
      assert.equal(
        match.champion,
        final.active.find((id) => id !== final.eliminated),
      );
    }
    return true;
  } catch {
    return false;
  }
}
