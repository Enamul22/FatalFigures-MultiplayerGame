import { useEffect, useMemo, useRef, useState } from "react";
import type { Snapshot } from "../../shared/engine";
import { RULES, winningRange } from "../../shared/rules";
import {
  Circle,
  Glyph,
  RoundDisplay,
  Rules,
  CircleTutorial,
} from "../presentation";
import { RoomScene, QUIET, type RoomEffects } from "./RoomScene";
import { RoomClock } from "./RoomClock";
import { RoomDialog } from "./RoomDialog";
import { AudioControls, Scoreboard } from "./RoomPanels";
import { eliminatedSeats, latestRevealed, seatPhase } from "./model";
import type { RoomAudio } from "./audio";
type Props = {
  state: Snapshot;
  meId: string;
  names: Record<string, string>;
  connected: boolean;
  resyncing: boolean;
  pending: boolean;
  submissionError: string;
  onSync: () => void;
  pick: string;
  setPick: (p: string) => void;
  receipt: { pick: number; roundId: string } | null;
  blocked: boolean;
  help: "circle" | "rules" | null;
  onHelpClose: () => void;
  reduced: boolean;
  audio: RoomAudio;
  onRules: () => void;
  onCircle: () => void;
  onReplay: () => void;
  onRematch: () => void;
  onLock: () => void;
};
function useLiveEffects(
  state: Snapshot,
  connected: boolean,
  resyncing: boolean,
  reduced: boolean,
  audio: RoomAudio,
  meId: string,
) {
  const previous = useRef<Snapshot | null>(null),
    liveAudio = useRef(audio);
  liveAudio.current = audio;
  const [effects, setEffects] = useState<RoomEffects>(QUIET);
  useEffect(() => {
    const visibility = () => {
      previous.current = null;
      setEffects(QUIET);
      liveAudio.current.stop();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);
  useEffect(() => {
    const before = previous.current;
    previous.current = state;
    if (
      !connected ||
      resyncing ||
      document.hidden ||
      !before ||
      before.match?.id !== state.match?.id
    ) {
      setEffects(QUIET);
      liveAudio.current.stop();
      return;
    }
    const sameRound = before.roundId === state.roundId,
      locks = state.locked.filter(
        (id) => !sameRound || !before.locked.includes(id),
      ),
      out = eliminatedSeats(state).filter(
        (id) => !eliminatedSeats(before).includes(id),
      ),
      scores = state
        .match!.players.filter(
          (p) =>
            seatPhase(before, p.id)?.scores[p.id] !==
            seatPhase(state, p.id)?.scores[p.id],
        )
        .map((p) => p.id),
      reveal =
        latestRevealed(state)?.result.id !== latestRevealed(before)?.result.id,
      champion =
        state.stage === "finished" &&
        before.stage !== "finished" &&
        state.match!.status === "champion";
    if (locks.some((id) => id !== meId)) liveAudio.current.cue("lock");
    if (reveal) liveAudio.current.cue("reveal");
    if (out.length) liveAudio.current.cue("elimination");
    if (champion) liveAudio.current.cue("champion");
    if (
      state.stage === "choosing" &&
      (before.stage !== "choosing" || !sameRound) &&
      state.match!.phases.at(-1)!.active.includes(meId) &&
      (!state.tie || state.tieIds.includes(meId)) &&
      !state.seats.find((s) => s.id === meId)?.withdrawn
    )
      liveAudio.current.cue("input");
    if (!reduced)
      setEffects({ locks, scores, eliminated: out, reveal, champion });
    else setEffects(QUIET);
    const timer = setTimeout(() => setEffects(QUIET), 650);
    return () => clearTimeout(timer);
  }, [state, connected, resyncing, reduced, meId]);
  useEffect(() => () => liveAudio.current.stop(), []);
  return effects;
}
export function MatchRoom(props: Props) {
  const {
    state,
    meId,
    names,
    connected,
    resyncing,
    pending,
    submissionError,
    onSync,
    pick,
    setPick,
    receipt,
    blocked,
    help: requestedHelp,
    onHelpClose,
    reduced,
    audio,
    onRules,
    onCircle,
    onReplay,
    onRematch,
    onLock,
  } = props;
  const match = state.match!,
    phase = match.phases.at(-1)!,
    rule = RULES[phase.rule],
    latest = useMemo(() => latestRevealed(state), [state]),
    effects = useLiveEffects(state, connected, resyncing, reduced, audio, meId);
  const eligible =
    state.stage === "choosing" &&
    phase.active.includes(meId) &&
    (!state.tie || state.tieIds.includes(meId)) &&
    !state.seats.find((s) => s.id === meId)?.withdrawn;
  const locked = !!receipt || state.locked.includes(meId),
    stageKey = `${match.id}:${phase.index}:${state.roundId}:${state.stage}`;
  const stageElement = useRef<HTMLDivElement>(null),
    dashboardElement = useRef<HTMLDivElement>(null);
  const watch = () => {
    const stage = stageElement.current,
      dashboard = dashboardElement.current;
    if (stage && dashboard)
      window.scrollBy({
        top:
          stage.getBoundingClientRect().top -
          dashboard.getBoundingClientRect().height -
          12,
        behavior: "instant",
      });
  };
  const [detailsKey, setDetailsKey] = useState("");
  const [dismissed, setDismissed] = useState(""),
    [receiptOpen, setReceiptOpen] = useState(false);
  useEffect(() => {
    if (eligible && locked) watch();
  }, [eligible, locked, state.roundId]);
  const privateEntry = eligible && !locked;
  const finalAnnouncement =
    state.stage === "finished" && dismissed !== stageKey;
  const help = finalAnnouncement ? null : requestedHelp;
  const details = detailsKey === stageKey && !finalAnnouncement;
  const autoOverlay =
    state.stage !== "intermission" &&
    (state.stage !== "choosing" || privateEntry || (state.tie && !eligible));
  const open =
    details ||
    help !== null ||
    ((!blocked || finalAnnouncement) &&
      ((receiptOpen && !!receipt && state.stage === "choosing") ||
        (autoOverlay && dismissed !== stageKey)));
  useEffect(() => setReceiptOpen(false), [state.roundId, state.stage]);
  // A lock acknowledgement closes only the private entry; no new choice can be made.
  const receiptDialog = receiptOpen && !!receipt && state.stage === "choosing";
  const title = details
    ? "Calculation & scoring details"
    : help
      ? help === "circle"
        ? "Final Circle tutorial"
        : "How to play"
      : receiptDialog
        ? "Your locked-number receipt"
        : state.stage === "briefing"
          ? "Phase briefing"
          : state.stage === "choosing"
            ? state.tie
              ? eligible
                ? "Tiebreak · private entry"
                : "Tiebreak · watch the table"
              : "Your private figure"
            : state.stage === "phaseEnd"
              ? "One figure falls"
              : state.stage === "finished"
                ? "Final announcement"
                : state.tie
                  ? "Tiebreak reveal"
                  : "Simultaneous reveal";
  const dialogKey = details
    ? `${stageKey}:details`
    : help
      ? `${match.id}:help:${help}`
      : receiptDialog
        ? `${stageKey}:receipt`
        : stageKey;
  const close = () => {
    if (details) {
      setDetailsKey("");
      return;
    }
    if (help) {
      onHelpClose();
      return;
    }
    setDismissed(stageKey);
    setReceiptOpen(false);
    watch();
  };
  return (
    <div
      className="theatre-room"
      data-stage={state.stage}
      data-effects={
        resyncing || !connected ? "resync" : reduced ? "reduced" : "live"
      }
    >
      <div className="room-dashboard" ref={dashboardElement}>
        <div className="room-hud phase-header">
          <div>
            <div className="eyebrow">
              PHASE {phase.index} / {match.phases[0].active.length - 1} ·{" "}
              {phase.active.length - Number(!!phase.eliminated)} IN PLAY
            </div>
            <h1>{rule.name}</h1>
            <span className="hud-formula">
              {rule.formula}{" "}
              <small>
                ·{" "}
                {state.tie
                  ? "TIEBREAK · ELIMINATION ONLY"
                  : `ROUND ${state.roundNumber || 1} / 3 · ${state.roundNumber === 3 ? "2× DOUBLE STAKES" : "1× · 1× · 2×"}`}
              </small>
            </span>
          </div>
          <RoomClock
            deadline={state.deadline}
            serverTime={state.serverTime}
            stage={state.stage}
            label={
              state.tie
                ? "TIEBREAK"
                : state.stage === "briefing"
                  ? "RULE BRIEFING"
                  : state.stage === "phaseEnd"
                    ? "PHASE RESULT"
                    : state.stage === "finished"
                      ? "RESULTS"
                      : `ROUND ${state.roundNumber} / 3`
            }
          />
        </div>
        <AudioControls audio={audio} />
      </div>
      <div className="room-content">
        <div className="room-stage-column">
          <div className="room-stage" ref={stageElement}>
            <RoomScene
              state={state}
              meId={meId}
              latest={latest}
              effects={effects}
              dimmed={open}
            />
            {open && (
              <div className="room-overlay">
                <RoomDialog
                  key={dialogKey}
                  dialogKey={dialogKey}
                  title={title}
                  onClose={close}
                >
                  {details ? (
                    <>
                      <Scoreboard
                        state={state}
                        meId={meId}
                        shifts={effects.scores}
                      />
                      {latest && (
                        <RoundDisplay round={latest.result} names={names} />
                      )}
                      <details className="room-commitment">
                        <summary>Committed tie fallback</summary>
                        <p className="hash">
                          SHA-256
                          <br />
                          {phase.commitment}
                        </p>
                        <p className="fine">
                          Fixed before phase inputs. The completed phase’s seed
                          is revealed in replay.
                        </p>
                      </details>
                    </>
                  ) : help ? (
                    help === "circle" ? (
                      <CircleTutorial onClose={onHelpClose} />
                    ) : (
                      <Rules compact />
                    )
                  ) : receiptDialog ? (
                    <>
                      <h2>Your move is sealed.</h2>
                      <div className="receipt-number">{receipt!.pick}</div>
                      <p>
                        Only you can read this receipt. The table shows a sealed
                        card; your figure cannot be changed.
                      </p>
                      <button className="primary" onClick={close}>
                        Return to the table ↗
                      </button>
                    </>
                  ) : state.stage === "choosing" && !eligible ? (
                    <div className="room-briefing">
                      <Glyph kind={phase.rule} size={64} />
                      <h2>One tiebreak. One elimination.</h2>
                      <p>
                        Only {state.tieIds.map((id) => names[id]).join(", ")}{" "}
                        choose. Your seat is watching; no number can be
                        submitted.
                      </p>
                      <p className="fine">
                        The same phase rule applies. One bounded tiebreak, then
                        a committed draw only if still tied.
                      </p>
                      <button className="secondary" onClick={close}>
                        Watch the tiebreak ↗
                      </button>
                    </div>
                  ) : state.stage === "choosing" ? (
                    <>
                      <h2>
                        {state.tie ? "One last choice." : "Trust your read."}
                      </h2>
                      {state.tie && (
                        <p className="tie-instructions">
                          One bounded tiebreak for tied-at-risk seats. It
                          decides elimination only; a committed draw resolves
                          any remaining tie.
                        </p>
                      )}
                      <div className="entry-visual">
                        {phase.rule === "circle" ? (
                          <Circle pick={Number(pick) || 0} />
                        ) : (
                          <div className="entry-number">
                            {pick || "—"}
                            <small>VISIBLE ONLY TO YOU</small>
                          </div>
                        )}
                      </div>
                      {submissionError && (
                        <div className="room-submit-error" role="alert">
                          {submissionError}
                          <button
                            className="secondary"
                            onClick={onSync}
                            disabled={pending || !connected}
                          >
                            Sync committed choice
                          </button>
                        </div>
                      )}
                      {!connected && (
                        <p role="status">
                          Reconnecting. Your choice is not confirmed. Sync will
                          recover any committed lock.
                        </p>
                      )}
                      <form
                        className="room-number-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          onLock();
                        }}
                      >
                        <label htmlFor="pick">
                          {phase.rule === "circle"
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
                            disabled={pending || !connected}
                          >
                            {pending ? "COMMITTING…" : "Lock figure"}{" "}
                            <span>↗</span>
                          </button>
                        </div>
                        <p className="fine">
                          A lock is final. No number before the server deadline
                          means timeout.
                        </p>
                      </form>
                    </>
                  ) : state.stage === "briefing" ? (
                    <div className="room-briefing">
                      <Glyph kind={phase.rule} size={64} />
                      <h2>{rule.formula}</h2>
                      <p>{rule.description}</p>
                      <code>{rule.example}</code>
                      <p className="handicap-callout">
                        {phase.index === 1
                          ? "First phase: everyone starts at zero."
                          : "A fresh starting handicap replaces earlier losses. Tied survivors share rank; handicaps never stack."}
                      </p>
                      {phase.rule === "circle" && (
                        <button className="secondary" onClick={onCircle}>
                          Try the circle tutorial ↗
                        </button>
                      )}
                    </div>
                  ) : state.stage === "phaseEnd" ? (
                    <div className="room-elimination">
                      <Glyph kind={phase.rule} size={56} />
                      <h2>
                        {names[phase.eliminated!]}
                        <br />
                        <em>is eliminated.</em>
                      </h2>
                      <p>Their seat remains. Their spotlight goes out.</p>
                      <p className="fine">{state.notice}</p>
                      {phase.draw && (
                        <p>
                          A committed random draw resolved the remaining tie.
                          See candidates and the revealed seed in replay.
                        </p>
                      )}
                    </div>
                  ) : state.stage === "finished" ? (
                    <div className="room-finale">
                      <div className="eyebrow">
                        {state.practice
                          ? "PRACTICE RESULTS"
                          : "THE MATCH IS OVER"}
                      </div>
                      <Glyph kind={phase.rule} size={64} />
                      <h2>
                        {match.status === "champion" ? (
                          <>
                            {names[match.champion!]}
                            <br />
                            <em>stands alone.</em>
                          </>
                        ) : (
                          match.status
                        )}
                      </h2>
                      <p>{state.notice}</p>
                      {phase.draw && (
                        <p className="final-draw-note">
                          The tiebreak stayed level. The committed draw
                          eliminated {names[phase.eliminated!]}. Its proof is
                          available in replay.
                        </p>
                      )}
                      {latest && (
                        <div className="final-reveal">
                          <div className="eyebrow">
                            PHASE {latest.phase} ·{" "}
                            {latest.tiebreak
                              ? "TIEBREAK"
                              : `ROUND ${latest.round}`}{" "}
                            · FINAL REVEAL
                          </div>
                          <RoundDisplay round={latest.result} names={names} />
                        </div>
                      )}
                      <div className="finale-summary">
                        {match.phases.reduce((v, p) => v + p.rounds.length, 0)}{" "}
                        rounds revealed ·{" "}
                        {Math.ceil(
                          ((match.finishedAt ?? match.startedAt) -
                            match.startedAt) /
                            1000,
                        )}
                        s
                      </div>
                      <div className="finale-actions">
                        {state.host === meId && (
                          <button
                            className="primary"
                            disabled={pending || !connected}
                            onClick={onRematch}
                          >
                            Open a rematch ↗
                          </button>
                        )}
                        <button className="secondary" onClick={onReplay}>
                          Explore the replay
                        </button>
                      </div>
                      <p className="fine">
                        New match, fresh scores. Completed history is preserved.
                      </p>
                    </div>
                  ) : latest ? (
                    <RoundDisplay round={latest.result} names={names} />
                  ) : null}
                </RoomDialog>
              </div>
            )}
          </div>
          <div className="room-actions">
            <div className="room-watch-status" role="status">
              {state.stage === "choosing"
                ? eligible
                  ? locked
                    ? "Your move is sealed. Watch the table."
                    : state.tie
                      ? "You are at risk. Submit your tiebreak figure."
                      : "Your figure stays private until reveal."
                  : phase.active.includes(meId)
                    ? "Watching the tiebreak. Only tied-at-risk seats choose."
                    : "You’re still at the table. Watch the reveal and join the rematch."
                : state.notice}
            </div>
            <div className="room-action-buttons">
              {eligible && !locked && (
                <button
                  className="primary"
                  disabled={!connected || pending}
                  onClick={() => {
                    setDismissed("");
                    void audio.unlock();
                  }}
                >
                  Choose figure ↗
                </button>
              )}
              {eligible && locked && (
                <button
                  className="secondary"
                  disabled={!receipt}
                  onClick={() => {
                    setReceiptOpen(true);
                    void audio.unlock();
                  }}
                >
                  View my locked number
                </button>
              )}
              {!autoOverlay && state.stage === "intermission" && (
                <span className="eyebrow">
                  INTERMISSION · NEXT ROUND STARTS AUTOMATICALLY
                </span>
              )}
              {autoOverlay &&
                dismissed === stageKey &&
                !(eligible && !locked) && (
                  <button
                    className="secondary"
                    onClick={() => setDismissed("")}
                  >
                    View{" "}
                    {state.stage === "finished"
                      ? "results"
                      : state.stage === "phaseEnd"
                        ? "elimination"
                        : "stage details"}
                  </button>
                )}
              <button
                className="secondary"
                onClick={() => setDetailsKey(stageKey)}
              >
                Calculation & scoring details
              </button>
              <button className="text-button" onClick={onRules}>
                Scoring explained ↗
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
