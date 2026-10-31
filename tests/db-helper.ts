import { Store } from "../server/store.js";
export const TEST_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://fatalfigures:local-game-only@127.0.0.1:5544/fatalfigures_test";
export function checkTestUrl() {
  if (!new URL(TEST_URL).pathname.endsWith("_test"))
    throw Error(
      "Integration database name must end in _test. Never use another project database.",
    );
}
export async function resetDb() {
  checkTestUrl();
  const s = new Store(TEST_URL);
  await s.migrate(TEST_URL);
  await s.pool.query(
    "TRUNCATE fatalfigures.choices,fatalfigures.events,fatalfigures.rooms",
  );
  await s.close();
}
