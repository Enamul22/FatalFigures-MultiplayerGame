import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { io, type Socket } from "socket.io-client";
import {
  RULES,
  comparePerformance,
  decimal,
  exact,
  winningRange,
  type Rule,
  type RoundResult,
} from "../shared/rules";
import type { Snapshot, PublicMatch } from "../shared/engine";
import "./style.css";
import markUrl from "./mark.svg";
type Capability = { code: string; seatId: string; token: string };
type Receipt = { pick: number; roundId: string };
const saved = (): Capability | null => {
  try {
    return JSON.parse(sessionStorage.getItem("ff-seat") || "null");
  } catch {
    return null;
  }
};
const socket: Socket = io({
  autoConnect: false,
  reconnection: true,
  timeout: 10000,
});
function emit<T = any>(event: string, data: unknown = {}): Promise<T> {
  if (!socket.connected)
    return Promise.reject(
      Error("Connection lost. Reconnect to confirm your state."),
    );
  return new Promise((resolve, reject) => {
    socket
      .timeout(12000)
      .emit(event, data, (err: Error | null, result: any) => {
        if (err)
          reject(
            Error(
              "Acknowledgement uncertain. Use Sync to recover a committed lock before retrying.",
            ),
          );
        else if (!result.ok) reject(Error(result.error));
        else resolve(result.value);
      });
  });
}
function Glyph({ kind = "crowd", size = 60 }: { kind?: Rule; size?: number }) {
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
function Circle({ pick = 0, other }: { pick?: number; other?: number }) {
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
function Rules({ compact = false }: { compact?: boolean }) {
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
function RoundDisplay({
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
function Replay({
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
function App() {
  const [cap, setCap] = useState<Capability | null>(saved),
    capRef = useRef(cap),
    [state, setState] = useState<Snapshot | null>(null),
    [connected, setConnected] = useState(false),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [mode, setMode] = useState<"create" | "join" | "practice" | null>(null),
    [nickname, setNickname] = useState(""),
    [joinCode, setJoinCode] = useState(
      new URLSearchParams(location.search).get("room")?.toUpperCase() || "",
    ),
    [bots, setBots] = useState(3),
    [pick, setPick] = useState("35"),
    [receipt, setReceipt] = useState<Receipt | null>(null),
    [clock, setClock] = useState(Date.now()),
    [skew, setSkew] = useState(0),
    [muted, setMuted] = useState(localStorage.getItem("ff-muted") !== "false"),
    [reduced, setReduced] = useState(
      localStorage.getItem("ff-reduced") === "true" ||
        matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
    [rules, setRules] = useState(false),
    [history, setHistory] = useState(false),
    [circleHelp, setCircleHelp] = useState(false),
    [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!mode && !rules && !circleHelp) return;
    const prior = document.activeElement as HTMLElement | null;
    const modal = document.querySelector<HTMLElement>(".modal");
    const focusables = () =>
      Array.from(
        modal?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select,summary,[href]",
        ) ?? [],
      ).filter((e) => e.getClientRects().length > 0);
    if (!modal?.contains(document.activeElement)) focusables()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMode(null);
        setRules(false);
        setCircleHelp(false);
      }
      if (e.key === "Tab") {
        const fs = focusables(),
          first = fs[0],
          last = fs.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      prior?.focus();
    };
  }, [mode, rules, circleHelp]);
  const lastRound = useRef(""),
    lastCircle = useRef(""),
    stageRef = useRef(""),
    sound = useRef<AudioContext | null>(null),
    stateRef = useRef<Snapshot | null>(null);
  const save = (c: Capability | null) => {
    capRef.current = c;
    setCap(c);
    c
      ? sessionStorage.setItem("ff-seat", JSON.stringify(c))
      : sessionStorage.removeItem("ff-seat");
  };
  const accept = (s: Snapshot) => {
    if (
      stateRef.current &&
      stateRef.current.code === s.code &&
      stateRef.current.version > s.version
    )
      return;
    stateRef.current = s;
    setState(s);
    setClock(Date.now());
    setSkew(s.serverTime - Date.now());
    if (lastRound.current !== s.roundId) {
      lastRound.current = s.roundId;
      setReceipt(null);
    }
    const p = s.match?.phases.at(-1);
    if (
      p?.rule === "circle" &&
      `${s.match!.id}:${p.index}` !== lastCircle.current
    ) {
      lastCircle.current = `${s.match!.id}:${p.index}`;
      setCircleHelp(true);
    }
  };
  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      if (capRef.current)
        emit("resume", { ...capRef.current, after: stateRef.current?.seq ?? 0 })
          .then((v: any) => {
            accept(v.state);
            if (v.pick !== null)
              setReceipt({ pick: v.pick, roundId: v.state.roundId });
            setError("");
          })
          .catch((e) => setError(e.message));
    };
    const onState = (s: Snapshot) => accept(s);
    socket.on("connect", onConnect);
    socket.on("disconnect", () => setConnected(false));
    socket.on("state", onState);
    socket.on("unavailable", (v) => setError(v.message));
    socket.connect();
    const timer = setInterval(() => setClock(Date.now()), 200);
    return () => {
      clearInterval(timer);
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.reduced = String(reduced);
    localStorage.setItem("ff-reduced", String(reduced));
  }, [reduced]);
  useEffect(() => {
    localStorage.setItem("ff-muted", String(muted));
  }, [muted]);
  useEffect(() => {
    if (state?.stage !== stageRef.current) {
      stageRef.current = state?.stage || "";
      if (!muted && sound.current) {
        const ctx = sound.current,
          osc = ctx.createOscillator(),
          gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = state?.stage === "reveal" ? 220 : 440;
        gain.gain.setValueAtTime(0.045, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
      }
    }
  }, [state?.stage, muted]);
  async function action(fn: () => Promise<void>) {
    setError("");
    setPending(true);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  async function enter() {
    await action(async () => {
      const v = await emit(
        mode === "join" ? "join" : "create",
        mode === "join"
          ? { nickname, code: joinCode.trim().toUpperCase() }
          : { nickname, bots: mode === "practice" ? bots : 0 },
      );
      save({ code: v.code, seatId: v.seatId, token: v.token });
      accept(v.state);
      setMode(null);
    });
  }
  const p = state?.match?.phases.at(-1),
    rule = p?.rule ?? "crowd",
    me = state?.seats.find((s) => s.id === cap?.seatId),
    names = Object.fromEntries(
      [
        ...(state?.history.flatMap((m) => m.players) ?? []),
        ...(state?.match?.players ?? []),
        ...(state?.seats ?? []),
      ].map((s) => [s.id, s.nickname + (s.bot ? " · BOT" : "")]),
    ),
    isHost = state?.host === cap?.seatId,
    canAct = !!(
      state?.stage === "choosing" &&
      p?.active.includes(cap?.seatId || "") &&
      (!state.tie || state.tieIds.includes(cap?.seatId || "")) &&
      !me?.withdrawn
    ),
    myLocked = receipt?.roundId === state?.roundId ? receipt : null,
    seconds = state?.deadline
      ? Math.max(0, Math.ceil((state.deadline - (clock + skew)) / 1000))
      : 0,
    round = p ? (state?.tie ? p.tiebreak : p.rounds.at(-1)) : null;
  const ranked = p
    ? p.active
        .map((id) => ({
          id,
          score: p.scores[id],
          accuracy: p.accuracy[id],
          wins: p.wins[id],
        }))
        .sort((a, b) => comparePerformance(a, b, p.rule))
    : [];
  const atRisk = new Set(
    p && p.rounds.length
      ? ranked
          .filter(
            (row) => comparePerformance(row, ranked.at(-1)!, p.rule) === 0,
          )
          .map((row) => row.id)
      : [],
  );
  const matches = [
    ...(state?.history ?? []),
    ...(state?.match ? [state.match] : []),
  ];
  const leave = () =>
    void action(async () => {
      await emit("leave");
      save(null);
      setState(null);
      stateRef.current = null;
      setReceipt(null);
      setHistory(false);
    });
  return (
    <div
      className="app"
      style={
        {
          "--accent": p ? RULES[rule].accent : "#dcff73",
        } as React.CSSProperties
      }
    >
      <header className="topbar">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            if (state) e.preventDefault();
          }}
        >
          <img src={markUrl} alt="" />
          <span>
            FATAL FIGURES
            <span className="brand-sub">A GAME OF READING THE ROOM</span>
          </span>
        </a>
        <nav>
          <button className="text-button" onClick={() => setRules(true)}>
            How to play
          </button>
          <button
            className="icon-button"
            aria-label={muted ? "Enable sound" : "Mute sound"}
            aria-pressed={!muted}
            onClick={() => {
              if (muted) {
                sound.current ??= new AudioContext();
                void sound.current.resume();
              }
              setMuted(!muted);
            }}
          >
            {muted ? "♫ OFF" : "♫ ON"}
          </button>
          <button
            className="icon-button motion-toggle"
            aria-label="Reduce motion"
            aria-pressed={reduced}
            onClick={() => setReduced(!reduced)}
          >
            ◌ {reduced ? "STILL" : "MOTION"}
          </button>
          {state && (
            <span className={`connection ${connected ? "online" : ""}`}>
              {connected ? "LIVE" : "RECONNECTING"}
            </span>
          )}
        </nav>
      </header>
      {error && (
        <div className="error" role="alert">
          {error}{" "}
          <button
            className="text-button"
            onClick={() =>
              void action(async () => {
                const v = await emit("sync");
                accept(v.state);
                setReceipt(
                  v.pick === null
                    ? null
                    : { pick: v.pick, roundId: v.state.roundId },
                );
              })
            }
          >
            Sync
          </button>
          {cap && !state && (
            <button
              onClick={() => {
                save(null);
                setError("");
              }}
            >
              Forget this seat
            </button>
          )}
        </div>
      )}
      {!connected && state && (
        <div className="network-banner" role="status">
          Reconnecting. The shared clock continues; sync confirms committed
          locks.
        </div>
      )}
      {!state ? (
        <main className="landing">
          <section className="hero">
            <div className="hero-copy">
              <div className="eyebrow">
                <span className="live-dot" /> PRIVATE ROOMS · 2–5 PLAYERS
              </div>
              <h1>
                Read the room.
                <br />
                Choose your
                <br />
                <em>fatal figure.</em>
              </h1>
              <p className="hero-description">
                A game of numbers. A test of nerve.
                <br />
                Predict the table, dodge the collision, and be the last one
                standing.
              </p>
              <div className="hero-actions">
                <button className="primary" onClick={() => setMode("create")}>
                  Play with friends <span>↗</span>
                </button>
                <button
                  className="secondary"
                  onClick={() => setMode("practice")}
                >
                  Practice with bots
                </button>
              </div>
              <button className="join-link" onClick={() => setMode("join")}>
                Have a room code? <u>Join the table →</u>
              </button>
              <div className="hero-meta">
                <span>
                  0–100
                  <br />
                  <small>ONE SECRET NUMBER</small>
                </span>
                <span>
                  3 ROUNDS
                  <br />
                  <small>ONE ELIMINATION</small>
                </span>
                <span>
                  ≤ 29 MIN
                  <br />
                  <small>TO THE FINAL FIGURE</small>
                </span>
              </div>
            </div>
            <div className="hero-art" aria-hidden="true">
              <div className="art-label">EVERY NUMBER TELLS ON YOU.</div>
              <div className="orbital">
                <div className="orbit orbit-one" />
                <div className="orbit orbit-two" />
                <div className="orbit orbit-three" />
                <span className="art-number n1">20</span>
                <span className="art-number n2">80</span>
                <span className="art-number n3">35</span>
                <span className="art-number n4">50</span>
                <span className="art-number n5">40</span>
                <div className="center-figure">
                  <small>THE CROWD</small>
                  <b>
                    36<span>↘</span>
                  </b>
                  <p>
                    THE TARGET IS NEVER
                    <br />
                    THE WHOLE STORY.
                  </p>
                </div>
              </div>
              <div className="art-footer">
                <span>MEAN × 0.8</span>
                <span>ONLY THE CLOSEST KNOW.</span>
              </div>
            </div>
          </section>
          <section className="landing-rules">
            <Rules />
          </section>
        </main>
      ) : (
        <main className="room-main">
          <div className="room-utility">
            <div>
              <span className="eyebrow">
                {state.practice
                  ? "PRACTICE · PUBLIC-INFORMATION BOTS"
                  : "PRIVATE TABLE"}
              </span>
              <button
                className="room-code"
                title="Copy invite link"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(`${location.origin}/?room=${state.code}`)
                    .then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    })
                    .catch(() =>
                      setError("Copy the visible room code to invite friends."),
                    );
                }}
              >
                {state.code} <span>{copied ? "COPIED ✓" : "INVITE ↗"}</span>
              </button>
            </div>
            <div>
              <button
                className="text-button"
                onClick={() => setHistory(!history)}
              >
                {history ? "Back to table" : "History & replay"}
              </button>
              <button className="text-button" onClick={leave}>
                Leave room
              </button>
            </div>
          </div>
          {history ? (
            <Replay matches={matches} names={names} />
          ) : state.stage === "lobby" ? (
            <div className="lobby-grid">
              <section className="lobby-panel">
                <div className="eyebrow">THE TABLE IS OPEN</div>
                <h1>Take your seat.</h1>
                <p>Share the invite. Ready when you are.</p>
                <div className="lobby-seats">
                  {Array.from({ length: 5 }, (_, i) => {
                    const s = state.seats[i];
                    return (
                      <div
                        className={`lobby-seat ${s ? "occupied" : ""}`}
                        key={s?.id ?? i}
                      >
                        <span className="seat-avatar">
                          {s
                            ? s.bot
                              ? "◇"
                              : s.nickname.slice(0, 1).toUpperCase()
                            : "+"}
                        </span>
                        <div>
                          <b>{s ? s.nickname : "Open seat"}</b>
                          <small>
                            {s?.id === cap?.seatId
                              ? "YOU"
                              : s?.bot
                                ? "STRATEGY BOT"
                                : s?.id === state.host
                                  ? "HOST"
                                  : s
                                    ? "GUEST"
                                    : "Invite a friend"}
                          </small>
                        </div>
                        {s && (
                          <span
                            className={
                              s.ready ? "ready-label" : "waiting-label"
                            }
                          >
                            {s.ready
                              ? "✓ READY"
                              : s.connected
                                ? "NOT READY"
                                : "OFFLINE"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="lobby-actions">
                  <button
                    className={me?.ready ? "secondary" : "primary"}
                    disabled={pending || !connected}
                    onClick={() =>
                      void action(async () => {
                        await emit("ready", { ready: !me?.ready });
                      })
                    }
                  >
                    {me?.ready ? "✓ You are ready · Undo" : "I’m ready"}
                  </button>
                  {isHost && (
                    <button
                      className="primary"
                      disabled={
                        pending ||
                        !connected ||
                        state.seats.length < 2 ||
                        state.seats.some((s) => !s.ready)
                      }
                      onClick={() =>
                        void action(async () => {
                          await emit("start");
                        })
                      }
                    >
                      Start match ↗
                    </button>
                  )}
                </div>
                <p className="fine">
                  {isHost
                    ? "The host starts once 2–5 players are ready."
                    : "Waiting for the host to start once everyone is ready."}{" "}
                  Your seat resumes on refresh in this tab. Keep the tab; the
                  invite code cannot reclaim a seat.
                </p>
              </section>
              <aside className="lobby-rules">
                <Rules compact />
              </aside>
            </div>
          ) : state.stage === "finished" ? (
            <section className="results">
              <div className="eyebrow">
                {state.practice ? "PRACTICE RESULTS" : "THE MATCH IS OVER"}
              </div>
              <Glyph kind={rule} size={90} />
              <h1>
                {state.match?.status === "champion" ? (
                  <>
                    {names[state.match.champion!]}
                    <br />
                    <em>stands alone.</em>
                  </>
                ) : (
                  state.match?.status
                )}
              </h1>
              <p>{state.notice}</p>
              <div className="result-stats">
                <div>
                  <strong>
                    {state.match?.phases.reduce(
                      (v, p) => v + p.rounds.length,
                      0,
                    )}
                  </strong>
                  <span>ROUNDS REVEALED</span>
                </div>
                <div>
                  <strong>
                    {Math.ceil(
                      ((state.match?.finishedAt ?? 0) -
                        (state.match?.startedAt ?? 0)) /
                        1000,
                    )}
                    s
                  </strong>
                  <span>MATCH DURATION</span>
                </div>
                <div>
                  <strong>
                    {state.match?.phases
                      .flatMap((p) => p.rounds)
                      .flatMap((r) => r.rows)
                      .filter((r) => r.status === "eligible")
                      .reduce<number | null>(
                        (a, r) =>
                          a === null
                            ? r.distance!.n / r.distance!.d
                            : Math.min(a, r.distance!.n / r.distance!.d),
                        null,
                      )
                      ?.toFixed(2) ?? "—"}
                  </strong>
                  <span>CLOSEST VALID DISTANCE</span>
                </div>
              </div>
              <div className="hero-actions">
                {isHost && (
                  <button
                    className="primary"
                    disabled={pending || !connected}
                    onClick={() =>
                      void action(async () => {
                        await emit("rematch");
                        setReceipt(null);
                      })
                    }
                  >
                    Open a rematch ↗
                  </button>
                )}
                <button className="secondary" onClick={() => setHistory(true)}>
                  Explore the replay
                </button>
              </div>
              <p className="fine">
                {isHost
                  ? "New match, new identity, everyone starts at zero."
                  : "The host can open a new lobby for willing players."}{" "}
                Results stay in this room’s history. Save a replay before
                leaving.
              </p>
            </section>
          ) : (
            <>
              <div className="phase-header">
                <div>
                  <div className="eyebrow">
                    PHASE {p?.index} /{" "}
                    {(state.match?.phases[0]?.active.length ?? 2) - 1}{" "}
                    <span>· {p?.active.length} REMAIN</span>
                  </div>
                  <h1>
                    {RULES[rule].name}
                    <Glyph kind={rule} size={42} />
                  </h1>
                </div>
                <div
                  className={`round-clock ${seconds <= 10 ? "urgent" : ""}`}
                  role="timer"
                  aria-label={`${state.stage}: ${seconds} seconds remaining`}
                >
                  <small>
                    {state.tie
                      ? "TIEBREAK"
                      : state.stage === "briefing"
                        ? "RULE BRIEFING"
                        : state.stage === "phaseEnd"
                          ? "PHASE RESULT"
                          : `ROUND ${state.roundNumber} / 3`}
                  </small>
                  <b>
                    {String(Math.floor(seconds / 60)).padStart(2, "0")}
                    <i>:</i>
                    {String(seconds % 60).padStart(2, "0")}
                  </b>
                  <span>
                    {state.stage === "choosing"
                      ? "TO LOCK"
                      : state.stage === "reveal"
                        ? "REVEAL"
                        : state.stage === "briefing"
                          ? "UNTIL CHOOSING"
                          : "NEXT TRANSITION"}
                  </span>
                </div>
              </div>
              <div className="rule-ribbon">
                <span>{RULES[rule].formula}</span>
                <p>{RULES[rule].description}</p>
                <b>
                  {state.roundNumber === 3 && !state.tie
                    ? "2× DOUBLE STAKES"
                    : "ROUNDS: 1× · 1× · 2×"}
                </b>
              </div>
              <div className="game-grid">
                <section className={`table-area stage-${state.stage}`}>
                  <div className="table-topline">
                    <span className="eyebrow">
                      {state.stage === "choosing"
                        ? "MAKE YOUR MOVE"
                        : state.stage.toUpperCase()}
                    </span>
                    <span className="fine">
                      {state.tie
                        ? `${state.tieIds.length} at risk`
                        : state.stage === "choosing"
                          ? `${state.locked.length} / ${p?.active.length} locked`
                          : state.stage === "reveal" ||
                              state.stage === "intermission"
                            ? "CHOICES REVEALED"
                            : `${p?.active.length} ACTIVE SEATS`}
                    </span>
                  </div>
                  {state.stage === "choosing" ? (
                    <div className="choosing-center">
                      {canAct ? (
                        <>
                          {rule === "circle" ? (
                            <Circle
                              pick={myLocked?.pick ?? (Number(pick) || 0)}
                            />
                          ) : (
                            <div
                              className={`private-number ${myLocked ? "sealed" : ""}`}
                            >
                              <span>
                                {myLocked
                                  ? "LOCKED FIGURE"
                                  : "YOUR PRIVATE FIGURE"}
                              </span>
                              <strong>{myLocked?.pick ?? (pick || "—")}</strong>
                              <small>
                                {myLocked
                                  ? "✓ COMMITTED · CANNOT BE CHANGED"
                                  : "ONLY YOU CAN SEE THIS"}
                              </small>
                            </div>
                          )}
                          {myLocked ? (
                            <div className="locked-message">
                              <h2>Your move is sealed.</h2>
                              <p>
                                Waiting for the room. Opponents see only your
                                lock status.
                              </p>
                            </div>
                          ) : (
                            <form
                              className="number-form"
                              onSubmit={(e) => {
                                e.preventDefault();
                                void action(async () => {
                                  const roundId = state.roundId;
                                  const v = await emit("lock", {
                                    roundId,
                                    pick: Number(pick),
                                  });
                                  setReceipt({
                                    pick: v.pick,
                                    roundId: v.roundId,
                                  });
                                });
                              }}
                            >
                              <label htmlFor="pick">
                                {rule === "circle"
                                  ? `Beats ${winningRange(Number(pick) || 0)} clockwise`
                                  : "Whole number · 0–100"}
                              </label>
                              <input
                                className="number-range"
                                aria-label="Choose your figure slider"
                                type="range"
                                min="0"
                                max="100"
                                step="1"
                                value={pick || "0"}
                                disabled={pending || !connected}
                                onChange={(e) => setPick(e.target.value)}
                              />
                              <div className="lock-row">
                                <input
                                  id="pick"
                                  aria-label="Your figure"
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="1"
                                  inputMode="numeric"
                                  required
                                  value={pick}
                                  disabled={pending || !connected}
                                  onChange={(e) => setPick(e.target.value)}
                                />
                                <button
                                  className="primary"
                                  disabled={
                                    pending || !connected || seconds === 0
                                  }
                                >
                                  {pending ? "COMMITTING…" : "Lock figure"}{" "}
                                  <span>↗</span>
                                </button>
                              </div>
                              <p className="fine">
                                Locks are final. No pick by the deadline =
                                timeout. Refresh keeps your seat and committed
                                figure.
                              </p>
                            </form>
                          )}
                        </>
                      ) : (
                        <div className="watching">
                          <Glyph kind={rule} size={96} />
                          <h2>
                            {p?.active.includes(cap?.seatId || "")
                              ? "Watching the tiebreak."
                              : "You’re still at the table."}
                          </h2>
                          <p>
                            {state.tie
                              ? "Only tied-at-risk players choose this round."
                              : "You have been eliminated. Watch the reveal and join the rematch."}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : state.stage === "briefing" ? (
                    <div className="phase-brief">
                      <Glyph kind={rule} size={100} />
                      <h2>{RULES[rule].formula}</h2>
                      <p>{RULES[rule].description}</p>
                      <code>{RULES[rule].example}</code>
                      <p className="handicap-callout">
                        {p?.index === 1
                          ? "First phase: everyone starts at zero."
                          : "New phase: previous totals are replaced by one starting handicap. Tied survivors share rank; earlier losses do not stack."}
                      </p>
                      <p className="fine">
                        Choosing opens automatically. No ready gate pauses the
                        clock.
                      </p>
                      {rule === "circle" && (
                        <button
                          className="secondary"
                          onClick={() => setCircleHelp(true)}
                        >
                          Try the circle tutorial ↗
                        </button>
                      )}
                    </div>
                  ) : state.stage === "phaseEnd" ? (
                    <div className="phase-brief">
                      <div className="eyebrow">ONE FIGURE FALLS</div>
                      <h2>
                        {names[p?.eliminated || ""]}
                        <br />
                        <em>is eliminated.</em>
                      </h2>
                      <p>{state.notice}</p>
                      {p?.draw && (
                        <p>
                          A committed random draw resolved the remaining tie.
                          Its seed and candidates are now in the replay.
                        </p>
                      )}
                      <p className="fine">
                        Phase commitment and seed are available in History &
                        replay.
                      </p>
                    </div>
                  ) : round ? (
                    <RoundDisplay round={round} names={names} />
                  ) : null}
                </section>
                <aside className="seats-panel">
                  <div className="eyebrow">
                    THE TABLE <span>PHASE TOTAL</span>
                  </div>
                  {state.seats.map((s, i) => {
                    const active = p?.active.includes(s.id),
                      eliminated = !active || p?.eliminated === s.id;
                    const total = p?.scores[s.id],
                      h = p?.handicaps[s.id];
                    return (
                      <div
                        className={`player-card ${s.id === cap?.seatId ? "is-me" : ""} ${eliminated ? "eliminated" : ""}`}
                        key={s.id}
                      >
                        <span className="player-symbol">
                          {["△", "◈", "○", "□", "⬡"][i]}
                        </span>
                        <div className="player-info">
                          <b>
                            {s.nickname}{" "}
                            {s.id === cap?.seatId && <small>YOU</small>}
                            {s.bot && <small>BOT</small>}
                          </b>
                          <span>
                            {eliminated
                              ? "ELIMINATED"
                              : s.withdrawn
                                ? "WITHDRAWN"
                                : state.stage === "choosing"
                                  ? state.locked.includes(s.id)
                                    ? "✓ LOCKED"
                                    : s.connected
                                      ? "CHOOSING…"
                                      : "OFFLINE"
                                  : s.bot
                                    ? `${s.bot.toUpperCase()} BOT`
                                    : "AT THE TABLE"}
                          </span>
                          {!eliminated && atRisk.has(s.id) && (
                            <small
                              className="risk"
                              title="Current bottom performance from revealed main rounds only; future rounds can change it."
                            >
                              AT RISK · REVEALED ROUNDS
                            </small>
                          )}
                          {active && (
                            <small>
                              Start {h === 0 ? "0" : h} · rounds{" "}
                              {(total ?? 0) - (h ?? 0)}
                            </small>
                          )}
                        </div>
                        <strong>{active ? total : "—"}</strong>
                      </div>
                    );
                  })}
                  <div className="scoring-note">
                    <b>Keep your losses low.</b>
                    <p>
                      Phase total = starting handicap + round deductions. One
                      player leaves after round 3 and bounded ties.
                    </p>
                    {state.tie && (
                      <p>Tiebreak deductions decide elimination only.</p>
                    )}
                    <button
                      className="text-button"
                      onClick={() => setRules(true)}
                    >
                      Scoring explained ↗
                    </button>
                  </div>
                  <details className="commitment">
                    <summary>Committed tie fallback</summary>
                    <p className="hash">
                      SHA-256
                      <br />
                      {state.commitment}
                    </p>
                    <p className="fine">
                      Seed fixed before this phase. Revealed after elimination.
                      Only still-tied candidates enter the draw.
                    </p>
                  </details>
                </aside>
              </div>
              <p className="table-notice" role="status">
                ◌ {state.notice}
              </p>
            </>
          )}
        </main>
      )}
      <footer>
        <span>
          FATAL FIGURES <small>BY ENAMUL HAQUE</small>
        </span>
        <span>Prediction. Bluffing. Elimination.</span>
        <span>Original game · No money stakes</span>
      </footer>
      {mode && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMode(null);
          }}
        >
          <section
            className="modal entry-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="entry-title"
          >
            <button
              className="close"
              aria-label="Close"
              onClick={() => setMode(null)}
            >
              ×
            </button>
            <div className="eyebrow">
              {mode === "practice"
                ? "A LOW-STAKES FIRST MOVE"
                : "PRIVATE ROOM · YOUR PEOPLE"}
            </div>
            <h2 id="entry-title">
              {mode === "join"
                ? "Find your table."
                : mode === "practice"
                  ? "Meet your opponents."
                  : "Make room for intrigue."}
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void enter();
              }}
            >
              <label htmlFor="nickname">Your nickname</label>
              <input
                id="nickname"
                autoFocus
                required
                maxLength={20}
                pattern="[\p{L}\p{N} _ .\-]+"
                value={nickname}
                placeholder="What should the table call you?"
                onChange={(e) => setNickname(e.target.value)}
              />
              {mode === "join" && (
                <>
                  <label htmlFor="room-code">Room code</label>
                  <input
                    id="room-code"
                    required
                    minLength={6}
                    maxLength={6}
                    value={joinCode}
                    placeholder="ABC234"
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  />
                </>
              )}
              {mode === "practice" && (
                <>
                  <label htmlFor="bots">Strategy bots</label>
                  <select
                    id="bots"
                    value={bots}
                    onChange={(e) => setBots(+e.target.value)}
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {n} bot{n > 1 ? "s" : ""} · {n + 1} seats total
                      </option>
                    ))}
                  </select>
                  <p className="fine">
                    Anchor, Analyst, Contrarian and Adapter use public history
                    only. They cannot see your hidden number.
                  </p>
                </>
              )}
              <button className="primary" disabled={pending || !connected}>
                {pending
                  ? "OPENING…"
                  : mode === "join"
                    ? "Join room ↗"
                    : mode === "practice"
                      ? "Open practice room ↗"
                      : "Create room ↗"}
              </button>
            </form>
            <p className="fine">
              Guest seats, no account needed. Your private resume capability
              stays in this tab’s session storage. Invite links contain only the
              room code.
            </p>
            {mode !== "join" && (
              <button className="text-button" onClick={() => setMode("join")}>
                Already have a code? Join instead
              </button>
            )}
          </section>
        </div>
      )}
      {(rules || circleHelp) && (
        <div className="modal-backdrop">
          <section
            className="modal rules-modal"
            role="dialog"
            aria-modal="true"
            aria-label={circleHelp ? "Final Circle tutorial" : "How to play"}
          >
            <button
              className="close"
              aria-label="Close rules"
              onClick={() => {
                setRules(false);
                setCircleHelp(false);
              }}
            >
              ×
            </button>
            {circleHelp ? (
              <CircleTutorial onClose={() => setCircleHelp(false)} />
            ) : (
              <Rules />
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function CircleTutorial({ onClose }: { onClose: () => void }) {
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
createRoot(document.getElementById("root")!).render(<App />);
