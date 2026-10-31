import express from "express";
import { createServer } from "node:http";
import { Server, type Socket } from "socket.io";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve as pathResolve } from "node:path";
import { z } from "zod";
import { Store, entropy, hash, authorized } from "./store.js";
import {
  advance,
  activePhase,
  createRoom,
  lock,
  participants,
  recover,
  rematch,
  snapshot,
  start,
  terminate,
  PRODUCTION,
  type Room,
  type Seat,
  type Timing,
} from "../shared/engine.js";
import { BOT_NAMES, botPick, rng, deepFreeze } from "../shared/bots.js";
const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[\p{L}\p{N} _.-]+$/u, "Use letters, numbers, spaces, . _ or -");
const codeSchema = z.string().regex(/^[A-Z2-9]{6}$/);
const credentials = z.object({
  code: codeSchema,
  seatId: z.string().uuid(),
  token: z.string().regex(/^[a-f0-9]{64}$/),
});
const newSeat = (
  nickname: string,
  bot?: string,
): { seat: Seat; token: string } => {
  const token = entropy();
  return {
    seat: {
      id: randomUUID(),
      nickname,
      tokenHash: hash(token),
      ready: !!bot,
      withdrawn: false,
      connected: true,
      bot,
    },
    token,
  };
};
export type AppOptions = {
  url: string;
  direct: string;
  origin: string;
  now?: () => number;
  timing?: Timing;
  testMode?: boolean;
  development?: boolean;
  tickMs?: number;
};
export async function createApp(options: AppOptions) {
  if (options.timing && !options.testMode)
    throw Error("Timing overrides are test-only");
  const now = options.now ?? Date.now,
    store = new Store(options.url);
  await store.claim(options.direct);
  const app = express();
  app.disable("x-powered-by");
  app.use(
    helmet({ contentSecurityPolicy: options.development ? false : undefined }),
  );
  app.use(
    rateLimit({
      windowMs: 60000,
      limit: 120,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  const limits = new Map<
    string,
    { at: number; connections: number; actions: number; creates: number }
  >();
  const quota = (ip: string) => {
    let q = limits.get(ip);
    if (!q || now() - q.at > 60000) {
      q = { at: now(), connections: 0, actions: 0, creates: 0 };
      limits.set(ip, q);
    }
    if (limits.size > 10000)
      for (const [key, v] of limits)
        if (now() - v.at > 60000) limits.delete(key);
    return q;
  };
  const http = createServer(app);
  const io = new Server(http, {
    maxHttpBufferSize: 8192,
    serveClient: false,
    allowRequest: (req, done) =>
      done(
        null,
        (!req.headers.origin || req.headers.origin === options.origin) &&
          ++quota(req.socket.remoteAddress ?? "unknown").connections <= 60,
      ),
  });
  const sockets = new Map<string, Set<string>>();
  let ticking = false,
    closed = false;
  const online = (seatId: string) => !!sockets.get(seatId)?.size;
  const connectivity = (r: Room, at: number) => {
    for (const s of r.seats) s.connected = !!s.bot || online(s.id);
    if (r.match?.status === "playing") {
      if (r.seats.some((s) => !s.bot && !s.withdrawn && s.connected))
        r.emptySince = null;
      else r.emptySince ??= at;
    }
    if (
      (r.stage === "lobby" || r.stage === "finished") &&
      !r.seats.some((s) => s.id === r.host && s.connected && !s.withdrawn)
    ) {
      const next = r.seats
        .filter((s) => s.connected && !s.bot && !s.withdrawn)
        .sort((a, b) => a.id.localeCompare(b.id))[0];
      if (next) r.host = next.id;
    }
  };
  const planBots = (r: Room, at: number) => {
    if (r.stage !== "choosing") return;
    const p = activePhase(r)!;
    for (const id of participants(r)) {
      const s = r.seats.find((s) => s.id === id)!;
      if (!s.bot || s.withdrawn || r.botPlans[id]) continue;
      const past = r.match!.phases.flatMap((p) => [
        ...p.rounds,
        ...(p.tiebreak ? [p.tiebreak] : []),
      ]);
      const view = deepFreeze({
        rule: p.rule,
        count: participants(r).length,
        history: Object.freeze(structuredClone(past)),
        own: Object.freeze(
          past.flatMap((x) =>
            x.rows
              .filter((row) => row.seatId === id && row.pick !== null)
              .map((row) => row.pick!),
          ),
        ),
      });
      const random = rng(randomBytes(4).readUInt32BE());
      r.botPlans[id] = {
        pick: botPick(s.bot, view, random),
        at: at + Math.min(2500 + random() * 4500, (r.deadline - at) * 0.5),
      };
    }
  };
  const publish = (r: Room) => io.to(r.code).emit("state", snapshot(r, now()));
  for (const code of await store.list()) {
    await store.change(code, now, "recovery", (r, at) => recover(r, at));
  }
  const stalled = (r: Room, at: number) => {
    if (r.match?.status === "playing" && at - r.heartbeat > 10000) {
      terminate(
        r,
        "Interrupted",
        at,
        "Server authority stalled beyond 10 seconds. History is preserved without catch-up penalties.",
      );
      return true;
    }
    return false;
  };
  const mutate = async <T>(
    code: string,
    kind: string,
    fn: (r: Room, at: number) => T,
  ) => {
    await store.ping();
    let interrupted = false;
    const changed = await store.change(code, now, kind, (r, at) => {
      if (stalled(r, at) && kind === "lock") {
        interrupted = true;
        return undefined as T;
      }
      const result = fn(r, at);
      connectivity(r, at);
      planBots(r, at);
      return result;
    });
    publish(changed.room);
    if (interrupted)
      throw Error(
        "Match interrupted after a server delay. Sync to read preserved history.",
      );
    return changed;
  };
  const getSession = (s: Socket) => {
    const data = s.data as { code?: string; seatId?: string };
    if (!data.code || !data.seatId) throw Error("Resume or join a seat first");
    return { code: data.code, seatId: data.seatId };
  };
  const bind = async (s: Socket, code: string, id: string) => {
    if (s.data.seatId) throw Error("Already in a room; leave first");
    s.data = { code, seatId: id };
    const set = sockets.get(id) || new Set<string>();
    set.add(s.id);
    sockets.set(id, set);
    await s.join(code);
  };
  const detach = async (s: Socket) => {
    const { code, seatId } = getSession(s);
    sockets.get(seatId)?.delete(s.id);
    await s.leave(code);
    s.data = {};
    return { code, seatId };
  };
  io.on("connection", (socket) => {
    let actions = 0,
      window = now();
    const handle = (event: string, fn: (data: any) => Promise<unknown>) =>
      socket.on(event, async (data, ack) => {
        if (typeof ack !== "function") return;
        try {
          if (now() - window > 60000) {
            window = now();
            actions = 0;
          }
          if (++actions > 90 || ++quota(socket.handshake.address).actions > 300)
            throw Error("Too many actions. Please slow down.");
          ack({ ok: true, value: await fn(data) });
        } catch (e) {
          const message =
            e instanceof z.ZodError
              ? "Check your nickname, room code or action fields."
              : e instanceof Error &&
                  /Room not found|Only|Need|already|deadline|round|seat|whole number|full|started|Resume|not valid|Too many|ready|choose|lobby|cannot|could not|interrupted/.test(
                    e.message,
                  )
                ? e.message
                : "The action could not be committed. Reconnect and retry.";
          ack({ ok: false, error: message });
        }
      });
    handle("create", async (data) => {
      if (++quota(socket.handshake.address).creates > 15)
        throw Error("Too many rooms. Please wait a minute.");
      const input = z
        .object({
          nickname: nameSchema,
          bots: z.number().int().min(0).max(4).default(0),
        })
        .parse(data);
      if (socket.data.seatId) throw Error("Already in a room");
      const { seat, token } = newSeat(input.nickname);
      let code: string;
      let r: Room;
      for (let n = 0; ; n++) {
        code = Array.from(
          randomBytes(6),
          (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32],
        ).join("");
        r = createRoom(
          code,
          seat,
          now(),
          input.bots > 0,
          options.timing ?? PRODUCTION,
        );
        for (let i = 0; i < input.bots; i++)
          r.seats.push(newSeat(BOT_NAMES[i], BOT_NAMES[i]).seat);
        try {
          await store.insert(r);
          break;
        } catch (e) {
          if ((e as { code?: string }).code !== "23505" || n > 5) throw e;
        }
      }
      await bind(socket, code, seat.id);
      return { code, seatId: seat.id, token, state: snapshot(r, now()) };
    });
    handle("join", async (data) => {
      const input = z
        .object({ nickname: nameSchema, code: codeSchema })
        .parse(data);
      if (socket.data.seatId) throw Error("Already in a room");
      const { seat, token } = newSeat(input.nickname);
      const { room } = await mutate(input.code, "join", (r) => {
        if (r.stage !== "lobby")
          throw Error("Match already started; use your own resume seat");
        if (r.seats.length >= 5) throw Error("Room is full");
        if (r.practice) throw Error("Practice room cannot accept human guests");
        r.seats.push(seat);
      });
      await bind(socket, input.code, seat.id);
      await mutate(input.code, "presence", () => {});
      return {
        code: input.code,
        seatId: seat.id,
        token,
        state: snapshot(room, now()),
      };
    });
    handle("resume", async (data) => {
      const input = credentials.parse(data);
      const r = await store.read(input.code);
      const seat = r.seats.find((s) => s.id === input.seatId);
      if (!seat || seat.bot || !authorized(seat.tokenHash, input.token))
        throw Error("Resume capability is not valid");
      await bind(socket, input.code, input.seatId);
      const { room } = await mutate(input.code, "resume", () => {});
      return {
        state: snapshot(room, now()),
        pick: room.picks[input.seatId] ?? null,
        events: await store.events(
          input.code,
          Number.isSafeInteger(data.after) ? Math.max(0, data.after) : 0,
        ),
      };
    });
    handle("sync", async () => {
      const { code, seatId } = getSession(socket),
        r = await store.read(code);
      return { state: snapshot(r, now()), pick: r.picks[seatId] ?? null };
    });
    handle("ready", async (data) => {
      const ready = z.boolean().parse(data?.ready),
        { code, seatId } = getSession(socket);
      await mutate(code, "ready", (r) => {
        if (r.stage !== "lobby") throw Error("The lobby has already started");
        r.seats.find((s) => s.id === seatId)!.ready = ready;
      });
      return {};
    });
    handle("start", async () => {
      const { code, seatId } = getSession(socket);
      await mutate(code, "start", (r, at) =>
        start(r, seatId, at, randomUUID(), entropy),
      );
      return {};
    });
    handle("lock", async (data) => {
      const input = z
          .object({
            roundId: z.string().max(100),
            pick: z.number().int().min(0).max(100),
          })
          .parse(data),
        { code, seatId } = getSession(socket);
      const { value } = await mutate(code, "lock", (r, at) => {
        const receipt = lock(r, seatId, input.roundId, input.pick, at);
        advance(r, at, entropy);
        return { ...receipt, roundId: input.roundId };
      });
      return value;
    });
    handle("rematch", async () => {
      const { code, seatId } = getSession(socket);
      await mutate(code, "rematch", (r) => rematch(r, seatId));
      return {};
    });
    handle("leave", async () => {
      const { code, seatId } = await detach(socket);
      await mutate(code, "leave", (r, at) => {
        const seat = r.seats.find((s) => s.id === seatId);
        if (!seat) return;
        if (r.stage === "lobby")
          r.seats = r.seats.filter((s) => s.id !== seatId);
        else seat.withdrawn = true;
        connectivity(r, at);
      });
      return {};
    });
    socket.on("disconnect", () => {
      if (!socket.data.seatId) return;
      const { code, seatId } = socket.data;
      sockets.get(seatId)?.delete(socket.id);
      if (!closed) void mutate(code, "disconnect", () => {}).catch(() => {});
    });
  });
  app.get("/api/health", async (_req, res) => {
    try {
      await store.ping();
      res.json({ status: "ok", authority: "single", durable: true });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });
  // No anonymous room/replay REST endpoint. Authenticated socket snapshots contain resolved events only.
  if (options.development) {
    const { createServer: makeVite } = await import("vite");
    const vite = await makeVite({
      configFile: pathResolve("vite.config.ts"),
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    http.on("close", () => void vite.close());
  } else {
    app.use(express.static(pathResolve("dist/web")));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(pathResolve("dist/web/index.html")),
    );
  }
  const timer = setInterval(async () => {
    if (ticking || closed) return;
    ticking = true;
    try {
      await store.ping();
      for (const code of await store.list(true)) {
        const { room, changed } = await store.change(
          code,
          now,
          "clock",
          (r, at) => {
            stalled(r, at);
            connectivity(r, at);
            for (const [id, plan] of Object.entries(r.botPlans)) {
              if (
                r.stage === "choosing" &&
                at < r.deadline &&
                at >= plan.at &&
                r.picks[id] === undefined
              )
                lock(r, id, r.roundId, plan.pick, at);
            }
            advance(r, at, entropy);
            planBots(r, at);
          },
        );
        if (changed) publish(room);
      }
    } catch {
      store.healthy = false;
      io.emit("unavailable", {
        message:
          "Server authority unavailable. Reconnect when service returns; locks are not acknowledged.",
      });
      io.disconnectSockets(true);
    } finally {
      ticking = false;
    }
  }, options.tickMs ?? 500);
  return {
    app,
    http,
    io,
    store,
    close: async () => {
      closed = true;
      clearInterval(timer);
      await new Promise<void>((res) => io.close(() => res()));
      await store.close();
    },
  };
}
