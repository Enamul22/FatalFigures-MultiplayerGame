import { test, expect } from "@playwright/test";
import { verifyReplay } from "../../shared/replay";
import type { Snapshot } from "../../shared/engine";

test("public three-seat elimination ladder and ordinary final", async ({
  page,
}) => {
  let state: Snapshot | undefined;
  page.on("websocket", (ws) =>
    ws.on("framereceived", (frame) => {
      const payload = String(frame.payload);
      if (payload.startsWith('42["state",'))
        state = JSON.parse(payload.slice(2))[1];
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Play with computer", exact: true })
    .click();
  await page.getByLabel("Your nickname").fill("Ladder QA");
  await page.getByLabel("Strategy bots").selectOption("2");
  await page
    .getByRole("button", { name: "Open practice room ↗", exact: true })
    .click();
  await page.getByRole("button", { name: "I’m ready", exact: true }).click();
  await page
    .getByRole("button", { name: "Start match ↗", exact: true })
    .click();
  const end = Date.now() + 1200000;
  while (state?.stage !== "finished" && Date.now() < end) {
    const tutorial = page.getByRole("button", {
      name: "I’ve got the circle ↗",
    });
    if (await tutorial.isVisible()) await tutorial.click();
    const input = page.getByLabel("Your figure", { exact: true });
    if ((await input.isVisible()) && (await input.isEnabled())) {
      await input.fill("68");
      await page
        .getByRole("button", { name: "Lock figure ↗", exact: true })
        .click();
      await expect(input).toHaveCount(0);
    }
    await page.waitForTimeout(250);
  }
  expect(state?.match?.status).toBe("champion");
  expect(state!.match!.phases).toHaveLength(2);
  expect(state!.match!.phases[0].eliminated).toBeTruthy();
  expect(verifyReplay(state!.match!)).toBe(true);
  await expect(page.locator(".fixed-seat.is-eliminated")).toHaveCount(2);
  await expect(
    page.getByRole("dialog", { name: "Final announcement" }),
  ).toBeVisible();
  const final = state!.match!.phases[1];
  expect(state!.match!.finishedAt).toBe(
    (final.tiebreak ?? final.rounds.at(-1))!.resolvedAt,
  );
  console.log(
    "PUBLIC: three-seat scoring, elimination, retained dim seats, exact replay and immediate final passed.",
  );
});
