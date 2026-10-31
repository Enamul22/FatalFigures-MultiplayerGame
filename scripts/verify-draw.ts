import { readFileSync } from "node:fs";
import { verifyDraw } from "../shared/draw.js";
const file = process.argv[2];
if (!file) throw Error("Usage: npm run verify:draw -- draw.json");
const ok = verifyDraw(JSON.parse(readFileSync(file, "utf8")));
console.log(
  ok
    ? "Verified: commitment, sorted candidates, rejection counter and result match."
    : "INVALID draw",
);
process.exitCode = ok ? 0 : 1;
