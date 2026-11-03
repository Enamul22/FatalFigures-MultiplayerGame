import {
  add,
  cmp,
  q,
  comparePerformance,
  handicaps,
  resolveRound,
  ruleFor,
  validPick,
  type Q,
  type Rule,
  type RoundResult,
  type Performance,
} from "./rules.js";
import { commitment, draw, type Draw } from "./draw.js";
export type Seat = {
  id: string;
  nickname: string;
  tokenHash: string;
  ready: boolean;
  bot?: string;
  withdrawn: boolean;
  connected: boolean;
};
export type Stage =
  | "lobby"
  | "briefing"
  | "choosing"
  | "reveal"
  | "intermission"
  | "phaseEnd"
  | "finished";
export type Timing = {
  choose: number;
  reveal: number;
  intermission: number;
  briefing: number;
  phaseEnd: number;
  tieChoose: number;
  tieReveal: number;
  abandon: number;
  hard: number;
};
export const PRODUCTION: Timing = {
  choose: 90000,
  reveal: 20000,
  intermission: 10000,
  briefing: 15000,
  phaseEnd: 10000,
  tieChoose: 30000,
  tieReveal: 15000,
  abandon: 60000,
  hard: 1800000,
};
export type Phase = {
  index: number;
  rule: Rule;
  active: string[];
  handicaps: Record<string, number>;
  scores: Record<string, number>;
  accuracy: Record<string, Q>;
  wins: Record<string, number>;
  rounds: RoundResult[];
  tiebreak: RoundResult | null;
  seed: string;
  commitment: string;
  revealedSeed?: string;
  eliminated?: string;
  draw?: Draw;
  ranks?: Performance[];
};
export type Match = {
  players: { id: string; nickname: string; bot?: string }[];
  id: string;
  startedAt: number;
  finishedAt?: number;
  hardDeadline: number;
  status: "playing" | "champion" | "Abandoned" | "Interrupted";
  champion?: string;
  phases: Phase[];
};
export type Room = {
  code: string;
  version: number;
  host: string;
  seats: Seat[];
  practice: boolean;
  stage: Stage;
  deadline: number;
  roundId: string;
  roundNumber: number;
  tie: boolean;
  tieIds: string[];
  picks: Record<string, number>;
  botPlans: Record<string, { pick: number; at: number }>;
  match: Match | null;
  history: Match[];
  heartbeat: number;
  emptySince: number | null;
  timing: Timing;
  seq: number;
  notice: string;
};
export const activePhase = (r: Room) => r.match?.phases.at(-1);
export const participants = (r: Room) =>
  r.tie ? r.tieIds : (activePhase(r)?.active ?? []);
export function createRoom(
  code: string,
  seat: Seat,
  now: number,
  practice = false,
  timing = PRODUCTION,
): Room {
  return {
    code,
    version: 0,
    host: seat.id,
    seats: [seat],
    practice,
    stage: "lobby",
    deadline: 0,
    roundId: "",
    roundNumber: 0,
    tie: false,
    tieIds: [],
    picks: {},
    botPlans: {},
    match: null,
    history: [],
    heartbeat: now,
    emptySince: null,
    timing: { ...timing },
    seq: 0,
    notice: "",
  };
}
function openPhase(
  r: Room,
  ids: string[],
  h: Record<string, number>,
  seed: string,
  at: number,
) {
  const p: Phase = {
    index: r.match!.phases.length + 1,
    rule: ruleFor(ids.length),
    active: ids,
    handicaps: { ...h },
    scores: { ...h },
    accuracy: Object.fromEntries(ids.map((id) => [id, q(0)])),
    wins: Object.fromEntries(ids.map((id) => [id, 0])),
    rounds: [],
    tiebreak: null,
    seed,
    commitment: commitment(seed),
  };
  r.match!.phases.push(p);
  r.stage = "briefing";
  r.deadline = at + r.timing.briefing;
  r.roundNumber = 0;
  r.tie = false;
  r.tieIds = [];
  r.picks = {};
  r.botPlans = {};
  r.notice = `${ids.length} remain. New phase; the starting handicap applies once.`;
}
export function start(
  r: Room,
  actor: string,
  now: number,
  matchId: string,
  entropy: () => string,
) {
  if (r.stage !== "lobby" || r.host !== actor)
    throw Error("Only the lobby host can start");
  if (
    r.seats.length < 2 ||
    r.seats.length > 5 ||
    r.seats.some((s) => !s.ready || s.withdrawn)
  )
    throw Error("Need 2–5 ready players");
  r.match = {
    players: r.seats.map(({ id, nickname, bot }) => ({ id, nickname, bot })),
    id: matchId,
    startedAt: now,
    hardDeadline: now + r.timing.hard,
    status: "playing",
    phases: [],
  };
  r.emptySince = null;
  openPhase(
    r,
    r.seats.map((s) => s.id),
    Object.fromEntries(r.seats.map((s) => [s.id, 0])),
    entropy(),
    now,
  );
}
export function lock(
  r: Room,
  id: string,
  roundId: string,
  pick: unknown,
  now: number,
): { pick: number; retry: boolean } {
  if (!validPick(pick)) throw Error("Choose a whole number from 0 to 100");
  if (roundId !== r.roundId) throw Error("That round has ended");
  if (
    !participants(r).includes(id) ||
    r.seats.find((s) => s.id === id)?.withdrawn
  )
    throw Error("This seat cannot act");
  // A committed retry recovers its receipt, including after reveal, but cannot replace it.
  if (r.picks[id] !== undefined) {
    if (r.picks[id] !== pick) throw Error("Your number is already locked");
    return { pick, retry: true };
  }
  if (r.stage !== "choosing" || now >= r.deadline)
    throw Error("The lock deadline has passed");
  r.picks[id] = pick;
  return { pick, retry: false };
}
function openRound(r: Room, at: number, tie = false) {
  r.stage = "choosing";
  r.tie = tie;
  if (!tie) r.roundNumber++;
  r.roundId = `${r.match!.id}:${activePhase(r)!.index}:${tie ? "tie" : r.roundNumber}`;
  r.picks = {};
  r.botPlans = {};
  r.deadline = at + (tie ? r.timing.tieChoose : r.timing.choose);
  r.notice = tie
    ? "One tiebreak. Only tied-at-risk players choose. A committed draw resolves any remaining tie."
    : r.roundNumber === 3
      ? "Double stakes. Every deduction is doubled."
      : "Choose privately. A lock cannot be changed.";
}
export function performance(
  p: Pick<Phase, "active" | "scores" | "accuracy" | "wins" | "rule">,
): Performance[] {
  return p.active
    .map((id) => ({
      id,
      score: p.scores[id],
      accuracy: p.accuracy[id],
      wins: p.wins[id],
    }))
    .sort((a, b) => comparePerformance(a, b, p.rule));
}
function bottom(list: Performance[], rule: Rule): string[] {
  const worst = list.at(-1)!;
  return list
    .filter((p) => comparePerformance(p, worst, rule) === 0)
    .map((p) => p.id);
}
function finishPhase(
  r: Room,
  eliminated: string,
  at: number,
  entropy: () => string,
) {
  const p = activePhase(r)!;
  p.eliminated = eliminated;
  p.revealedSeed = p.seed;
  p.ranks = performance(p);
  r.stage = "phaseEnd";
  r.deadline = at + r.timing.phaseEnd;
  r.notice =
    "One elimination. Survivor handicaps follow main-phase performance; tiebreaks do not add points.";
  if (p.active.length === 2) {
    r.match!.champion = p.active.find((id) => id !== eliminated)!;
    r.match!.status = "champion";
    r.match!.finishedAt = at;
    r.stage = "finished";
    r.deadline = 0;
    r.notice = "The final figure stands.";
  }
}
function afterMain(r: Room, at: number, entropy: () => string) {
  const p = activePhase(r)!,
    ids = bottom(performance(p), p.rule);
  if (ids.length === 1) finishPhase(r, ids[0], at, entropy);
  else {
    r.tieIds = ids;
    openRound(r, at, true);
  }
}
function finishTiebreak(r: Room, at: number, entropy: () => string) {
  const t = activePhase(r)!.tiebreak!,
    rank = t.rows
      .map((row) => ({
        id: row.seatId,
        score: row.delta,
        accuracy: row.accuracy,
        wins: Number(row.winner),
      }))
      .sort((a, b) => comparePerformance(a, b, t.rule));
  const ids = bottom(rank, t.rule);
  const p = activePhase(r)!;
  if (ids.length > 1) {
    p.draw = draw(p.seed, ids);
    finishPhase(r, p.draw.eliminated, at, entropy);
  } else finishPhase(r, ids[0], at, entropy);
}
function resolve(r: Room, at: number, entropy: () => string) {
  const p = activePhase(r)!,
    result = resolveRound(
      r.roundId,
      p.rule,
      participants(r),
      r.picks,
      r.tie ? Object.fromEntries(r.tieIds.map((id) => [id, 0])) : p.scores,
      r.tie ? 1 : r.roundNumber === 3 ? 2 : 1,
      at,
      r.tie,
    );
  if (r.tie) p.tiebreak = result;
  else {
    p.rounds.push(result);
    for (const row of result.rows) {
      p.scores[row.seatId] = row.total;
      p.accuracy[row.seatId] = add(p.accuracy[row.seatId], {
        n: row.accuracy.n * row.multiplier,
        d: row.accuracy.d,
      });
      p.wins[row.seatId] += Number(row.winner);
    }
  }
  r.stage = "reveal";
  r.deadline = at + (r.tie ? r.timing.tieReveal : r.timing.reveal);
  r.notice = "Numbers revealed together. Results are committed.";
  // The final result and champion share one persisted transition. Earlier pacing
  // is untouched; a tied main final still reveals before its required tiebreak.
  if (p.active.length === 2) {
    if (r.tie) finishTiebreak(r, at, entropy);
    else if (r.roundNumber === 3) {
      const ids = bottom(performance(p), p.rule);
      if (ids.length === 1) finishPhase(r, ids[0], at, entropy);
    }
  }
}
export function terminate(
  r: Room,
  status: "Abandoned" | "Interrupted",
  now: number,
  reason: string,
) {
  if (r.match?.status === "playing") {
    r.match.status = status;
    r.match.finishedAt = now;
    r.stage = "finished";
    r.deadline = 0;
    r.notice = reason;
    // Retain the seat-private last-round choices for uncertain-ack recovery.
    // Public snapshots and replay never include these unresolved values.
    r.botPlans = {};
  }
}
/** At most one expired transition per call. Recovery never fabricates a backlog of rounds. */
export function advance(r: Room, now: number, entropy: () => string): boolean {
  if (!r.match || r.match.status !== "playing") return false;
  if (now >= r.match.hardDeadline) {
    terminate(
      r,
      "Interrupted",
      now,
      "The hard match deadline was reached. No champion was invented.",
    );
    return true;
  }
  if (r.emptySince !== null && now - r.emptySince >= r.timing.abandon) {
    terminate(
      r,
      "Abandoned",
      now,
      "All human seats left the room. Match history is preserved.",
    );
    return true;
  }
  if (r.stage === "choosing") {
    if (
      now < r.deadline &&
      !participants(r).every((id) => r.picks[id] !== undefined)
    )
      return false;
    resolve(r, now >= r.deadline ? r.deadline : now, entropy);
    return true;
  }
  if (now < r.deadline) return false;
  const at = r.deadline;
  if (r.stage === "briefing") openRound(r, at);
  else if (r.stage === "reveal") {
    if (r.tie) finishTiebreak(r, at, entropy);
    else if (activePhase(r)!.active.length === 2 && r.roundNumber === 3) {
      afterMain(r, at, entropy);
    } else {
      r.stage = "intermission";
      r.deadline = at + r.timing.intermission;
    }
  } else if (r.stage === "intermission") {
    if (r.roundNumber < 3) openRound(r, at);
    else afterMain(r, at, entropy);
  } else if (r.stage === "phaseEnd") {
    const p = activePhase(r)!;
    if (p.active.length === 2) {
      r.match.status = "champion";
      r.match.finishedAt = at;
      r.stage = "finished";
      r.deadline = 0;
      r.notice = "The final figure stands.";
    } else {
      const survivors = performance(p).filter((s) => s.id !== p.eliminated);
      openPhase(
        r,
        survivors.map((s) => s.id),
        handicaps(survivors, p.rule),
        entropy(),
        at,
      );
    }
  }
  return true;
}
export function recover(r: Room, now: number) {
  if (
    r.match?.status === "playing" &&
    (now - r.heartbeat > 10000 ||
      now >= r.deadline ||
      now >= r.match.hardDeadline)
  )
    terminate(
      r,
      "Interrupted",
      now,
      "Server interruption crossed the recovery window or a deadline. Acknowledged choices and resolved history were preserved; no catch-up penalties were applied.",
    );
  r.seats.forEach((s) => (s.connected = !!s.bot));
  r.emptySince = r.match?.status === "playing" ? now : null;
  r.heartbeat = now;
}
export function rematch(r: Room, actor: string) {
  if (r.stage !== "finished" || r.host !== actor)
    throw Error("Only the host can open a rematch after results");
  r.history.push(structuredClone(r.match!));
  r.match = null;
  r.stage = "lobby";
  r.deadline = 0;
  r.picks = {};
  r.botPlans = {};
  r.seats = r.seats
    .filter((s) => s.connected || s.bot || s.id === actor)
    .map((s) => ({ ...s, ready: !!s.bot, withdrawn: false }));
  r.notice =
    "New lobby. Everyone starts at zero. Previous results remain in History.";
}
export type PublicMatch = Omit<Match, "phases"> & {
  phases: Omit<Phase, "seed">[];
};
export function publicMatch(m: Match): PublicMatch {
  return {
    ...m,
    phases: m.phases.map(({ seed, ...p }) => ({ ...p, rounds: [...p.rounds] })),
  };
}
/** Explicit allowlist: never spread Room, Seat, picks or bot plans into public data. */
export function snapshot(r: Room, now: number) {
  const p = activePhase(r);
  return {
    code: r.code,
    version: r.version,
    seq: r.seq,
    host: r.host,
    practice: r.practice,
    stage: r.stage,
    serverTime: now,
    deadline: r.deadline,
    roundId: r.roundId,
    roundNumber: r.roundNumber,
    tie: r.tie,
    tieIds: r.tieIds,
    locked: r.stage === "choosing" ? Object.keys(r.picks) : [],
    seats: r.seats.map(
      ({ id, nickname, ready, bot, connected, withdrawn }) => ({
        id,
        nickname,
        ready,
        bot,
        connected,
        withdrawn,
      }),
    ),
    match: r.match ? publicMatch(r.match) : null,
    history: r.history.map(publicMatch),
    notice: r.notice,
    active: p?.active ?? [],
    commitment: p?.commitment ?? null,
  };
}
export type Snapshot = ReturnType<typeof snapshot>;
