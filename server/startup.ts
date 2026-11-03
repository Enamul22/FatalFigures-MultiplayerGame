import { createApp, type AppOptions } from "./app.js";
import { AuthorityBusyError } from "./store.js";
/** Wait only for ownership contention. Never serve HTTP or acknowledge a lock
 * until the original exclusive lease and fenced authority row are acquired. */
export async function startAuthority(options: AppOptions, leaseWaitMs = 0) {
  const until = performance.now() + leaseWaitMs;
  let announced = false;
  for (;;) {
    try {
      return await createApp(options);
    } catch (error) {
      if (!(error instanceof AuthorityBusyError) || performance.now() >= until)
        throw error;
      if (!announced) {
        console.log(
          "Waiting for previous game authority to stop; HTTP readiness remains unavailable.",
        );
        announced = true;
      }
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.min(500, Math.max(1, until - performance.now())),
        ),
      );
    }
  }
}
