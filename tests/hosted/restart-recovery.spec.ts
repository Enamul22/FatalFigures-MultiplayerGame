import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { Snapshot } from "../../shared/engine";
import { verifyReplay } from "../../shared/replay";

test("recover a previously checkpointed public maintenance verification", async ({
  page,
}) => {
  const control = process.env.FATAL_RECOVERY_CONTROL;
  test.skip(
    !control,
    "Only run with the private checkpoint from an actual controlled restart.",
  );
  const checkpoint = JSON.parse(await readFile(control!, "utf8"));
  expect(checkpoint.stage).toBe("restart-complete");
  const seats = JSON.parse(await readFile(control! + ".seats.json", "utf8"));
  let resumed: { state: Snapshot; pick: number | null } | undefined;
  const accept = (payload: string) => {
    const ack = payload.match(/^43\d+(\[.*)$/s);
    if (ack) {
      const value = JSON.parse(ack[1])[0]?.value;
      if (value?.state) resumed = value;
    }
  };
  page.on("websocket", (ws) =>
    ws.on("framereceived", (frame) => accept(String(frame.payload))),
  );
  page.on("response", async (response) => {
    if (
      response.url().includes("/socket.io/") &&
      response.url().includes("transport=polling")
    ) {
      try {
        for (const packet of (await response.text()).split("\x1e"))
          accept(packet);
      } catch {
        /* interrupted request */
      }
    }
  });
  await page.addInitScript(
    (cap) => sessionStorage.setItem("ff-seat", cap),
    seats.host,
  );
  await page.goto("/");
  await expect(
    page.getByRole("dialog", { name: "Final announcement" }),
  ).toBeVisible();
  await expect.poll(() => resumed?.state.match?.status).toBe("Interrupted");
  const state = resumed!.state;
  expect(state.match!.id).toBe(checkpoint.activeMatch);
  expect(state.match!.champion).toBeUndefined();
  expect(state.match!.phases[0].rounds).toHaveLength(0);
  expect(resumed!.pick).toBe(37);
  const complete = state.history.find(
    (m) => m.id === checkpoint.completedMatch,
  );
  expect(complete?.status).toBe("champion");
  expect(verifyReplay(complete!)).toBe(true);
  await page.getByRole("button", { name: "Explore the replay" }).click();
  await expect(page.locator(".match-replay")).toHaveCount(2);
  await page.screenshot({
    path: "docs/screenshots/22-live-render-persistent-history.png",
    fullPage: true,
    animations: "disabled",
  });
  console.log(
    "PUBLIC: actual controlled restart retained completed champion/history/replay, seat and private acknowledged 37; active match Interrupted with zero invented rounds/champion. PASS.",
  );
});
