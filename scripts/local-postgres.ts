import EmbeddedPostgres from "embedded-postgres";
import { existsSync, writeFileSync } from "node:fs";
const db = new EmbeddedPostgres({
  databaseDir: ".pgdata",
  user: "fatalfigures",
  password: "local-game-only",
  port: 5544,
  persistent: true,
  autoRehydrateSymlinks: true,
  onLog: () => {},
  onError: () => {},
});
if (!existsSync(".pgdata/PG_VERSION")) await db.initialise();
await db.start();
try {
  await db.createDatabase("fatalfigures");
} catch (e) {
  if (!String(e).includes("already exists")) throw e;
}
if (!existsSync(".env")) {
  writeFileSync(
    ".env",
    "DATABASE_URL=postgresql://fatalfigures:local-game-only@127.0.0.1:5544/fatalfigures\nDATABASE_URL_UNPOOLED=postgresql://fatalfigures:local-game-only@127.0.0.1:5544/fatalfigures\nPORT=3000\nHOST=127.0.0.1\nORIGIN=http://localhost:3000\n",
    { mode: 0o600 },
  );
}
console.log(
  "Local persistent PostgreSQL ready at 127.0.0.1:5544; Ctrl+C to stop. Data: .pgdata (ignored).",
);
process.on("SIGINT", async () => {
  await db.stop();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await db.stop();
  process.exit(0);
});
setInterval(() => {}, 60000);
