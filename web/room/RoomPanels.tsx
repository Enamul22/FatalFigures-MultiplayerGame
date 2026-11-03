import { memo } from "react";
import type { Snapshot } from "../../shared/engine";
import { seatPhase } from "./model";
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
        <span>PHASE SCORE BREAKDOWN</span>
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
        Background music
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
