import {
  circle,
  target,
  distance,
  cmp,
  type Rule,
  type RoundResult,
} from "./rules.js";
export const BOT_NAMES = [
  "Anchor",
  "Analyst",
  "Contrarian",
  "Adapter",
] as const;
export type BotView = {
  rule: Rule;
  count: number;
  history: ReadonlyArray<RoundResult>;
  own: ReadonlyArray<number>;
};
/** Small independent RNG; bot randomness is unrelated to committed draw seeds. */
export function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function botPick(
  strategy: string,
  view: BotView,
  random: () => number,
): number {
  const history = structuredClone(view.history);
  const past = history.flatMap((r) =>
    r.rows.map((s) => s.pick).filter((x): x is number => x !== null),
  );
  if (strategy === "Anchor") return Math.floor(random() * 101);
  const typical = past.length
    ? past.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, past.length)
    : 42;
  if (view.rule === "circle") {
    const predictions = past.slice(-8);
    const candidates = Array.from({ length: 101 }, (_, i) => i);
    if (!predictions.length) return Math.floor(random() * 101);
    const scores = candidates.map((p) =>
      predictions.reduce((v, other) => v + circle(p, other), 0),
    );
    const best = Math.max(...scores);
    const options = candidates.filter((p) => scores[p] === best);
    return options[Math.floor(random() * options.length)];
  }
  if (strategy === "Contrarian")
    return Math.max(
      0,
      Math.min(
        100,
        Math.round((random() < 0.3 ? 85 : typical * 0.45) + random() * 12 - 6),
      ),
    );
  // Evaluate candidates with the current formula and public-history forecasts only.
  const projected = Array.from(
    { length: Math.max(1, view.count - 1) },
    (_, i) =>
      Math.max(
        0,
        Math.min(100, Math.round(typical + (i - (view.count - 2) / 2) * 11)),
      ),
  );
  const choices = Array.from({ length: 101 }, (_, p) => ({
    p,
    d: distance(p, target(view.rule, [...projected, p])!),
  })).sort((a, b) => cmp(a.d, b.d));
  const jitter =
    strategy === "Adapter"
      ? Math.floor(random() * 9) - 4
      : Math.floor(random() * 5) - 2;
  return Math.max(0, Math.min(100, choices[0].p + jitter));
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
