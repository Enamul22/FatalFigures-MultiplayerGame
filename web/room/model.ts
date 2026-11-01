import type { Snapshot } from "../../shared/engine";
import type { RoundResult } from "../../shared/rules";
export type Revealed = {
  phase: number;
  round: number;
  tiebreak: boolean;
  result: RoundResult;
};
export function latestRevealed(state: Snapshot): Revealed | null {
  return (
    state.match?.phases
      .flatMap((p) => [
        ...p.rounds.map((result, index) => ({
          phase: p.index,
          round: index + 1,
          tiebreak: false,
          result,
        })),
        ...(p.tiebreak
          ? [{ phase: p.index, round: 0, tiebreak: true, result: p.tiebreak }]
          : []),
      ])
      .at(-1) ?? null
  );
}
export function seatPhase(state: Snapshot, id: string) {
  return state.match?.phases.findLast((p) => p.active.includes(id));
}
export function eliminatedSeats(state: Snapshot) {
  return (
    state.match?.phases.flatMap((p) => (p.eliminated ? [p.eliminated] : [])) ??
    []
  );
}
export const seatPositions: Record<
  number,
  readonly (readonly [number, number])[]
> = {
  2: [
    [14, 53],
    [86, 53],
  ],
  3: [
    [50, 14],
    [18, 76],
    [82, 76],
  ],
  4: [
    [24, 20],
    [76, 20],
    [24, 80],
    [76, 80],
  ],
  5: [
    [50, 12],
    [84, 39],
    [74, 82],
    [26, 82],
    [16, 39],
  ],
};
