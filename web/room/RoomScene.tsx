import React, { memo, useId } from "react";
import type { Snapshot } from "../../shared/engine";
import { decimal } from "../../shared/rules";
import {
  eliminatedSeats,
  seatPhase,
  seatPositions,
  type Revealed,
} from "./model";
export type RoomEffects = {
  locks: string[];
  scores: string[];
  eliminated: string[];
  reveal: boolean;
  champion: boolean;
};
export const QUIET: RoomEffects = {
  locks: [],
  scores: [],
  eliminated: [],
  reveal: false,
  champion: false,
};
const colours = ["#dcff73", "#b4c6ff", "#ffbc98", "#b9e6d7", "#e2bcff"];
function Avatar() {
  const id = useId();
  return (
    <svg viewBox="0 0 80 84" aria-hidden="true">
      <defs>
        <linearGradient id={id} x2="0" y2="1">
          <stop stopColor="#909e7f" />
          <stop offset="1" stopColor="#344332" />
        </linearGradient>
      </defs>
      <path
        d="M8 81c0-18 8-29 21-32L19 26 27 7h26l8 19-10 23c13 3 21 14 21 32"
        fill={`url(#${id})`}
        stroke="currentColor"
      />
      <path
        d="m27 25 13-8 13 8-4 22-9 9-9-9Z"
        fill="#101510"
        stroke="currentColor"
        strokeOpacity=".9"
      />
      <path d="m30 33 7 2m6 0 7-2" stroke="currentColor" strokeWidth="2" />
      <path d="m21 67 19-9 19 9M40 60v21" stroke="currentColor" fill="none" />
    </svg>
  );
}
export const RoomScene = memo(function RoomScene({
  state,
  meId,
  latest,
  effects,
  dimmed,
}: {
  state: Snapshot;
  meId: string;
  latest: Revealed | null;
  effects: RoomEffects;
  dimmed: boolean;
}) {
  const players = state.match!.players,
    p = state.match!.phases.at(-1)!,
    eliminated = eliminatedSeats(state),
    positions = seatPositions[players.length];
  const showCards =
    ["reveal", "intermission", "phaseEnd", "finished"].includes(state.stage) &&
    latest?.phase === p.index &&
    latest.result.id === state.roundId;
  return (
    <div
      className={`room-scene ${dimmed ? "is-dimmed" : ""}`}
      data-testid="room-scene"
      data-match={state.match!.id}
      data-seat-count={players.length}
      aria-label="Oval table with fixed player seats"
    >
      <div className="room-architecture" aria-hidden="true">
        <div className="wall-lines" />
        <div className="ceiling-light" />
        <div className="room-floor" />
      </div>
      <div className={`oval-table ${effects.reveal ? "target-lit" : ""}`}>
        <div className="table-rail" />
        <div className="table-inscription">
          <span>FATAL FIGURES</span>
          <b>
            {latest?.result.target
              ? decimal(latest.result.target)
              : p.rule === "circle"
                ? "↻"
                : "◈"}
          </b>
          <small>
            {latest
              ? `P${latest.phase} · ${latest.tiebreak ? "TIEBREAK" : `R${latest.round}`} · ${showCards ? "REVEALED" : "PREVIOUS RESULT"}`
              : "READ THE ROOM"}
          </small>
          {latest && (
            <small className="centre-outcome">
              {latest.result.target
                ? "TARGET"
                : latest.result.rows.some((r) => r.winner)
                  ? latest.result.rows
                      .filter((r) => r.winner)
                      .map(
                        (r) => players.find((p) => p.id === r.seatId)?.nickname,
                      )
                      .join(" & ") + " WINS"
                  : "NO WINNER"}
            </small>
          )}
        </div>
      </div>
      {players.map((player, index) => {
        const current = state.seats.find((s) => s.id === player.id),
          past = seatPhase(state, player.id)!,
          out = eliminated.includes(player.id),
          live = p.active.includes(player.id),
          row = showCards
            ? latest?.result.rows.find((r) => r.seatId === player.id)
            : undefined,
          locked =
            state.stage === "choosing" && state.locked.includes(player.id),
          status = out
            ? "Eliminated"
            : current?.withdrawn
              ? "Withdrawn"
              : !current?.connected
                ? "Disconnected"
                : state.stage === "choosing"
                  ? state.tie && !state.tieIds.includes(player.id)
                    ? "Watching tiebreak"
                    : locked
                      ? "Locked"
                      : "Choosing"
                  : state.stage === "finished" &&
                      state.match!.champion === player.id
                    ? "Champion"
                    : "At the table";
        return (
          <div
            key={player.id}
            data-seat-id={player.id}
            data-seat-index={index}
            data-seat-edge={
              positions[index][0] < 20
                ? "left"
                : positions[index][0] > 80
                  ? "right"
                  : "none"
            }
            data-seat-zone={positions[index][1] < 25 ? "north" : "side"}
            data-status={status.toLowerCase()}
            className={`fixed-seat ${out ? "is-eliminated" : ""} ${effects.eliminated.includes(player.id) ? "spotlight-fading" : ""} ${row?.winner ? "round-winner" : ""} ${state.match!.champion === player.id && state.stage === "finished" ? "is-champion" : ""}`}
            style={
              {
                left: `${positions[index][0]}%`,
                top: `${positions[index][1]}%`,
                "--seat-accent": colours[index],
              } as React.CSSProperties
            }
          >
            <div className="seat-light" aria-hidden="true" />
            <div className="avatar">
              <Avatar />
            </div>
            <div className="seat-name">
              {player.nickname}
              <small>
                {player.id === meId
                  ? "YOU"
                  : player.bot
                    ? "BOT"
                    : `0${index + 1}`}
              </small>
            </div>
            <div
              className={`seat-score ${effects.scores.includes(player.id) ? "score-shift" : ""}`}
              aria-label={`${player.nickname} phase total ${past.scores[player.id]}`}
            >
              <span>PHASE TOTAL</span>
              <b>{past.scores[player.id]}</b>
              <small>
                {live ? `PHASE ${past.index}` : `FINAL · P${past.index}`}
              </small>
            </div>
            <span className="seat-status">{status}</span>
            {
              <div
                className={`number-card ${!row && !locked ? "is-empty" : ""} ${row ? "is-open" : ""} ${effects.locks.includes(player.id) ? "card-arriving" : ""} ${row && effects.reveal ? "card-revealing" : ""}`}
                aria-label={
                  row
                    ? `${player.nickname} revealed ${row.pick ?? "timeout"}`
                    : `${player.nickname} ${locked ? "sealed card" : status.toLowerCase()}`
                }
              >
                <span className="figure-label">FIGURE</span>
                <div className="card-inner">
                  <div className="card-back" aria-hidden={!!row}>
                    {locked ? "◈" : "—"}
                    <small>
                      {locked
                        ? "SEALED"
                        : out
                          ? "OUT"
                          : state.stage === "choosing"
                            ? "CHOOSING"
                            : "WAITING"}
                    </small>
                  </div>
                  <div className="card-face" aria-hidden={!row}>
                    {row?.pick ?? "—"}
                    <small>
                      {row?.status === "timeout"
                        ? "TIMEOUT"
                        : row?.winner
                          ? "WINNER"
                          : "REVEALED"}
                    </small>
                  </div>
                </div>
              </div>
            }
          </div>
        );
      })}
      <div className="room-caption">
        PRIVATE TABLE <span>·</span> {players.length} FIXED SEATS <span>·</span>{" "}
        {state.practice ? "COMPUTER PLAY" : "FRIEND ROOM"}
      </div>
    </div>
  );
});
