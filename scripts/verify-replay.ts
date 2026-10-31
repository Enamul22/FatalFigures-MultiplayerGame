import { readFileSync } from "node:fs";
import { verifyReplay } from "../shared/replay.js";
if (!process.argv[2])
  throw Error("Usage: npm run verify:replay -- replay.json");
const ok = verifyReplay(JSON.parse(readFileSync(process.argv[2], "utf8")));
console.log(
  ok
    ? "Verified: exact scoring, phase totals, handicaps, bounded elimination and committed draw."
    : "INVALID replay",
);
process.exitCode = ok ? 0 : 1;
