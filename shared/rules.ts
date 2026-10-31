/** Exact, bounded rational arithmetic. Three rounds × at most five picks keeps
 * all reduced components and cross-products well inside Number.MAX_SAFE_INTEGER. */
export type Q = { n: number; d: number };
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
export function q(n: number, d = 1): Q {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d) || d <= 0)
    throw Error("Invalid rational");
  const g = gcd(n, d) || 1;
  return { n: n / g, d: d / g };
}
export const add = (a: Q, b: Q) => q(a.n * b.d + b.n * a.d, a.d * b.d);
export const mul = (a: Q, n: number) => q(a.n * n, a.d);
export const cmp = (a: Q, b: Q) => Math.sign(a.n * b.d - b.n * a.d);
export const decimal = (a: Q | null) =>
  a === null
    ? "—"
    : (a.n / a.d).toLocaleString("en-US", { maximumFractionDigits: 2 });
export const exact = (a: Q) => (a.d === 1 ? `${a.n}` : `${a.n}/${a.d}`);
export const distance = (pick: number, t: Q) =>
  q(Math.abs(pick * t.d - t.n), t.d);
export function validPick(p: unknown): p is number {
  return typeof p === "number" && Number.isInteger(p) && p >= 0 && p <= 100;
}
export type Rule = "crowd" | "balance" | "extremes" | "circle";
export const RULES: Record<
  Rule,
  {
    name: string;
    formula: string;
    description: string;
    example: string;
    accent: string;
  }
> = {
  crowd: {
    name: "The Crowd",
    formula: "Mean × 0.8",
    description:
      "Read the whole table. Aim for 80% of the average submitted number.",
    example: "20, 35, 40, 50, 80 → target 36",
    accent: "#dcff73",
  },
  balance: {
    name: "The Balance",
    formula: "Median × 0.9",
    description: "Read the middle. Aim for 90% of the median submitted number.",
    example: "10, 30, 70, 90 → target 45",
    accent: "#a8bdff",
  },
  extremes: {
    name: "The Extremes",
    formula: "Midrange × 0.7",
    description:
      "Read the edges. Aim for 70% of the midpoint between the smallest and largest picks.",
    example: "10, 35, 90 → target 35",
    accent: "#ffb18c",
  },
  circle: {
    name: "The Final Circle",
    formula: "Beat the next 50",
    description:
      "Your number beats the next 50 numbers clockwise, wrapping from 100 to 0. Equal numbers draw.",
    example: "0 beats 34 · 34 beats 68 · 68 beats 0",
    accent: "#e2a8ff",
  },
};
export const ruleFor = (count: number): Rule =>
  (
    ({ 5: "crowd", 4: "balance", 3: "extremes", 2: "circle" }) as Record<
      number,
      Rule
    >
  )[count];
export function target(rule: Rule, picks: number[]): Q | null {
  if (rule === "circle" || picks.length < 2) return null;
  const s = [...picks].sort((a, b) => a - b),
    m = s.length;
  if (rule === "crowd") return q(4 * s.reduce((a, b) => a + b, 0), 5 * m);
  if (rule === "balance")
    return m % 2
      ? q(9 * s[(m - 1) / 2], 10)
      : q(9 * (s[m / 2 - 1] + s[m / 2]), 20);
  return q(7 * (s[0] + s[m - 1]), 20);
}
export function circle(a: number, b: number): 0 | 1 | -1 {
  const d = (((b - a) % 101) + 101) % 101;
  return d === 0 ? 0 : d <= 50 ? 1 : -1;
}
export function winningRange(a: number): string {
  const first = (a + 1) % 101,
    last = (a + 50) % 101;
  return first <= last ? `${first}–${last}` : `${first}–100 and 0–${last}`;
}
export type RoundRow = {
  seatId: string;
  pick: number | null;
  status: "eligible" | "collision" | "timeout" | "forfeit" | "duel" | "draw";
  distance: Q | null;
  accuracy: Q;
  basePenalty: number;
  multiplier: number;
  delta: number;
  startingScore: number;
  total: number;
  winner: boolean;
};
export type RoundResult = {
  id: string;
  rule: Rule;
  participants: string[];
  multiplier: number;
  target: Q | null;
  rows: RoundRow[];
  tiebreak: boolean;
  resolvedAt: number;
};
export function resolveRound(
  id: string,
  rule: Rule,
  ids: string[],
  picks: Record<string, number>,
  scores: Record<string, number>,
  multiplier: number,
  now: number,
  tiebreak = false,
): RoundResult {
  const values = ids
    .filter((id) => picks[id] !== undefined)
    .map((id) => picks[id]);
  const t = target(rule, values);
  const counts = new Map<number, number>();
  values.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
  const eligible = ids.filter(
    (id) => picks[id] !== undefined && counts.get(picks[id]) === 1,
  );
  const rows = ids.map((seatId) => {
    const p = picks[seatId];
    let status: RoundRow["status"] = "timeout",
      d: Q | null = null,
      accuracy = q(101),
      base = ids.length,
      winner = false;
    if (p !== undefined) {
      if (values.length === 1) {
        status = "forfeit";
        base = 0;
        accuracy = q(0);
        winner = true;
      } else if (rule === "circle") {
        const opponent = ids.find((x) => x !== seatId)!;
        const result = circle(p, picks[opponent]);
        status = result === 0 ? "draw" : "duel";
        base = result === -1 ? 1 : 0;
        accuracy = q(0);
        winner = result === 1;
      } else if (counts.get(p)! > 1) {
        status = "collision";
        base = ids.length - 1;
      } else {
        status = "eligible";
        d = distance(p, t!);
        accuracy = d;
        base = eligible.filter(
          (other) => cmp(distance(picks[other], t!), d!) < 0,
        ).length;
        winner = base === 0;
      }
    }
    // Circle timeout is always 2; statistical timeout is active participant count.
    if (p === undefined && rule === "circle") base = 2;
    const delta = -base * multiplier || 0,
      startingScore = scores[seatId] ?? 0;
    return {
      seatId,
      pick: p ?? null,
      status,
      distance: d,
      accuracy,
      basePenalty: base,
      multiplier,
      delta,
      startingScore,
      total: startingScore + delta,
      winner,
    };
  });
  return {
    id,
    rule,
    participants: [...ids],
    multiplier,
    target: t,
    rows,
    tiebreak,
    resolvedAt: now,
  };
}
export type Performance = {
  id: string;
  score: number;
  accuracy: Q;
  wins: number;
};
export function comparePerformance(
  a: Performance,
  b: Performance,
  rule: Rule,
): number {
  return (
    b.score - a.score ||
    (rule === "circle" ? b.wins - a.wins : cmp(a.accuracy, b.accuracy))
  );
}
export function handicaps(
  survivors: Performance[],
  rule: Rule,
): Record<string, number> {
  return Object.fromEntries(
    survivors.map((p) => [
      p.id,
      -survivors.filter((other) => comparePerformance(other, p, rule) < 0)
        .length || 0,
    ]),
  );
}
