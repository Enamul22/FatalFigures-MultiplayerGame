import {
  test,
  expect,
  chromium,
  firefox,
  type BrowserContext,
  type Page,
} from "@playwright/test";
const shot = async (p: Page, name: string) => {
  await p.locator("header.topbar").scrollIntoViewIfNeeded();
  await p.screenshot({
    path: `docs/screenshots/${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
};
async function closeTutorial(p: Page) {
  const button = p.getByRole("button", { name: "I’ve got the circle ↗" });
  if (await button.isVisible()) await button.click();
}
async function ready(p: Page) {
  await p.getByRole("button", { name: "I’m ready", exact: true }).click();
  await expect(
    p.getByRole("button", { name: "✓ You are ready · Undo" }),
  ).toBeVisible();
}
async function create(p: Page, name: string, bots = 0) {
  await p.goto("/");
  await p
    .getByRole("button", {
      name: bots ? "Play with computer" : "Play with friends ↗",
      exact: true,
    })
    .click();
  await p.getByLabel("Your nickname").fill(name);
  if (bots) await p.getByLabel("Strategy bots").selectOption(String(bots));
  await p
    .getByRole("button", {
      name: bots ? "Open practice room ↗" : "Create room ↗",
      exact: true,
    })
    .click();
  await expect(
    p.getByRole("heading", { name: "Take your seat." }),
  ).toBeVisible();
  return (await p.locator(".room-code").innerText()).split(" ")[0];
}
test("desktop + phone, keyboard/touch, validation, mute and reduced motion", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Fatal Figures/);
  await expect
    .poll(() =>
      page
        .locator(".brand img")
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "How to play", exact: true })
    .press("Enter");
  await expect(
    page.getByRole("dialog", { name: "How to play", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Close rules", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await shot(page, "01-landing-desktop");
  await page
    .getByRole("button", { name: "Reduce motion", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Reduce motion", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Enable sound", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Mute sound", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Mute sound", exact: true }).click();
  const phone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      reducedMotion: "reduce",
    }),
    mobile = await phone.newPage();
  await mobile.goto("/");
  await expect(mobile.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await shot(mobile, "02-landing-phone");
  await mobile
    .getByRole("button", { name: "Play with computer", exact: true })
    .tap();
  await mobile.getByLabel("Your nickname").fill("Enamul");
  await mobile.getByLabel("Strategy bots").selectOption("1");
  await mobile.getByRole("button", { name: "Open practice room ↗" }).tap();
  await shot(mobile, "03-lobby-phone");
  await ready(mobile);
  await mobile.getByRole("button", { name: "Start match ↗" }).tap();
  await expect(
    mobile.getByRole("dialog", { name: "Final Circle tutorial" }),
  ).toBeVisible();
  await shot(mobile, "04-circle-tutorial-phone");
  await closeTutorial(mobile);
  await expect(mobile.getByLabel("Your figure", { exact: true })).toBeVisible();
  await mobile.getByLabel("Your figure", { exact: true }).fill("101");
  await mobile.getByRole("button", { name: "Lock figure ↗" }).tap();
  expect(
    await mobile
      .getByLabel("Your figure", { exact: true })
      .evaluate((e: HTMLInputElement) => e.validity.rangeOverflow),
  ).toBe(true);
  await mobile.getByLabel("Your figure", { exact: true }).fill("68");
  await shot(mobile, "05-circle-phone");
  await mobile.getByRole("button", { name: "Lock figure ↗" }).tap();
  await expect(
    mobile.getByText("Your move is sealed. Watch the table.", { exact: true }),
  ).toBeVisible();
  await shot(mobile, "06-locked-phone");
  await phone.close();
});
test("five independent sessions, Chromium + Firefox, full 5→4→3→2→champion, timeout, tie, shared handicaps, replay, rematch", async () => {
  const browsers = [await chromium.launch(), await firefox.launch()],
    contexts: BrowserContext[] = [],
    pages: Page[] = [];
  const received: string[][] = [];
  try {
    for (let i = 0; i < 5; i++) {
      const c = await browsers[i % 2].newContext({
        viewport: { width: 1440, height: 1000 },
      });
      contexts.push(c);
      const p = await c.newPage();
      pages.push(p);
      received.push([]);
      p.on("websocket", (ws) =>
        ws.on("framereceived", (frame) => {
          const str = String(frame.payload);
          if (str.startsWith('42["state"')) received[i].push(str);
        }),
      );
    }
    const names = ["Enamul", "Mira", "Ishan", "Nova", "Alex"],
      code = await create(pages[0], names[0]);
    for (let i = 1; i < 5; i++) {
      await pages[i].goto(`/?room=${code}`);
      await pages[i]
        .getByRole("button", { name: "Have a room code? Join the table →" })
        .click();
      await pages[i].getByLabel("Your nickname").fill(names[i]);
      await pages[i]
        .getByRole("button", { name: "Join room ↗", exact: true })
        .click();
      await expect(
        pages[i].getByRole("heading", { name: "Take your seat." }),
      ).toBeVisible();
    }
    await shot(pages[0], "07-lobby-desktop");
    await Promise.all(pages.map(ready));
    await pages[0].getByRole("button", { name: "Start match ↗" }).click();
    await expect(
      pages[0].getByLabel("Your figure", { exact: true }),
    ).toBeVisible();
    const stableSeats = await pages[0]
      .locator(".fixed-seat")
      .evaluateAll((els) =>
        els.map((el) => ({
          id: el.getAttribute("data-seat-id"),
          left: (el as HTMLElement).style.left,
          top: (el as HTMLElement).style.top,
        })),
      );
    await shot(pages[0], "08-table-desktop");
    // A genuine human timeout in round one. Others collide at zero.
    for (let i = 0; i < 4; i++) {
      await pages[i].getByLabel("Your figure", { exact: true }).fill("0");
      await pages[i].getByRole("button", { name: "Lock figure ↗" }).click();
    }
    expect(received[4].some((s) => s.includes('"pick":0'))).toBe(false);
    await pages[0].reload();
    await expect(
      pages[0].getByText("Your move is sealed. Watch the table.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      pages[0].getByText("Missed deadline", { exact: true }).first(),
    ).toBeVisible({ timeout: 12000 });
    await shot(pages[0], "09-reveal-desktop");
    let sawTie = false,
      sawShared = false,
      sawCircle = false,
      lastKey = "",
      finished = false;
    for (let step = 0; step < 600 && !finished; step++) {
      const observer = pages[0];
      if (
        await observer
          .getByText("THE MATCH IS OVER", { exact: true })
          .isVisible()
      ) {
        finished = true;
        break;
      }
      for (const p of pages) await closeTutorial(p);
      const snapshots = received[0];
      const last = snapshots.at(-1);
      if (last) {
        const s = JSON.parse(last.slice(2))[1];
        const phase = s.match?.phases.at(-1);
        if (
          phase?.index === 2 &&
          Object.values(phase.handicaps).every((x) => x === 0)
        )
          sawShared = true;
        if (phase?.rule === "circle") sawCircle = true;
        if (s.tie) sawTie = true;
        if (s.stage === "choosing" && s.roundId !== lastKey) {
          lastKey = s.roundId;
          for (const p of pages) {
            const input = p.getByLabel("Your figure", { exact: true });
            if (await input.isVisible()) {
              await input.fill("0");
              await p.getByRole("button", { name: "Lock figure ↗" }).click();
            }
          }
        }
      }
      await observer.waitForTimeout(100);
    }
    expect(finished).toBe(true);
    expect(sawTie).toBe(true);
    expect(sawShared).toBe(true);
    expect(sawCircle).toBe(true);
    expect(
      await pages[0].locator(".fixed-seat").evaluateAll((els) =>
        els.map((el) => ({
          id: el.getAttribute("data-seat-id"),
          left: (el as HTMLElement).style.left,
          top: (el as HTMLElement).style.top,
        })),
      ),
    ).toEqual(stableSeats);
    await expect(pages[0].locator(".fixed-seat.is-eliminated")).toHaveCount(4);
    await expect(
      pages[0].locator(".fixed-seat.is-eliminated .seat-light").first(),
    ).toHaveCSS("opacity", "0");
    {
      await pages[0]
        .getByRole("button", { name: "Watch the table", exact: true })
        .click();
      await pages[0].locator("header.topbar").scrollIntoViewIfNeeded();
      await pages[0].screenshot({
        path: "docs/screenshots/17-fixed-seats-champion.png",
        fullPage: true,
        animations: "disabled",
      });
      await pages[0]
        .getByRole("button", { name: "View results", exact: true })
        .click();
    }
    await shot(pages[0], "10-results-desktop");
    const last = JSON.parse(received[0].at(-1)!.slice(2))[1];
    expect(last.match.phases.map((p: any) => p.active.length)).toEqual([
      5, 4, 3, 2,
    ]);
    expect(
      last.match.phases.every(
        (p: any) => p.rounds.length === 3 && p.eliminated,
      ),
    ).toBe(true);
    const oldId = last.match.id;
    await pages[0].getByRole("button", { name: "Explore the replay" }).click();
    await pages[0].locator(".match-replay>summary").click();
    await pages[0]
      .getByText("Round 1 · 1× · No winner", { exact: true })
      .first()
      .click();
    await shot(pages[0], "11-replay-desktop");
    await pages[0].getByRole("button", { name: "Back to table" }).click();
    await pages[0].getByRole("button", { name: "Open a rematch ↗" }).click();
    await expect(
      pages[0].getByRole("heading", { name: "Take your seat." }),
    ).toBeVisible();
    await Promise.all(pages.map(ready));
    await pages[0].getByRole("button", { name: "Start match ↗" }).click();
    await expect(pages[0].locator(".phase-header h1")).toHaveText("The Crowd");
    await expect
      .poll(() => JSON.parse(received[0].at(-1)!.slice(2))[1].match?.id)
      .not.toBeUndefined();
    const fresh = JSON.parse(received[0].at(-1)!.slice(2))[1];
    expect(fresh.match.id).not.toBe(oldId);
    expect(fresh.history[0].id).toBe(oldId);
    expect(Object.values(fresh.match.phases[0].handicaps)).toEqual([
      0, 0, 0, 0, 0,
    ]);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
    await Promise.all(browsers.map((b) => b.close()));
  }
});
test("complete labelled practice with bots and a two-seat start", async ({
  page,
}) => {
  await create(page, "Enamul", 1);
  await ready(page);
  await page.getByRole("button", { name: "Start match ↗" }).click();
  await closeTutorial(page);
  await expect(
    page.getByRole("heading", { name: "The Final Circle", exact: true }),
  ).toBeVisible();
  for (let i = 0; i < 200; i++) {
    await closeTutorial(page);
    if (await page.getByText("PRACTICE RESULTS", { exact: true }).isVisible())
      break;
    const input = page.getByLabel("Your figure", { exact: true });
    if (await input.isVisible()) {
      await input.fill("68");
      await page.getByRole("button", { name: "Lock figure ↗" }).click();
    }
    await page.waitForTimeout(150);
  }
  await expect(
    page.getByText("PRACTICE RESULTS", { exact: true }),
  ).toBeVisible();
  await shot(page, "12-practice-results");
});
