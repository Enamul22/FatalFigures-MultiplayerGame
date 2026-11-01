import { useCallback, useEffect, useMemo, useRef, useState } from "react";
export type Cue = "lock" | "reveal" | "elimination" | "champion";
/** Gesture-unlocked, optional Web Audio. Nothing in this hook awaits game actions. */
export function useRoomAudio() {
  const [muted, setMuted] = useState(
    () => localStorage.getItem("ff-muted") !== "false",
  );
  const [volume, setVolume] = useState(() => {
    const v = Number(localStorage.getItem("ff-volume") ?? ".2");
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.2;
  });
  const [suspense, setSuspense] = useState(
    () => localStorage.getItem("ff-suspense") === "true",
  );
  const [status, setStatus] = useState<
    "needs-gesture" | "ready" | "unavailable"
  >("needs-gesture");
  const context = useRef<AudioContext | null>(null),
    master = useRef<GainNode | null>(null),
    nodes = useRef(new Set<OscillatorNode>()),
    settings = useRef({ muted, volume });
  settings.current = { muted, volume };
  const stop = useCallback(() => {
    for (const n of nodes.current) {
      try {
        n.stop();
      } catch {
        /* already ended */
      }
    }
    nodes.current.clear();
  }, []);
  const unlock = useCallback(
    async (force = false) => {
      if (settings.current.muted && !force) return;
      try {
        if (!window.AudioContext) {
          setStatus("unavailable");
          return;
        }
        if (!context.current) {
          const ctx = new AudioContext();
          context.current = ctx;
          master.current = ctx.createGain();
          master.current.connect(ctx.destination);
          master.current.gain.value =
            settings.current.muted && !force ? 0 : settings.current.volume;
        }
        await context.current.resume();
        setStatus(
          context.current.state === "running" ? "ready" : "needs-gesture",
        );
      } catch {
        setStatus("unavailable");
        stop();
      }
    },
    [stop],
  );
  const toggle = useCallback(() => {
    const next = !settings.current.muted;
    settings.current.muted = next;
    setMuted(next);
    if (!next) void unlock(true);
    else stop();
  }, [unlock, stop]);
  const tone = useCallback(
    (
      frequency: number,
      offset: number,
      duration: number,
      level: number,
      type: OscillatorType = "sine",
    ) => {
      const ctx = context.current;
      if (
        settings.current.muted ||
        !ctx ||
        ctx.state !== "running" ||
        document.hidden ||
        !master.current
      )
        return;
      try {
        const osc = ctx.createOscillator(),
          gain = ctx.createGain(),
          at = ctx.currentTime + offset;
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, at);
        osc.connect(gain);
        gain.connect(master.current);
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(level, at + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
        nodes.current.add(osc);
        osc.onended = () => {
          nodes.current.delete(osc);
          osc.disconnect();
          gain.disconnect();
        };
        osc.start(at);
        osc.stop(at + duration + 0.02);
      } catch {
        setStatus("unavailable");
      }
    },
    [],
  );
  const cue = useCallback(
    (kind: Cue) => {
      if (kind === "lock") tone(330, 0, 0.18, 0.16, "triangle");
      if (kind === "reveal") {
        tone(220, 0, 0.45, 0.16);
        tone(440, 0.08, 0.4, 0.1);
      }
      if (kind === "elimination") {
        tone(146, 0, 0.65, 0.17);
        tone(73, 0.12, 0.7, 0.1);
      }
      if (kind === "champion") {
        [261.6, 329.6, 392].forEach((f, i) => tone(f, i * 0.08, 0.8, 0.12));
      }
    },
    [tone],
  );
  const intermission = useCallback(
    (seconds: number) => {
      stop();
      for (let i = 0; i < Math.min(10, seconds) - 0.05; i += 1.5) {
        tone(65.4, i, Math.min(0.9, seconds - i - 0.03), 0.055);
        if (i + 0.23 < seconds)
          tone(130.8, i + 0.18, Math.min(0.7, seconds - i - 0.21), 0.035);
      }
      return stop;
    },
    [stop, tone],
  );
  useEffect(() => {
    localStorage.setItem("ff-muted", String(muted));
    localStorage.setItem("ff-volume", String(volume));
    localStorage.setItem("ff-suspense", String(suspense));
    if (master.current && context.current)
      master.current.gain.setTargetAtTime(
        muted ? 0 : volume,
        context.current.currentTime,
        0.03,
      );
    if (muted) stop();
  }, [muted, volume, suspense, stop]);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      stop();
      void context.current?.close().catch(() => {});
    };
  }, [stop]);
  return useMemo(
    () => ({
      muted,
      volume,
      suspense,
      status,
      toggle,
      setVolume,
      setSuspense,
      unlock,
      cue,
      intermission,
      stop,
    }),
    [muted, volume, suspense, status, toggle, unlock, cue, intermission, stop],
  );
}
export type RoomAudio = ReturnType<typeof useRoomAudio>;
