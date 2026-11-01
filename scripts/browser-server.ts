// ONLY the automated browser fixture imports this entrypoint. Not a public mode.
import { createApp } from "../server/app.js";
import { Store } from "../server/store.js";
import { PRODUCTION } from "../shared/engine.js";
const url =
  process.env.BROWSER_DATABASE_URL ||
  "postgresql://fatalfigures:local-game-only@127.0.0.1:5544/fatalfigures_browser_test";
if (!new URL(url).pathname.endsWith("_test"))
  throw Error("Browser fixture requires an isolated *_test database");
const s = new Store(url);
await s.migrate(url);
await s.pool.query(
  "TRUNCATE fatalfigures.events,fatalfigures.choices,fatalfigures.rooms",
);
await s.close();
const server = await createApp({
  url,
  direct: url,
  origin: "http://localhost:3101",
  testMode: true,
  timing: {
    ...PRODUCTION,
    choose: 12000,
    reveal: 2000,
    intermission: 700,
    briefing: 1200,
    phaseEnd: 1500,
    tieChoose: 9000,
    tieReveal: 1500,
    abandon: 6000,
  },
  tickMs: 35,
});
server.http.listen(3101, "127.0.0.1", () =>
  console.log(
    "TEST-ONLY browser server: shortened timers, isolated PostgreSQL, port 3101.",
  ),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => void server.close().then(() => process.exit(0)));
