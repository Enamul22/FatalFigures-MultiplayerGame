import { writeFileSync } from "node:fs";
import {
  createRoom,
  start,
  advance,
  activePhase,
  lock,
  publicMatch,
  type Seat,
  type Match,
} from "../shared/engine.js";
import { BOT_NAMES, botPick, rng } from "../shared/bots.js";
import { commitment } from "../shared/draw.js";
import { verifyReplay } from "../shared/replay.js";
const perCount = Number(process.argv[2] || 1000);
if (!Number.isInteger(perCount) || perCount < 1000)
  throw Error("At least 1,000 matches per starting count are required");
function metrics(n: number): any {
  return {
    matches: 0,
    maxDurationMs: 0,
    minDurationMs: Infinity,
    totalDurationMs: 0,
    phases: 0,
    tiebreaks: 0,
    randomDraws: 0,
    submitted: 0,
    collisions: 0,
    circleRounds: 0,
    circleDrawRounds: 0,
    championsBySeat: Array(n).fill(0),
    championsByJoinPosition: Array(n).fill(0),
    strategySeats: {},
    strategyWins: {},
    finalStartsAtZero: 0,
    finalZeroStartWins: 0,
  };
}
function record(
  s: any,
  m: Match,
  time: number,
  strategies: string[],
  joinPosition: number,
) {
  s.matches++;
  s.maxDurationMs = Math.max(s.maxDurationMs, time);
  s.minDurationMs = Math.min(s.minDurationMs, time);
  s.totalDurationMs += time;
  s.championsBySeat[Number(m.champion!.split("-")[1])]++;
  s.championsByJoinPosition[joinPosition]++;
  for (let i = 0; i < strategies.length; i++) {
    s.strategySeats[strategies[i]] = (s.strategySeats[strategies[i]] || 0) + 1;
    if (m.champion === `seat-${i}`)
      s.strategyWins[strategies[i]] = (s.strategyWins[strategies[i]] || 0) + 1;
  }
  for (const p of m.phases) {
    s.phases++;
    s.tiebreaks += Number(!!p.tiebreak);
    s.randomDraws += Number(!!p.draw);
    for (const r of p.rounds) {
      s.submitted += r.rows.filter((x) => x.pick !== null).length;
      s.collisions += r.rows.filter((x) => x.status === "collision").length;
      if (r.rule === "circle") {
        s.circleRounds++;
        s.circleDrawRounds += Number(r.rows.every((x) => x.status === "draw"));
      }
    }
  }
  const final = m.phases.at(-1)!;
  if (new Set(Object.values(final.handicaps)).size > 1) {
    s.finalStartsAtZero++;
    s.finalZeroStartWins += Number(final.handicaps[m.champion!] === 0);
  }
}
function rates(s: any) {
  return {
    ...s,
    meanDurationMs: s.totalDurationMs / s.matches,
    tiebreakRate: s.tiebreaks / s.phases,
    collisionRate: s.submitted ? s.collisions / s.submitted : 0,
    circleDrawRate: s.circleDrawRounds / s.circleRounds,
  };
}
const report: any = {
  seed: "FatalFigures-review-v2",
  matchesPerCount: perCount,
  productionTiming: true,
  groups: [],
  interpretation:
    "Four strategy families (balanced, analyst/adapter, anchor/contrarian, homogeneous rotation), independently seeded public-information choices and randomized seat assignments. Every tenth match stresses all timeouts and every tenth+1 all identical picks; mixed cases include 4% per-seat timeouts. Scenario and family breakdowns separate deliberate stress from ordinary mixed play. Full choosing windows model duration ceilings, not typical human play length. Strategy outcomes and observed handicap advantage are not proof of balance or fun.",
};
for (const n of [2, 3, 4, 5]) {
  const aggregate = metrics(n),
    byScenario: Record<string, any> = {},
    byFamily: Record<string, any> = {};
  for (let match = 0; match < perCount; match++) {
    const random = rng(n * 100000 + match),
      family = ["balanced", "analysts", "disruptors", "homogeneous"][match % 4];
    const strategies = Array.from({ length: n }, (_, i) =>
      family === "analysts"
        ? ["Analyst", "Adapter"][(i + match) % 2]
        : family === "disruptors"
          ? ["Anchor", "Contrarian"][(i + match) % 2]
          : family === "homogeneous"
            ? BOT_NAMES[Math.floor(match / 4) % 4]
            : BOT_NAMES[(i + Math.floor(match / 4)) % 4],
    );
    const order = Array.from({ length: n }, (_, i) => i);
    for (let j = n - 1; j > 0; j--) {
      const k = Math.floor(random() * (j + 1));
      [order[j], order[k]] = [order[k], order[j]];
    }
    const seats: Seat[] = order.map((i) => ({
      id: `seat-${i}`,
      nickname: strategies[i],
      tokenHash: "simulation",
      ready: true,
      withdrawn: false,
      connected: true,
    }));
    const r = createRoom("SIM234", seats[0], 0, true);
    r.seats = seats;
    let phase = 0;
    const entropy = () => commitment(`${report.seed}:${n}:${match}:${phase++}`);
    start(r, seats[0].id, 0, `simulation-${n}-${match}`, entropy);
    const scenario =
      match % 10 === 0 ? "timeouts" : match % 10 === 1 ? "equal" : "mixed";
    let time = 0,
      guard = 0;
    while (r.match!.status === "playing") {
      if (++guard > 120) throw Error("Unbounded transition count");
      if (r.stage === "choosing") {
        const p = activePhase(r)!,
          participants = r.tie ? r.tieIds : p.active,
          history = r.match!.phases.flatMap((p) => [
            ...p.rounds,
            ...(p.tiebreak ? [p.tiebreak] : []),
          ]);
        const planned = participants.map((id) => {
          const i = Number(id.split("-")[1]),
            randomBot = rng(
              parseInt(
                commitment(`${report.seed}:${r.roundId}:${id}:bot`).slice(0, 8),
                16,
              ),
            );
          const view = {
            rule: p.rule,
            count: participants.length,
            history,
            own: history.flatMap((h) =>
              h.rows
                .filter((x) => x.seatId === id && x.pick !== null)
                .map((x) => x.pick!),
            ),
          };
          return {
            id,
            pick:
              scenario === "equal"
                ? 0
                : botPick(strategies[i], view, randomBot),
            submit:
              scenario !== "timeouts" &&
              (scenario === "equal" || randomBot() > 0.04),
          };
        });
        for (const a of planned)
          if (a.submit) lock(r, a.id, r.roundId, a.pick, r.deadline - 1);
      }
      time = r.deadline;
      advance(r, time, entropy);
    }
    const m = r.match!;
    if (
      m.status !== "champion" ||
      time > 1740000 ||
      !verifyReplay(publicMatch(m))
    )
      throw Error("Simulation invariant failed");
    const joinPosition = seats.findIndex((s) => s.id === m.champion);
    byScenario[scenario] ??= metrics(n);
    byFamily[family] ??= metrics(n);
    for (const stats of [aggregate, byScenario[scenario], byFamily[family]])
      record(stats, m, time, strategies, joinPosition);
  }
  const result = {
    seats: n,
    ...rates(aggregate),
    byScenario: Object.fromEntries(
      Object.entries(byScenario).map(([k, v]) => [k, rates(v)]),
    ),
    byFamily: Object.fromEntries(
      Object.entries(byFamily).map(([k, v]) => [k, rates(v)]),
    ),
  };
  report.groups.push(result);
  console.log(
    `${n} seats: ${perCount} matches; max ${(result.maxDurationMs / 60000).toFixed(2)}m; mixed tie phases ${(100 * result.byScenario.mixed.tiebreakRate).toFixed(2)}%; mixed collision rate ${(100 * result.byScenario.mixed.collisionRate).toFixed(2)}%`,
  );
}
writeFileSync(
  "docs/simulation-results.json",
  JSON.stringify(report, null, 2) + "\n",
);
