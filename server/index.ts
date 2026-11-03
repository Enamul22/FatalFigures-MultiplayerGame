import "dotenv/config";
import { startAuthority } from "./startup.js";
const {
  DATABASE_URL,
  DATABASE_URL_UNPOOLED,
  ORIGIN,
  PORT = "3000",
  HOST = "127.0.0.1",
} = process.env;
if (!DATABASE_URL || !DATABASE_URL_UNPOOLED || !ORIGIN)
  throw Error(
    "Set DATABASE_URL, DATABASE_URL_UNPOOLED and ORIGIN. Run migrations first. No in-memory fallback.",
  );
if (process.env.NODE_ENV === "production" && !ORIGIN.startsWith("https://"))
  throw Error("Production ORIGIN must use HTTPS");
const leaseWaitMs = Number(process.env.FATAL_LEASE_WAIT_MS ?? "0");
if (!Number.isInteger(leaseWaitMs) || leaseWaitMs < 0 || leaseWaitMs > 300000)
  throw Error("FATAL_LEASE_WAIT_MS must be an integer from 0 to 300000");
const server = await startAuthority(
  {
    url: DATABASE_URL,
    direct: DATABASE_URL_UNPOOLED,
    origin: ORIGIN,
    development: process.env.NODE_ENV !== "production",
  },
  leaseWaitMs,
);
server.http.listen(Number(PORT), HOST, () =>
  console.log(
    `Fatal Figures listening on ${HOST}:${PORT}; single authority, durable PostgreSQL.`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
