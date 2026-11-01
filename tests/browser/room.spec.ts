import { test, expect, type Page } from "@playwright/test";
import { io, type Socket } from "socket.io-client";
const url = "http://localhost:3101";
async function ask(s: Socket, event: string, data: unknown = {}) {
  return new Promise<any>((resolve, reject) =>
    s
      .timeout(4000)
      .emit(event, data, (error: any, r: any) =>
        error || !r.ok ? reject(error || Error(r.error)) : resolve(r.value),
      ),
  );
}
async function connect() {
  const s = io(url, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
  });
  await new Promise<void>((resolve, reject) => {
    s.once("connect", () => resolve());
    s.once("connect_error", reject);
  });
  return s;
}
async function friends(page: Page, n: number) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Play with friends ↗", exact: true })
    .click();
  await page.getByLabel("Your nickname").fill("Enamul");
  await page
    .getByRole("button", { name: "Create room ↗", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Take your seat." }),
  ).toBeVisible();
  const code = (await page.locator(".room-code").innerText()).split(" ")[0],
    peers: Socket[] = [],
    caps: any[] = [],
    publicStates: any[] = [];
  for (let i = 1; i < n; i++) {
    const s = await connect();
    peers.push(s);
    s.on("state", (state) => (publicStates[i - 1] = state));
    caps.push(await ask(s, "join", { code, nickname: `Guest${i}` }));
    await ask(s, "ready", { ready: true });
  }
  await page.getByRole("button", { name: "I’m ready", exact: true }).click();
  await page.getByRole("button", { name: "Start match ↗" }).click();
  const tutorial = page.getByRole("button", { name: "I’ve got the circle ↗" });
  if (n === 2) {
    await expect(tutorial).toBeVisible();
    await tutorial.click();
  }
  await expect(page.getByLabel("Your figure", { exact: true })).toBeVisible();
  return { code, peers, caps, publicStates };
}
const positions = (page: Page) =>
  page.locator(".fixed-seat").evaluateAll((elements) =>
    elements.map((el) => ({
      id: el.getAttribute("data-seat-id"),
      index: el.getAttribute("data-seat-index"),
      left: (el as HTMLElement).style.left,
      top: (el as HTMLElement).style.top,
    })),
  );
for (const count of [2, 3, 4, 5])
  test(`${count}-seat friend room: stable seats, private receipt, disconnect, resync and retained reveal`, async ({
    page,
  }) => {
    const { peers, caps, publicStates } = await friends(page, count);
    try {
      await expect(page.locator(".fixed-seat")).toHaveCount(count);
      const original = await positions(page);
      await page.getByLabel("Your figure", { exact: true }).fill("37");
      await page.getByRole("button", { name: "Lock figure ↗" }).click();
      await expect(
        page.getByText("Your move is sealed. Watch the table.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.getByLabel("Your figure", { exact: true })).toHaveCount(
        0,
      );
      expect(await page.locator(".room-scene").innerText()).not.toContain("37");
      for (const s of publicStates) {
        expect(s.match.phases[0].rounds).toEqual([]);
        expect(JSON.stringify(s)).not.toContain('"pick":37');
      }
      await page.getByRole("button", { name: "View my locked number" }).click();
      await expect(
        page.getByRole("dialog", { name: "Your locked-number receipt" }),
      ).toBeVisible();
      await expect(page.locator(".receipt-number")).toHaveText("37");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      if (count === 3) {
        await page
          .getByRole("button", { name: "How to play", exact: true })
          .press("Enter");
        await expect(
          page.getByRole("dialog", { name: "How to play", exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Watch the table", exact: true }),
        ).toBeFocused();
        await expect(page.locator(".room-dashboard")).toHaveCSS(
          "filter",
          "none",
        );
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
      }
      await page.waitForTimeout(750);
      const mutations = await page.locator(".room-scene").evaluate(
        async (scene) =>
          await new Promise<number>((resolve) => {
            let changes = 0;
            const observer = new MutationObserver(
              (records) => (changes += records.length),
            );
            observer.observe(scene, {
              subtree: true,
              childList: true,
              attributes: true,
              characterData: true,
            });
            setTimeout(() => {
              observer.disconnect();
              resolve(changes);
            }, 850);
          }),
      );
      expect(mutations).toBe(0);
      const deadline = publicStates[0].deadline;
      await page.reload();
      await expect(
        page.getByRole("button", { name: "View my locked number" }),
      ).toBeEnabled();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(
        page.locator(".card-arriving,.card-revealing,.spotlight-fading"),
      ).toHaveCount(0);
      expect(await positions(page)).toEqual(original);
      expect(publicStates[0].deadline).toBe(deadline);
      peers[0].disconnect();
      await expect(
        page.locator(`[data-seat-id="${caps[0].seatId}"]`),
      ).toHaveAttribute("data-status", "disconnected");
      const restored = await connect();
      peers[0] = restored;
      await ask(restored, "resume", caps[0]);
      await expect(
        page.locator(`[data-seat-id="${caps[0].seatId}"]`),
      ).toHaveAttribute("data-status", "choosing");
      const roundId = publicStates.at(-1).roundId;
      for (let i = 0; i < peers.length; i++)
        await ask(peers[i], "lock", { roundId, pick: [10, 45, 90, 99][i] });
      await expect(
        page.getByRole("dialog", { name: "Simultaneous reveal" }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("region", { name: "Latest revealed result" })
          .getByRole("heading", { name: "Phase 1 · Round 1", exact: true }),
      ).toBeVisible();
      expect(await positions(page)).toEqual(original);
      const sceneBounds = await page.locator(".room-scene").boundingBox();
      for (const card of await page.locator(".number-card").all()) {
        const bounds = await card.boundingBox();
        expect(bounds!.y).toBeGreaterThanOrEqual(sceneBounds!.y);
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
          sceneBounds!.y + sceneBounds!.height,
        );
      }
      if (count === 5) {
        await page
          .getByRole("button", { name: "Watch the table", exact: true })
          .click();
        await page.locator("header.topbar").scrollIntoViewIfNeeded();
        await page.screenshot({
          path: "docs/screenshots/14-oval-table-revealed.png",
          fullPage: true,
          animations: "disabled",
        });
      }
      await expect(
        page.getByLabel("Your figure", { exact: true }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("region", { name: "Latest revealed result" })
          .getByRole("heading", { name: "Phase 1 · Round 1", exact: true }),
      ).toBeVisible();
      expect(await positions(page)).toEqual(original);
    } finally {
      peers.forEach((s) => s.disconnect());
    }
  });
test("phone room: sticky authority information, touch entry, reduced motion and missing audio", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  await context.addInitScript(() =>
    Object.defineProperty(window, "AudioContext", { value: undefined }),
  );
  const page = await context.newPage(),
    { peers } = await friends(page, 3);
  try {
    await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
    await expect(page.locator(".theatre-room")).toHaveAttribute(
      "data-effects",
      "reduced",
    );
    await page.getByRole("button", { name: "Room audio mute" }).tap();
    await expect(
      page.getByText("Audio unavailable · game continues", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Room volume").fill("0.35");
    await page.getByLabel("Intermission suspense", { exact: true }).check();
    await page.getByLabel("Your figure", { exact: true }).fill("37");
    await page
      .getByRole("button", { name: "Lock figure ↗" })
      .scrollIntoViewIfNeeded();
    const hud = await page.locator(".room-dashboard").boundingBox(),
      button = await page
        .getByRole("button", { name: "Lock figure ↗" })
        .boundingBox();
    expect(button!.y).toBeGreaterThan(hud!.y + hud!.height);
    expect(button!.y + button!.height).toBeLessThanOrEqual(844);
    await page.locator("header.topbar").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "docs/screenshots/15-oval-room-phone-entry.png",
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Lock figure ↗" }).tap();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "View my locked number" }),
    ).toBeEnabled();
    await page.locator("header.topbar").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "docs/screenshots/16-oval-room-phone-sealed.png",
      fullPage: true,
      animations: "disabled",
    });
  } finally {
    peers.forEach((s) => s.disconnect());
    await context.close();
  }
});
test("gesture-enabled real synthesized cues and optional intermission sound remain outside game control", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __audioStarts: number };
    w.__audioStarts = 0;
    const start = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (
      ...args: Parameters<OscillatorNode["start"]>
    ) {
      w.__audioStarts++;
      return start.apply(this, args);
    };
  });
  const { peers, publicStates } = await friends(page, 2);
  try {
    await page.getByRole("button", { name: "Room audio mute" }).click();
    await page.getByLabel("Room volume").fill("0.3");
    await page.getByLabel("Intermission suspense", { exact: true }).check();
    await page.getByLabel("Your figure", { exact: true }).fill("68");
    await page.getByRole("button", { name: "Lock figure ↗" }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { __audioStarts: number }).__audioStarts,
        ),
      )
      .toBeGreaterThan(0);
    await ask(peers[0], "lock", { roundId: publicStates[0].roundId, pick: 0 });
    await expect(
      page.getByRole("dialog", { name: "Simultaneous reveal" }),
    ).toBeVisible();
    const before = await page.evaluate(
      () => (window as unknown as { __audioStarts: number }).__audioStarts,
    );
    await expect(page.locator(".theatre-room")).toHaveAttribute(
      "data-stage",
      "intermission",
    );
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { __audioStarts: number }).__audioStarts,
        ),
      )
      .toBeGreaterThan(before);
    await page.getByRole("button", { name: "Room audio mute" }).click();
    await expect(
      page.getByRole("button", { name: "Room audio mute" }),
    ).toHaveAttribute("aria-pressed", "true");
  } finally {
    peers.forEach((s) => s.disconnect());
  }
});

test("browser audio permission rejection does not block room actions", async ({
  browser,
}) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    AudioContext.prototype.resume = () =>
      Promise.reject(new DOMException("Blocked by browser", "NotAllowedError"));
  });
  const page = await context.newPage(),
    { peers } = await friends(page, 2);
  try {
    await page.getByRole("button", { name: "Room audio mute" }).click();
    await expect(
      page.getByText("Audio unavailable · game continues", { exact: true }),
    ).toBeVisible();
    await page.getByLabel("Your figure", { exact: true }).fill("46");
    await page.getByRole("button", { name: "Lock figure ↗" }).click();
    await expect(
      page.getByRole("button", { name: "View my locked number" }),
    ).toBeEnabled();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  } finally {
    peers.forEach((s) => s.disconnect());
    await context.close();
  }
});
