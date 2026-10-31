import "dotenv/config";
import pg from "pg";
const url = new URL(
  process.env.DATABASE_URL_UNPOOLED ||
    "postgresql://fatalfigures:local-game-only@127.0.0.1:5544/fatalfigures",
);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
  url.pathname !== "/fatalfigures"
)
  throw Error(
    "This convenience command is restricted to a local fatalfigures database. Create remote CI test databases explicitly.",
  );
url.pathname = "/postgres";
const c = new pg.Client({ connectionString: url.toString() });
await c.connect();
try {
  for (const name of ["fatalfigures_test", "fatalfigures_browser_test"]) {
    if (
      !(await c.query("SELECT 1 FROM pg_database WHERE datname=$1", [name]))
        .rowCount
    )
      await c.query(`CREATE DATABASE ${name}`);
    console.log(`${name} ready (existing data not modified).`);
  }
} finally {
  await c.end();
}
