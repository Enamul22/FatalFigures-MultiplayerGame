import { useCallback, useEffect, useMemo, useRef, useState } from "react";
export type Cue = "input" | "lock" | "reveal" | "elimination" | "champion";
/** A single local CC0 loop and short original cues; never awaited by gameplay. */
export function useRoomAudio(active = false) {
  const [muted, setMuted] = useState(
    () => localStorage.getItem("ff-muted") !== "false",
  );
  const [volume, setVolume] = useState(() => {
    const v = Number(localStorage.getItem("ff-volume") ?? ".2");
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.2;
  });
  const [suspense, setSuspense] = useState(
    () => localStorage.getItem("ff-music") !== "false",
  );
  const [status, setStatus] = useState<
    "needs-gesture" | "ready" | "unavailable"
  >("needs-gesture");
  const context = useRef<AudioContext | null>(null),
    master = useRef<GainNode | null>(null),
    musicGain = useRef<GainNode | null>(null),
    music = useRef<HTMLAudioElement | null>(null),
    nodes = useRef(new Set<OscillatorNode>()),
    settings = useRef({ muted, volume, suspense, active });
  settings.current = { muted, volume, suspense, active };
  // Stop transient cues without disrupting the continuous background track.
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
  const updateMusic = useCallback(() => {
    const el = music.current,
      ctx = context.current,
      gain = musicGain.current;
    if (!el || !ctx || !gain) return;
    const wanted =
      settings.current.active &&
      settings.current.suspense &&
      !settings.current.muted &&
      !document.hidden;
    gain.gain.setTargetAtTime(wanted ? 0.22 : 0, ctx.currentTime, 0.25);
    if (wanted && ctx.state === "running") {
      // play is idempotent; never reset currentTime on snapshots/reconnects.
      void el.play().catch((error: DOMException) => {
        setStatus(
          error.name === "NotAllowedError" ? "needs-gesture" : "unavailable",
        );
      });
    } else el.pause();
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
          master.current.gain.value =
            settings.current.muted && !force ? 0 : settings.current.volume;
          master.current.connect(ctx.destination);
          const el = new Audio("/audio/dark-things-loop.mp3");
          el.loop = true;
          el.preload = "none";
          el.onerror = () => {
            el.pause();
            setStatus("unavailable");
          };
          music.current = el;
          const source = ctx.createMediaElementSource(el),
            gain = ctx.createGain();
          gain.gain.value = 0;
          source.connect(gain);
          gain.connect(master.current);
          musicGain.current = gain;
        }
        await context.current.resume();
        setStatus(
          context.current.state === "running"
            ? music.current?.error
              ? "unavailable"
              : "ready"
            : "needs-gesture",
        );
        updateMusic();
      } catch {
        setStatus("unavailable");
        stop();
        music.current?.pause();
      }
    },
    [stop, updateMusic],
  );
  const toggle = useCallback(() => {
    const next = !settings.current.muted;
    settings.current.muted = next;
    setMuted(next);
    if (!next) void unlock(true);
    else {
      stop();
      updateMusic();
    }
  }, [unlock, stop, updateMusic]);
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
      if (kind === "input") {
        tone(523.25, 0, 0.2, 0.18, "triangle");
        tone(783.99, 0.16, 0.25, 0.14, "triangle");
      }
      if (kind === "lock") tone(330, 0, 0.18, 0.16, "triangle");
      if (kind === "reveal") {
        tone(220, 0, 0.45, 0.16);
        tone(440, 0.08, 0.4, 0.1);
      }
      if (kind === "elimination") {
        tone(146, 0, 0.65, 0.17);
        tone(73, 0.12, 0.7, 0.1);
      }
      if (kind === "champion")
        [261.6, 329.6, 392].forEach((f, i) => tone(f, i * 0.08, 0.8, 0.12));
    },
    [tone],
  );
  useEffect(() => {
    localStorage.setItem("ff-muted", String(muted));
    localStorage.setItem("ff-volume", String(volume));
    localStorage.setItem("ff-music", String(suspense));
    if (master.current && context.current)
      master.current.gain.setTargetAtTime(
        muted ? 0 : volume,
        context.current.currentTime,
        0.08,
      );
    if (muted) stop();
    updateMusic();
  }, [muted, volume, suspense, active, stop, updateMusic]);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) stop();
      updateMusic();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      stop();
      music.current?.pause();
      if (music.current) {
        music.current.removeAttribute("src");
        music.current.load();
      }
      void context.current?.close().catch(() => {});
      context.current = null;
      master.current = null;
      musicGain.current = null;
      music.current = null;
    };
  }, [stop, updateMusic]);
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
      stop,
    }),
    [muted, volume, suspense, status, toggle, unlock, cue, stop],
  );
}
export type RoomAudio = ReturnType<typeof useRoomAudio>;
