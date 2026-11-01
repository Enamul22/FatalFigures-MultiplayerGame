import React, { useState } from "react";
import {
  RULES,
  decimal,
  exact,
  winningRange,
  type Rule,
  type RoundResult,
} from "../shared/rules";
import type { PublicMatch } from "../shared/engine";
export function Glyph({
  kind = "crowd",
  size = 60,
}: {
  kind?: Rule;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth="1.5">
        {kind === "crowd" ? (
          <>
            <path d="M40 6 73 64H7Z" />
            <path d="m40 23 23 41H17Z" />
            <circle cx="40" cy="46" r="9" />
          </>
        ) : kind === "balance" ? (
          <>
            <circle cx="40" cy="40" r="30" />
            <path d="M10 40h60M40 10v60M19 19l42 42M19 61l42-42" />
          </>
        ) : kind === "extremes" ? (
          <>
            <path d="m40 5 35 35-35 35L5 40Z" />
            <path d="m40 20 20 20-20 20-20-20Z" />
          </>
        ) : (
          <>
            <circle cx="40" cy="40" r="31" />
            <circle cx="40" cy="40" r="21" />
            <path d="M40 9v18m31 13H53M40 71V53M9 40h18" />
          </>
        )}
      </g>
    </svg>
  );
}
export function Circle({ pick = 0, other }: { pick?: number; other?: number }) {
  const xy = (n: number, r = 89) => ({
    x: 120 + Math.sin((n / 101) * Math.PI * 2) * r,
    y: 120 - Math.cos((n / 101) * Math.PI * 2) * r,
  });
  return (
    <svg
      className="circle"
      viewBox="0 0 240 240"
      role="img"
      aria-label={`Number circle. ${pick} beats ${winningRange(pick)}`}
    >
      <circle
        cx="120"
        cy="120"
        r="89"
        fill="none"
        stroke="#303735"
        strokeWidth="1"
      />
      {Array.from({ length: 101 }, (_, i) => {
        const a = xy(i, 85),
          b = xy(i, i % 10 === 0 ? 96 : 91);
        return (
          <line
            key={i}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={
              (i - pick + 101) % 101 >= 1 && (i - pick + 101) % 101 <= 50
                ? "var(--accent)"
                : "#414946"
            }
            strokeWidth={(i - pick + 101) % 101 <= 50 ? 2 : 1}
          />
        );
      })}
      {[0, 25, 50, 75].map((n) => (
        <text
          key={n}
          {...xy(n, 108)}
          fill="#a3ada8"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="10"
        >
          {n}
        </text>
      ))}
      <circle
        {...{ cx: xy(pick).x, cy: xy(pick).y }}
        r="6"
        fill="var(--accent)"
      />
      {other !== undefined && (
        <circle cx={xy(other).x} cy={xy(other).y} r="5" fill="#fff" />
      )}
      <text
        x="120"
        y="118"
        textAnchor="middle"
        fill="var(--accent)"
        fontSize="42"
        fontFamily="monospace"
      >
        {pick}
      </text>
      <text
        x="120"
        y="140"
        textAnchor="middle"
        fill="#9aa39e"
        fontSize="9"
        letterSpacing="2"
      >
        YOUR FIGURE
      </text>
    </svg>
  );
}
const download = (name: string, value: unknown) => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};
export function Rules({ compact = false }: { compact?: boolean }) {
  const [rule, setRule] = useState<Rule>("crowd"),
    [number, setNumber] = useState(68);
  return (
    <div className={`rules-box ${compact ? "compact" : ""}`}>
      <div className="eyebrow">THE RULES CHANGE. THE ROOM REMAINS.</div>
      <h2>Four phases. One survivor.</h2>
      <div className="rule-tabs" role="tablist" aria-label="Phase rules">
        {(Object.keys(RULES) as Rule[]).map((k, i) => (
          <button
            key={k}
            role="tab"
            aria-selected={rule === k}
            onClick={() => setRule(k)}
          >
            <span>{5 - i}</span> {RULES[k].name.replace("The ", "")}
          </button>
        ))}
      </div>
      <div
        className="rule-description"
        style={{ "--accent": RULES[rule].accent } as React.CSSProperties}
      >
        <Glyph kind={rule} />
        <div>
          <h3>
            {RULES[rule].name} <small>{RULES[rule].formula}</small>
          </h3>
          <p>{RULES[rule].description}</p>
          <code>{RULES[rule].example}</code>
          {rule === "circle" && (
            <div className="tutorial-slider">
              <label htmlFor="tutorial">
                Try a number: <strong>{number}</strong>
              </label>
              <input
                id="tutorial"
                type="range"
                min="0"
                max="100"
                value={number}
                onChange={(e) => setNumber(+e.target.value)}
              />
              <p>
                {number} beats <b>{winningRange(number)}</b>. It draws with{" "}
                {number}.
              </p>
            </div>
          )}
        </div>
        {rule === "circle" && <Circle pick={number} />}
      </div>
      <div className="rules-facts">
        <p>
          <b>01 · Choose & lock</b>
          <br />
          Whole numbers 0–100. Your lock is private and final.
        </p>
        <p>
          <b>02 · Three rounds</b>
          <br />
          Round 3 doubles deductions. Lowest phase performance is at risk.
        </p>
        <p>
          <b>03 · One elimination</b>
          <br />
          One leaves each phase. Better survivors earn a smaller next-phase
          handicap.
        </p>
      </div>
      <details>
        <summary>Full scoring, ties & time limits</summary>
        <p>
          In statistical phases, lose one point for each eligible player
          strictly closer to the target. Equal distances share rank. Duplicate
          numbers still affect the target, but cannot win: lose active players
          minus one. Missing the deadline loses active players. Round 3 doubles
          all deductions. A sole submission wins by forfeit without a target; no
          submissions means no winner.
        </p>
        <p>
          The circle winner loses no points, the loser loses one, a draw loses
          none, and a timeout loses two, before the round multiplier. Each
          figure beats exactly 50 others.
        </p>
        <p>
          Each phase starts at 0, −1, −2 or −3 according to the preceding
          survivor ranking; truly tied survivors share a competition-rank
          handicap (for example 0, 0, −2). Earlier losses do not stack. After
          three rounds, statistical ties use weighted exact accuracy
          (duplicate/timeout cost 101, sole forfeit zero); circle ties use round
          wins.
        </p>
        <p>
          A bottom tie gets one 45-second tiebreak. If still tied, a committed
          random draw among only those still at risk decides one elimination. It
          does not change survivor ranks. The seed commitment is published
          before choices and revealed after the phase.
        </p>
        <p>
          90 seconds to choose, 20 to reveal, 10 between rounds; locks can
          reveal early. Briefings and phase results keep the full five-player
          schedule within 28m40s. Server interruptions may end a match as
          Interrupted. Leaving does not pause the clock. No money or betting.
        </p>
      </details>
    </div>
  );
}
export function RoundDisplay({
  round,
  names,
}: {
  round: RoundResult;
  names: Record<string, string>;
}) {
  return (
    <div className="round-display">
      <div className="calculation">
        <span className="eyebrow">
          {round.tiebreak
            ? "TIEBREAK · ELIMINATION ONLY"
            : `REVEALED · ${round.multiplier}× STAKES`}
        </span>
        <h2>
          {round.rule === "circle" ? (
            "The circle has spoken."
          ) : round.target ? (
            <>
              Target <span>{decimal(round.target)}</span>
            </>
          ) : round.rows.some((r) => r.status === "forfeit") ? (
            "A win by forfeit."
          ) : (
            "No eligible winner."
          )}
        </h2>
        <p>
          {round.rule === "circle"
            ? RULES.circle.description
            : round.target
              ? `${RULES[round.rule].formula} · exact target ${exact(round.target)} · duplicates included`
              : "No statistical target is created from fewer than two submissions."}
        </p>
      </div>
      {round.rule !== "circle" && round.target && (
        <div className="number-line">
          <div className="axis" />
          {[0, 25, 50, 75, 100].map((n) => (
            <span className="tick" key={n} style={{ left: `${n}%` }}>
              {n}
            </span>
          ))}
          <div
            className="target-marker"
            style={{ left: `${round.target.n / round.target.d}%` }}
          >
            ▾<small>TARGET</small>
          </div>
          {round.rows
            .filter((r) => r.pick !== null)
            .map((r, i) => (
              <div
                className={`pick-marker ${r.winner ? "winner" : ""}`}
                key={r.seatId}
                style={{ left: `${r.pick}%`, top: 30 + i * 16 }}
                title={`${names[r.seatId]}: ${r.pick}`}
              >
                ● <small>{r.pick}</small>
              </div>
            ))}
        </div>
      )}
      {round.rule === "circle" && round.rows.every((r) => r.pick !== null) && (
        <div className="duel-result">
          <span>{round.rows[0].pick}</span>
          <Glyph kind="circle" size={44} />
          <span>{round.rows[1].pick}</span>
          <p>
            {round.rows.some((r) => r.winner)
              ? `${names[round.rows.find((r) => r.winner)!.seatId]} wins: the opposing figure is in their next 50 clockwise.`
              : "Equal figures. A draw; no deduction."}
          </p>
        </div>
      )}
      <div className="scroll-table">
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>Figure</th>
              <th>Result</th>
              <th>Distance</th>
              <th>Deduction</th>
              <th>Phase total</th>
            </tr>
          </thead>
          <tbody>
            {round.rows.map((row) => (
              <tr key={row.seatId} className={row.winner ? "winning-row" : ""}>
                <td>
                  {names[row.seatId] || "Seat"}
                  {row.winner && <span className="tag"> WIN</span>}
                </td>
                <td className="numeric">{row.pick ?? "—"}</td>
                <td>
                  {row.status === "collision"
                    ? "Duplicate"
                    : row.status === "timeout"
                      ? "Missed deadline"
                      : row.status === "forfeit"
                        ? "Forfeit win"
                        : row.status === "eligible"
                          ? "Eligible"
                          : row.status === "draw"
                            ? "Draw"
                            : "Circle duel"}
                </td>
                <td>
                  {row.distance
                    ? `${decimal(row.distance)} (${exact(row.distance)})`
                    : "—"}
                </td>
                <td>
                  {row.basePenalty} × {row.multiplier} ={" "}
                  <b>{row.delta === 0 ? "0" : row.delta}</b>
                </td>
                <td>{round.tiebreak ? "No score change" : row.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="fine">
        {round.tiebreak
          ? "This tiebreak decides elimination only. Main-phase scores and survivor handicaps stay unchanged."
          : "Phase total includes the starting handicap and completed round deductions."}{" "}
        A dash means no statistical distance applies.
      </p>
    </div>
  );
}
export function Replay({
  matches,
  names,
}: {
  matches: PublicMatch[];
  names: Record<string, string>;
}) {
  return (
    <div className="replay">
      <h2>The record, revealed.</h2>
      <p>
        Every figure, deduction and elimination comes from the committed match
        record.
      </p>
      {matches.map((m) => (
        <details key={m.id} className="match-replay">
          <summary>
            {new Date(m.startedAt).toLocaleString()} · {m.status} ·{" "}
            {m.phases.length} phases
          </summary>
          <button
            className="secondary"
            onClick={() => download(`fatal-figures-${m.id}.json`, m)}
          >
            Download resolved replay ↓
          </button>
          {m.phases.map((p) => (
            <section key={p.index}>
              <h3>
                {p.index} / {RULES[p.rule].name}
              </h3>
              <p>
                Starting handicaps:{" "}
                {p.active
                  .map((id) => `${names[id] || "Seat"} ${p.handicaps[id]}`)
                  .join(" · ")}
              </p>
              {p.rounds.map((r, i) => (
                <details key={r.id}>
                  <summary>
                    Round {i + 1} · {r.multiplier}× ·{" "}
                    {r.rows
                      .filter((s) => s.winner)
                      .map((s) => names[s.seatId])
                      .join(", ") || "No winner"}
                  </summary>
                  <RoundDisplay round={r} names={names} />
                </details>
              ))}
              {p.tiebreak && (
                <details>
                  <summary>Bounded tiebreak</summary>
                  <RoundDisplay round={p.tiebreak} names={names} />
                </details>
              )}
              {p.eliminated && (
                <p className="elimination-note">
                  Eliminated: {names[p.eliminated]} · Phase total, then{" "}
                  {p.rule === "circle"
                    ? "main-round wins"
                    : "weighted exact accuracy"}
                  , then one tiebreak if needed.
                </p>
              )}
              {p.ranks && (
                <p className="fine">
                  Main-phase ranking:{" "}
                  {p.ranks
                    .map(
                      (x) =>
                        `${names[x.id]}: ${x.score}, ${p.rule === "circle" ? `${x.wins} wins` : `accuracy cost ${exact(x.accuracy)}`}`,
                    )
                    .join(" · ")}
                </p>
              )}
              <details>
                <summary>Verify the committed fallback</summary>
                <p className="hash">
                  Commitment: {p.commitment}
                  <br />
                  Revealed seed:{" "}
                  {p.revealedSeed || "Private until phase resolution"}
                </p>
                {p.draw ? (
                  <>
                    <p>
                      Random draw candidates:{" "}
                      {p.draw.candidates.map((x) => names[x]).join(", ")}.
                      Eliminated: {names[p.draw.eliminated]}. Counter{" "}
                      {p.draw.counter}.
                    </p>
                    <button
                      className="secondary"
                      onClick={() => download("draw.json", p.draw)}
                    >
                      Download draw verification file
                    </button>
                  </>
                ) : (
                  <p>
                    No random fallback was required
                    {p.eliminated ? " in this phase" : ""}.
                  </p>
                )}
              </details>
            </section>
          ))}
        </details>
      ))}
    </div>
  );
}

export function CircleTutorial({ onClose }: { onClose: () => void }) {
  const [p, setP] = useState(68);
  return (
    <div className="circle-tutorial">
      <div className="eyebrow">BEFORE THE FINAL CIRCLE</div>
      <h2>
        Every number has
        <br />
        fifty ways to win.
      </h2>
      <Circle pick={p} />
      <p>
        Your <b>{p}</b> beats <b>{winningRange(p)}</b> clockwise.
        <br />
        It loses to the other 50; the same number draws.
      </p>
      <label htmlFor="circle-tutorial">Try your figure: {p}</label>
      <input
        id="circle-tutorial"
        type="range"
        min="0"
        max="100"
        value={p}
        onChange={(e) => setP(+e.target.value)}
      />
      <code>0 beats 34 · 34 beats 68 · 68 beats 0</code>
      <p className="fine">
        Winner loses 0, loser 1, equal picks 0, timeout 2; round 3 doubles
        deductions. No average target here. The shared clock keeps running
        during this tutorial.
      </p>
      <button className="primary" onClick={onClose}>
        I’ve got the circle ↗
      </button>
    </div>
  );
}
