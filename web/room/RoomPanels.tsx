import { memo } from "react";
import type { Snapshot } from "../../shared/engine";
import { decimal, RULES } from "../../shared/rules";
import { RoundDisplay } from "../presentation";
import { seatPhase, type Revealed } from "./model";
import type { RoomAudio } from "./audio";
export const Scoreboard = memo(function Scoreboard({
  state,
  meId,
  shifts,
}: {
  state: Snapshot;
  meId: string;
  shifts: string[];
}) {
  return (
    <section className="room-scoreboard" aria-label="Phase scoreboard">
      <div className="scoreboard-heading">
        <span>THE LEDGER</span>
        <small>START + ROUNDS = TOTAL</small>
      </div>
      <div className="scoreboard-scroll">
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>Start</th>
              <th>Rounds</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {state.match!.players.map((player) => {
              const p = seatPhase(state, player.id)!,
                h = p.handicaps[player.id],
                total = p.scores[player.id],
                out = p.eliminated === player.id;
              return (
                <tr
                  key={player.id}
                  className={`${out ? "out" : ""} ${shifts.includes(player.id) ? "score-shift" : ""}`}
                >
                  <th scope="row">
                    {player.nickname}
                    {player.id === meId && <small> YOU</small>}
                    {player.bot && <small> CPU</small>}
                    <span>
                      {out ? `OUT · PHASE ${p.index}` : `PHASE ${p.index}`}
                    </span>
                  </th>
                  <td>{h}</td>
                  <td>{total - h}</td>
                  <td>{total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
});
export const LatestResult = memo(function LatestResult({
  latest,
  names,
}: {
  latest: Revealed | null;
  names: Record<string, string>;
}) {
  return (
    <section className="latest-result" aria-label="Latest revealed result">
      <div className="eyebrow">LATEST REVEALED RESULT</div>
      {latest ? (
        <>
          <h2>
            Phase {latest.phase} ·{" "}
            {latest.tiebreak ? "Tiebreak" : `Round ${latest.round}`}
          </h2>
          <p>
            {RULES[latest.result.rule].name} ·{" "}
            {latest.result.rule === "circle"
              ? "Circle duel"
              : latest.result.target
                ? `Target ${decimal(latest.result.target)}`
                : "No statistical target"}{" "}
            · {latest.result.multiplier}×
          </p>
          <div className="latest-picks">
            {latest.result.rows.map((row) => (
              <div key={row.seatId} className={row.winner ? "winner" : ""}>
                <span>{names[row.seatId]}</span>
                <b>{row.pick ?? "—"}</b>
                <small>
                  {row.status === "collision"
                    ? "DUPLICATE"
                    : row.status === "timeout"
                      ? "TIMEOUT"
                      : row.winner
                        ? "WINNER"
                        : row.status.toUpperCase()}{" "}
                  · {row.delta}
                </small>
              </div>
            ))}
          </div>
          <details>
            <summary>Calculation & deductions</summary>
            <RoundDisplay round={latest.result} names={names} />
          </details>
        </>
      ) : (
        <p className="empty-result">
          No figures revealed yet. Sealed choices stay private until the server
          reveals them.
        </p>
      )}
    </section>
  );
});
export function AudioControls({ audio }: { audio: RoomAudio }) {
  return (
    <div className="room-audio" aria-label="Room audio controls">
      <button
        type="button"
        className="text-button"
        aria-label="Room audio mute"
        aria-pressed={audio.muted}
        onClick={audio.toggle}
      >
        {audio.muted ? "♫ MUTED" : "♫ SOUND ON"}
      </button>
      <label>
        Volume
        <input
          aria-label="Room volume"
          type="range"
          min="0"
          max="1"
          step=".05"
          value={audio.volume}
          onChange={(e) => {
            audio.setVolume(+e.target.value);
            void audio.unlock();
          }}
        />
      </label>
      <label className="suspense-control">
        <input
          type="checkbox"
          checked={audio.suspense}
          onChange={(e) => {
            audio.setSuspense(e.target.checked);
            void audio.unlock();
          }}
        />
        Intermission suspense
      </label>
      {!audio.muted && audio.status !== "ready" && (
        <button
          type="button"
          className="text-button audio-status"
          onClick={() => void audio.unlock()}
        >
          {audio.status === "unavailable"
            ? "Audio unavailable · game continues"
            : "Tap to enable audio"}
        </button>
      )}
    </div>
  );
}
