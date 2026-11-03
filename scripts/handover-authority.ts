import "dotenv/config";
import pg from "pg";
const url = process.env.DATABASE_URL_UNPOOLED;
const args = process.argv.slice(2),
  hostArg = args.find((a) => a.startsWith("--expected-host="))?.split("=")[1],
  pidArg = args.find((a) => a.startsWith("--expected-pid="))?.split("=")[1];
if (!url || !hostArg)
  throw Error(
    "Provide private DATABASE_URL_UNPOOLED and --expected-host=<reviewed game endpoint>.",
  );
const target = new URL(url);
if (
  target.hostname !== hostArg ||
  target.hostname.includes("-pooler") ||
  decodeURIComponent(target.pathname) !== "/fatalfigures"
)
  throw Error(
    "Refusing unreviewed host, pooled connection or non-game database.",
  );
const terminate = args.includes("--terminate");
const expectedPid = Number(pidArg);
if (terminate && (!Number.isInteger(expectedPid) || expectedPid < 1))
  throw Error(
    "Termination requires --expected-pid=<PID from the pre-deploy dry run>.",
  );
const c = new pg.Client({ connectionString: url });
try {
  await c.connect();
  const { rows } = await c.query(
    "select l.pid from pg_locks l join pg_stat_activity a using(pid) where l.locktype='advisory' and l.classid=0 and l.objid=82304712 and l.granted and l.database=(select oid from pg_database where datname=current_database()) and a.usename=current_user",
  );
  if (rows.length !== 1)
    throw Error(
      "Expected exactly one current game authority; no session was terminated.",
    );
  const pid = Number(rows[0].pid);
  if (!terminate)
    console.log(
      JSON.stringify({
        dryRun: true,
        database: "fatalfigures",
        ownerPid: pid,
        expectedHostMatched: true,
      }),
    );
  else {
    if (pid !== expectedPid)
      throw Error(
        "Authority changed since the dry run; refusing to terminate a different owner.",
      );
    const stopped = (
      await c.query("select pg_terminate_backend($1) stopped", [expectedPid])
    ).rows[0].stopped;
    if (!stopped)
      throw Error("The reviewed authority session was not terminated.");
    console.log(
      JSON.stringify({
        oldAuthoritySessionStopped: true,
        ownerPid: expectedPid,
        recordsModified: false,
      }),
    );
  }
} finally {
  await c.end();
}
