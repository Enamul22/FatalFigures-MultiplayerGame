import "dotenv/config";
import { Store } from "./store.js";
const url = process.env.DATABASE_URL_UNPOOLED;
if (!url) throw Error("DATABASE_URL_UNPOOLED required for migrations");
if (new URL(url).hostname.includes("-pooler"))
  throw Error("Use a direct migration URL");
const s = new Store(url);
await s.migrate(url);
await s.close();
console.log("Versioned migrations applied to fatalfigures schema.");
