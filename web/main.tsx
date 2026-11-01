import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { io, type Socket } from "socket.io-client";
import { RULES } from "../shared/rules";
import type { Snapshot } from "../shared/engine";
import "./style.css";
import markUrl from "./mark.svg";
import { CircleTutorial, Rules, Replay } from "./presentation";
import { MatchRoom } from "./room/MatchRoom";
import { useRoomAudio } from "./room/audio";
import "./room/room.css";
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
    [resyncing, setResyncing] = useState(false),
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
    if (!modal) return;
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
    stateRef = useRef<Snapshot | null>(null),
    restoring = useRef(!!cap);
  const audio = useRoomAudio();
  const muted = audio.muted;
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
      if (!restoring.current) setCircleHelp(true);
    }
  };
  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      if (capRef.current) {
        restoring.current = true;
        setResyncing(true);
        emit("resume", { ...capRef.current, after: stateRef.current?.seq ?? 0 })
          .then((v: any) => {
            accept(v.state);
            if (v.pick !== null)
              setReceipt({ pick: v.pick, roundId: v.state.roundId });
            setError("");
          })
          .catch((e) => setError(e.message))
          .finally(() => {
            restoring.current = false;
            setResyncing(false);
          });
      } else {
        restoring.current = false;
        setResyncing(false);
      }
    };
    const onState = (s: Snapshot) => accept(s);
    socket.on("connect", onConnect);
    socket.on("disconnect", () => {
      restoring.current = true;
      setConnected(false);
    });
    socket.on("state", onState);
    socket.on("unavailable", (v) => setError(v.message));
    socket.connect();
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.reduced = String(reduced);
    localStorage.setItem("ff-reduced", String(reduced));
  }, [reduced]);
  async function action(fn: () => Promise<void>) {
    void audio.unlock();
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
    isHost = state?.host === cap?.seatId;
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
            onClick={audio.toggle}
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
                restoring.current = true;
                setResyncing(true);
                try {
                  const v = await emit("sync");
                  accept(v.state);
                  setReceipt(
                    v.pick === null
                      ? null
                      : { pick: v.pick, roundId: v.state.roundId },
                  );
                } finally {
                  restoring.current = false;
                  setResyncing(false);
                }
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
                  Play with computer
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
          ) : (
            <MatchRoom
              state={state}
              meId={cap?.seatId ?? ""}
              names={names}
              connected={connected}
              resyncing={resyncing}
              pending={pending}
              pick={pick}
              setPick={setPick}
              receipt={receipt?.roundId === state.roundId ? receipt : null}
              blocked={rules || circleHelp}
              help={circleHelp ? "circle" : rules ? "rules" : null}
              onHelpClose={() => {
                setRules(false);
                setCircleHelp(false);
              }}
              reduced={reduced}
              audio={audio}
              onRules={() => setRules(true)}
              onCircle={() => setCircleHelp(true)}
              onReplay={() => setHistory(true)}
              onRematch={() =>
                void action(async () => {
                  await emit("rematch");
                  setReceipt(null);
                })
              }
              onLock={() =>
                void action(async () => {
                  const roundId = state.roundId;
                  const v = await emit("lock", { roundId, pick: Number(pick) });
                  setReceipt({ pick: v.pick, roundId: v.roundId });
                  audio.cue("lock");
                })
              }
            />
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
      {(rules || circleHelp) &&
        (!state || state.stage === "lobby" || history) && (
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
createRoot(document.getElementById("root")!).render(<App />);
