import { test, expect, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { verifyReplay } from "../../shared/replay";
import type { Snapshot } from "../../shared/engine";
const control = process.env.FATAL_RESTART_CONTROL;
function observe(page: Page) {
  let latest: Snapshot | undefined;
  const accept = (s: string) => {
    if (s.startsWith('42["state",')) latest = JSON.parse(s.slice(2))[1];
    const ack = s.match(/^43\d+(\[.*)$/s);
    if (ack) {
      const value = JSON.parse(ack[1])[0]?.value;
      if (value?.state) latest = value.state;
    }
  };
  page.on("websocket", (ws) =>
    ws.on("framereceived", (frame) => accept(String(frame.payload))),
  );
  // Socket.IO can acknowledge resume over polling before upgrading to WebSocket.
  page.on("response", async (response) => {
    if (
      response.url().includes("/socket.io/") &&
      response.url().includes("transport=polling")
    ) {
      try {
        for (const packet of (await response.text()).split("\x1e"))
          accept(packet);
      } catch {
        /* disconnected polling request */
      }
    }
  });
  return () => latest;
}
async function tutorial(page: Page) {
  await expect(
    page.getByRole("button", { name: "I’ve got the circle ↗" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "I’ve got the circle ↗" }).click();
}
async function ready(page: Page) {
  await page.getByRole("button", { name: "I’m ready", exact: true }).click();
}
async function choose(page: Page, n: string) {
  await expect(page.getByLabel("Your figure", { exact: true })).toBeVisible({
    timeout: 120000,
  });
  await page.getByLabel("Your figure", { exact: true }).fill(n);
  await page.getByRole("button", { name: "Lock figure ↗" }).click();
  await expect(page.getByLabel("Your figure", { exact: true })).toHaveCount(0);
}
async function shot(page: Page, name: string) {
  await page.locator("header.topbar").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `docs/screenshots/${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
}
test("public HTTPS gameplay, privacy, audio, reconnect and controlled restart persistence", async ({
  browser,
}) => {
  if (!control)
    throw Error(
      "Set FATAL_RESTART_CONTROL to a private operator-control JSON path.",
    );
  const desktop = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    phone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      reducedMotion: "reduce",
    }),
    computer = await browser.newContext();
  await computer.addInitScript(() => {
    const NativeAudio = window.Audio;
    window.Audio = class extends NativeAudio {
      constructor(src?: string) {
        super(src);
        (window as unknown as { __music: HTMLAudioElement }).__music = this;
      }
    };
  });
  const host = await desktop.newPage(),
    guest = await phone.newPage(),
    cpu = await computer.newPage();
  const hostState = observe(host),
    guestState = observe(guest),
    cpuState = observe(cpu);
  try {
    await host.goto("/");
    await expect(host).toHaveTitle(/Fatal Figures/);
    await expect
      .poll(() =>
        host
          .locator(".brand img")
          .evaluate((el: HTMLImageElement) => el.naturalWidth),
      )
      .toBeGreaterThan(0);
    await shot(host, "18-live-render-landing");
    await host
      .getByRole("button", { name: "Play with friends ↗", exact: true })
      .click();
    await host.getByLabel("Your nickname").fill("Enamul QA");
    await host
      .getByRole("button", { name: "Create room ↗", exact: true })
      .click();
    const code = (await host.locator(".room-code").innerText()).split(" ")[0];
    await guest.goto(`/?room=${code}`);
    await guest
      .getByRole("button", { name: "Have a room code? Join the table →" })
      .click();
    await guest.getByLabel("Your nickname").fill("Phone QA");
    await guest
      .getByRole("button", { name: "Join room ↗", exact: true })
      .click();
    await Promise.all([ready(host), ready(guest)]);
    await host.getByRole("button", { name: "Start match ↗" }).click();
    await Promise.all([tutorial(host), tutorial(guest)]);
    let practiceError: unknown;
    const practice = (async () => {
      await cpu.goto("/");
      await cpu
        .getByRole("button", { name: "Play with computer", exact: true })
        .click();
      await cpu.getByLabel("Your nickname").fill("Computer QA");
      await cpu.getByLabel("Strategy bots").selectOption("1");
      await cpu
        .getByRole("button", { name: "Open practice room ↗", exact: true })
        .click();
      await ready(cpu);
      await cpu.getByRole("button", { name: "Start match ↗" }).click();
      await tutorial(cpu);
      await cpu.getByRole("button", { name: "Room audio mute" }).click();
      await cpu.getByLabel("Room volume").fill("0.25");
      await expect
        .poll(() =>
          cpu.evaluate(() => {
            const m = (window as unknown as { __music?: HTMLAudioElement })
              .__music;
            return m?.currentTime ?? 0;
          }),
        )
        .toBeGreaterThan(0);
      await cpu.getByRole("button", { name: "Room audio mute" }).click();
      await expect
        .poll(() =>
          cpu.evaluate(
            () =>
              (window as unknown as { __music: HTMLAudioElement }).__music
                .paused,
          ),
        )
        .toBe(true);
      while (cpuState()?.stage !== "finished") {
        const input = cpu.getByLabel("Your figure", { exact: true });
        if (await input.isVisible()) await choose(cpu, "68");
        await cpu.waitForTimeout(200);
      }
      expect(cpuState()!.practice).toBe(true);
      expect(verifyReplay(cpuState()!.match!)).toBe(true);
      await expect(
        cpu.getByRole("dialog", { name: "Final announcement" }),
      ).toBeVisible();
      await cpu.getByRole("button", { name: "Explore the replay" }).click();
      await cpu.locator(".match-replay>summary").click();
      await expect(cpu.locator(".match-replay")).toContainText(
        "The Final Circle",
      );
      console.log(
        "PUBLIC: computer play, exact replay, continuous audio and mute/volume passed.",
      );
    })().catch((error) => {
      practiceError = error;
    });
    await choose(host, "0");
    await expect(host.getByRole("dialog")).toHaveCount(0);
    await expect(
      host.getByRole("button", { name: "View my locked number" }),
    ).toBeEnabled();
    expect(guestState()!.match!.phases[0].rounds).toHaveLength(0);
    expect(guestState()).not.toHaveProperty("picks");
    await expect(guest.locator(".number-card.is-open")).toHaveCount(0);
    const firstDeadline = hostState()!.deadline;
    await host.reload();
    await expect(
      host.getByRole("button", { name: "View my locked number" }),
    ).toBeEnabled();
    await expect(host.getByRole("dialog")).toHaveCount(0);
    expect(hostState()!.deadline).toBe(firstDeadline);
    await host.getByRole("button", { name: "View my locked number" }).click();
    await expect(host.locator(".receipt-number")).toHaveText("0");
    await host.keyboard.press("Escape");
    await choose(guest, "0");
    await expect(
      host.getByRole("dialog", { name: "Simultaneous reveal" }),
    ).toBeVisible();
    await host
      .getByRole("button", { name: "Watch the table", exact: true })
      .click();
    await shot(host, "19-live-render-room");
    await shot(guest, "20-live-render-phone");
    for (let round = 2; round <= 3; round++) {
      await choose(host, "0");
      await choose(guest, "0");
    }
    await expect(
      host.getByRole("dialog", { name: "Tiebreak · private entry" }),
    ).toBeVisible({ timeout: 120000 });
    await choose(host, "0");
    await choose(guest, "0");
    await expect.poll(() => hostState()?.stage).toBe("finished");
    const complete = hostState()!.match!,
      p = complete.phases[0];
    expect(complete.status).toBe("champion");
    expect(p.tiebreak).toBeTruthy();
    expect(p.draw).toBeTruthy();
    expect(complete.finishedAt).toBe(p.tiebreak!.resolvedAt);
    expect(verifyReplay(complete)).toBe(true);
    await expect(
      host.getByRole("dialog", { name: "Final announcement" }),
    ).toBeVisible();
    await expect(host.locator(".final-draw-note")).toBeVisible();
    await shot(host, "21-live-render-champion");
    await practice;
    if (practiceError) throw practiceError;
    console.log(
      "PUBLIC: independent friend sessions, phone, sealed choice, refresh receipt, reveal, exact scoring and immediate tied champion passed.",
    );
    await host.getByRole("button", { name: "Open a rematch ↗" }).click();
    await expect(
      host.getByRole("heading", { name: "Take your seat." }),
    ).toBeVisible();
    await Promise.all([ready(host), ready(guest)]);
    await host.getByRole("button", { name: "Start match ↗" }).click();
    await Promise.all([tutorial(host), tutorial(guest)]);
    await choose(host, "37");
    await expect(
      host.getByRole("button", { name: "View my locked number" }),
    ).toBeEnabled();
    const interruptedId = hostState()!.match!.id;
    // Private recovery material for an operator interrupted during maintenance.
    // Never print these capabilities or put the control directory in Git.
    await writeFile(
      control + ".seats.json",
      JSON.stringify({
        host: await host.evaluate(() => sessionStorage.getItem("ff-seat")),
        guest: await guest.evaluate(() => sessionStorage.getItem("ff-seat")),
      }),
      { mode: 0o600 },
    );
    await writeFile(
      control,
      JSON.stringify({
        stage: "restart-ready",
        completedMatch: complete.id,
        activeMatch: interruptedId,
        roomCode: code,
      }),
      { mode: 0o600 },
    );
    console.log(
      "PUBLIC: restart-ready. Operator must suspend, confirm lease released, then resume/redeploy and signal completion.",
    );
    await expect
      .poll(
        async () => {
          try {
            return JSON.parse(await readFile(control, "utf8")).stage;
          } catch {
            return "waiting";
          }
        },
        { timeout: 1800000, intervals: [500] },
      )
      .toBe("restart-complete");
    // A fresh reload obtains the durable public snapshot and own private resume acknowledgement.
    await host.reload();
    await expect(
      host.getByRole("dialog", { name: "Final announcement" }),
    ).toBeVisible({ timeout: 120000 });
    await expect.poll(() => hostState()?.match?.status).toBe("Interrupted");
    const after = hostState()!;
    expect(after.match!.id).toBe(interruptedId);
    expect(after.match!.champion).toBeUndefined();
    expect(
      after.history.some(
        (m) => m.id === complete.id && m.champion === complete.champion,
      ),
    ).toBe(true);
    expect(after.match!.phases[0].rounds).toHaveLength(0);
    await host.getByRole("button", { name: "Explore the replay" }).click();
    await expect(host.locator(".match-replay")).toHaveCount(2);
    await shot(host, "22-live-render-persistent-history");
    await writeFile(
      control,
      JSON.stringify({
        stage: "verified",
        completedMatch: complete.id,
        activeMatch: interruptedId,
        historyPersisted: true,
        interruption: "Interrupted",
        noInventedRounds: true,
      }),
      { mode: 0o600 },
    );
    console.log(
      "PUBLIC: controlled restart retained completed history; active match interrupted without invented rounds/champion. PASS.",
    );
  } finally {
    await Promise.all([desktop.close(), phone.close(), computer.close()]);
  }
});
