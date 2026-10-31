import { it, expect } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { io, type Socket } from "socket.io-client";
import { TEST_URL, resetDb } from "./db-helper.js";
const port = 3317;
const children: ChildProcess[] = [],
  clients: Socket[] = [];
async function launch() {
  const child = spawn(process.execPath, ["dist/server/index.js"], {
    env: {
      ...process.env,
      DATABASE_URL: TEST_URL,
      DATABASE_URL_UNPOOLED: TEST_URL,
      NODE_ENV: "production",
      PORT: String(port),
      HOST: "127.0.0.1",
      ORIGIN: `https://localhost:${port}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  let output = "";
  child.stdout!.on("data", (b) => (output += String(b)));
  child.stderr!.on("data", (b) => (output += String(b)));
  const end = Date.now() + 6000;
  while (!output.includes("Fatal Figures listening")) {
    if (child.exitCode !== null || Date.now() > end)
      throw Error(`Child server did not start: ${output.slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, 20));
  }
  return child;
}
async function client() {
  const s = io(`http://127.0.0.1:${port}`, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
  });
  clients.push(s);
  await new Promise<void>((resolve, reject) => {
    s.once("connect", () => resolve());
    s.once("connect_error", reject);
  });
  return s;
}
async function ask(s: Socket, event: string, data: any = {}) {
  return await new Promise<any>((resolve, reject) =>
    s.timeout(3000).emit(event, data, (e: any, r: any) => {
      if (e || !r.ok) reject(e || Error(r.error));
      else resolve(r.value);
    }),
  );
}
it("survives an actual SIGKILL/process restart with durable lock, original clock and guest capability", async () => {
  await resetDb();
  try {
    const first = await launch(),
      a = await client(),
      b = await client(),
      cap = await ask(a, "create", { nickname: "RestartHost" });
    await ask(b, "join", { code: cap.code, nickname: "RestartGuest" });
    await ask(a, "ready", { ready: true });
    await ask(b, "ready", { ready: true });
    let state: any;
    a.on("state", (s) => (state = s));
    await ask(a, "start");
    const end = Date.now() + 17000;
    while (state?.stage !== "choosing") {
      if (Date.now() > end)
        throw Error("Choosing did not open under production timing");
      await new Promise((r) => setTimeout(r, 30));
    }
    const deadline = state.deadline,
      id = state.roundId,
      matchId = state.match.id;
    await ask(a, "lock", { roundId: id, pick: 73 });
    const exited = once(first, "exit");
    first.kill("SIGKILL");
    await exited;
    await launch();
    const restored = await client(),
      v = await ask(restored, "resume", cap);
    expect(v.pick).toBe(73);
    expect(v.state.deadline).toBe(deadline);
    expect(v.state.roundId).toBe(id);
    expect(v.state.match.id).toBe(matchId);
    expect(v.state.match.status).toBe("playing");
    expect(v.state.match.phases[0].rounds).toEqual([]);
    expect(v.state.seats).toHaveLength(2);
    expect((await ask(restored, "lock", { roundId: id, pick: 73 })).retry).toBe(
      true,
    );
  } finally {
    clients.forEach((c) => c.disconnect());
    for (const c of children)
      if (c.exitCode === null && c.signalCode === null) {
        const end = once(c, "exit");
        c.kill("SIGTERM");
        await end;
      }
  }
}, 30000);
