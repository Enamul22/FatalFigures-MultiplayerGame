import { isDeepStrictEqual } from "node:util";
import { createHash } from "node:crypto";
export const commitment = (seed: string) =>
  createHash("sha256").update(seed).digest("hex");
export type Draw = {
  candidates: string[];
  seed: string;
  commitment: string;
  index: number;
  counter: number;
  eliminated: string;
};
/** Stable bytewise seat ordering; 32-bit rejection sampling avoids modulo bias. */
export function draw(seed: string, candidates: string[]): Draw {
  const sorted = [...candidates].sort();
  if (!sorted.length) throw Error("No candidates");
  const limit = 2 ** 32 - (2 ** 32 % sorted.length);
  let counter = 0,
    x: number;
  do {
    x = createHash("sha256")
      .update(`FatalFigures/v1:${seed}:${counter}`)
      .digest()
      .readUInt32BE(0);
    counter++;
  } while (x >= limit);
  const index = x % sorted.length;
  return {
    candidates: sorted,
    seed,
    commitment: commitment(seed),
    index,
    counter: counter - 1,
    eliminated: sorted[index],
  };
}
export function verifyDraw(d: Draw): boolean {
  // PostgreSQL JSONB preserves values, but not JavaScript property order.
  return isDeepStrictEqual(draw(d.seed, d.candidates), d);
}
