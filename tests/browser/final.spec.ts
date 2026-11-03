import { test, expect, type Page } from "@playwright/test";
import { io, type Socket } from "socket.io-client";
const ask = (s: Socket, event: string, data: unknown = {}) =>
  new Promise<any>((resolve, reject) =>
    s
      .timeout(4000)
      .emit(event, data, (err: any, r: any) =>
        err || !r.ok ? reject(err || Error(r.error)) : resolve(r.value),
      ),
  );
async function room(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Play with friends ↗", exact: true })
    .click();
  await page.getByLabel("Your nickname").fill("Enamul");
  await page
    .getByRole("button", { name: "Create room ↗", exact: true })
    .click();
  const code = (await page.locator(".room-code").innerText()).split(" ")[0];
  const peer = io("http://localhost:3101", {
    transports: ["websocket"],
    forceNew: true,
  });
  let state: any;
  peer.on("state", (s) => (state = s));
  await new Promise<void>((r) => peer.once("connect", () => r()));
  await ask(peer, "join", { code, nickname: "Friend" });
  await ask(peer, "ready", { ready: true });
  await page.getByRole("button", { name: "I’m ready", exact: true }).click();
  await page.getByRole("button", { name: "Start match ↗" }).click();
  await page.getByRole("button", { name: "I’ve got the circle ↗" }).click();
  await expect(page.getByLabel("Your figure", { exact: true })).toBeVisible();
  return { peer, state: () => state };
}
for (const tied of [false, true])
  test(`immediate ${tied ? "tied" : "ordinary"} champion includes decisive reveal, survives refresh, history and rematch`, async ({
    page,
  }) => {
    const { peer, state } = await room(page);
    try {
      for (let round = 1; round <= 3; round++) {
        await expect(
          page.getByLabel("Your figure", { exact: true }),
        ).toBeVisible();
        await page
          .getByLabel("Your figure", { exact: true })
          .fill(tied ? "0" : "68");
        await page.getByRole("button", { name: "Lock figure ↗" }).click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        const before = state();
        if (round === 3 && !tied)
          await page
            .getByRole("button", { name: "How to play", exact: true })
            .click();
        await ask(peer, "lock", { roundId: before.roundId, pick: 0 });
        if (round === 3 && !tied) break;
        await expect(
          page.getByRole("dialog", { name: "Simultaneous reveal" }),
        ).toBeVisible();
      }
      if (tied) {
        await expect(
          page.getByRole("dialog", { name: "Tiebreak · private entry" }),
        ).toBeVisible();
        await page.getByLabel("Your figure", { exact: true }).fill("0");
        await page.getByRole("button", { name: "Lock figure ↗" }).click();
        await page
          .getByRole("button", {
            name: "Calculation & scoring details",
            exact: true,
          })
          .click();
        await ask(peer, "lock", { roundId: state().roundId, pick: 0 });
      }
      // This is the first snapshot after the last lock ack, not a client-side guess.
      await expect
        .poll(() => state().stage, { timeout: 1000 })
        .toBe("finished");
      expect(state().match.status).toBe("champion");
      expect(state().deadline).toBe(0);
      expect(state().match.phases[0].rounds).toHaveLength(3);
      expect(Boolean(state().match.phases[0].tiebreak)).toBe(tied);
      expect(Boolean(state().match.phases[0].draw)).toBe(tied);
      if (tied)
        await expect(page.locator(".final-draw-note")).toContainText(
          "The committed draw eliminated",
        );
      await expect(
        page.getByRole("dialog", { name: "Final announcement" }),
      ).toBeVisible();
      await expect(page.locator(".final-reveal")).toContainText(
        tied ? "TIEBREAK" : "ROUND 3",
      );
      await expect(page.locator(".final-reveal")).toContainText(
        tied ? "0" : "68",
      );
      const champion = state().match.champion,
        matchId = state().match.id;
      await page.reload();
      await expect(
        page.getByRole("dialog", { name: "Final announcement" }),
      ).toBeVisible();
      expect(state().match.champion).toBe(champion);
      await expect(
        page.locator(".card-revealing,.spotlight-fading"),
      ).toHaveCount(0);
      await page.getByRole("button", { name: "Explore the replay" }).click();
      await page.locator(".match-replay>summary").click();
      await expect(page.locator(".match-replay")).toContainText(
        "The Final Circle",
      );
      await page.getByRole("button", { name: "Back to table" }).click();
      // Refreshing a finished host transfers hosting to the connected friend,
      // per the existing room lifecycle. The current host opens the rematch.
      await ask(peer, "rematch");
      await expect(
        page.getByRole("heading", { name: "Take your seat." }),
      ).toBeVisible();
      expect(state().history[0].id).toBe(matchId);
    } finally {
      peer.disconnect();
    }
  });

test("server-rejected submission remains editable, successful retry closes entry, leave requires confirmation", async ({
  page,
}) => {
  let rejectNext = true;
  await page.routeWebSocket("**/socket.io/**", (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => {
      if (
        rejectNext &&
        typeof message === "string" &&
        message.includes('["lock",')
      ) {
        rejectNext = false;
        // Corrupt one transport payload after native validation; the real server rejects it.
        server.send(message.replace(/"pick":\d+/, '"pick":101'));
      } else server.send(message);
    });
  });
  const { peer } = await room(page);
  try {
    await page.getByLabel("Your figure", { exact: true }).fill("37");
    await page.getByRole("button", { name: "Lock figure ↗" }).click();
    await expect(page.locator(".room-submit-error")).toContainText(
      /Check your nickname, room code or action fields/,
    );
    await expect(page.getByLabel("Your figure", { exact: true })).toBeEnabled();
    await expect(page.locator(".receipt-number")).toHaveCount(0);
    await page.getByRole("button", { name: "Lock figure ↗" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "View my locked number" }),
    ).toBeEnabled();
    page.once("dialog", (d) => d.dismiss());
    await page.getByRole("button", { name: "Leave room", exact: true }).click();
    await expect(page.locator(".theatre-room")).toBeVisible();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Leave room", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "Read the room. Choose your fatal figure.",
      }),
    ).toBeVisible();
  } finally {
    peer.disconnect();
  }
});

test("lost lock acknowledgement shows uncertainty; sync recovers real committed receipt", async ({
  page,
}) => {
  let droppedAck = "",
    stale = false;
  await page.routeWebSocket("**/socket.io/**", (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => {
      if (typeof message === "string" && message.includes('["lock",')) {
        const match = message.match(/^42(\d+)\[/);
        droppedAck = match ? `43${match[1]}[` : "";
        stale = true;
      }
      server.send(message);
    });
    server.onMessage((message) => {
      if (
        typeof message === "string" &&
        ((droppedAck && message.startsWith(droppedAck)) ||
          (stale && message.startsWith('42["state",')))
      )
        return;
      ws.send(message);
    });
  });
  const { peer, state } = await room(page);
  try {
    await page.getByLabel("Your figure", { exact: true }).fill("37");
    await page.getByRole("button", { name: "Lock figure ↗" }).click();
    await expect.poll(() => state().locked.length).toBe(1);
    // Peer sees committed public lock; submitting browser has received no proof.
    await expect(
      page.getByRole("button", { name: "COMMITTING… ↗" }),
    ).toBeDisabled();
    await expect(page.locator(".receipt-number")).toHaveCount(0);
    await expect(page.locator(".room-submit-error")).toContainText(
      "Acknowledgement uncertain",
      { timeout: 15000 },
    );
    await expect(page.getByLabel("Your figure", { exact: true })).toBeVisible();
    stale = false;
    droppedAck = "";
    await page.getByRole("button", { name: "Sync committed choice" }).click();
    await expect(page.getByLabel("Your figure", { exact: true })).toHaveCount(
      0,
    );
    // The current server stage may already be the reveal; history still contains
    // the submitted value, never a fabricated retry or changed choice.
    await expect
      .poll(() =>
        state().match.phases[0].rounds[0]?.rows.some((r: any) => r.pick === 37),
      )
      .toBe(true);
  } finally {
    peer.disconnect();
  }
});
