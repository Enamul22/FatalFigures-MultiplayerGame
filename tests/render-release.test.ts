import { it, expect } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
const command = "/bin/sh scripts/render-start.sh";
for (const scenario of [
  "approved",
  "old-build",
  "missing-pin",
  "local-container",
])
  it(`Render release guard: ${scenario}`, async () => {
    const dir = await mkdtemp(join(tmpdir(), "fatal-release-guard-")),
      marker = join(dir, "started");
    await writeFile(
      join(dir, "node"),
      '#!/bin/sh\nprintf "%s" "$*" > "$FATAL_TEST_MARKER"\n',
      { mode: 0o700 },
    );
    const approved = "a".repeat(40);
    const child = spawn("/bin/sh", ["-c", command], {
      env: {
        ...process.env,
        PATH: dir + ":" + process.env.PATH,
        FATAL_TEST_MARKER: marker,
        RENDER: scenario === "local-container" ? "" : "true",
        RENDER_GIT_COMMIT:
          scenario === "local-container"
            ? ""
            : scenario === "old-build"
              ? "b".repeat(40)
              : approved,
        FATAL_RELEASE_COMMIT: ["missing-pin", "local-container"].includes(
          scenario,
        )
          ? ""
          : approved,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (b) => (output += String(b)));
    try {
      if (scenario === "approved" || scenario === "local-container") {
        const code = await new Promise<number | null>((resolve) =>
          child.once("exit", resolve),
        );
        expect(code).toBe(0);
        expect(await readFile(marker, "utf8")).toBe("dist/server/index.js");
      } else {
        await expect.poll(() => output).toContain("Release parked:");
        expect(child.exitCode).toBeNull();
        await expect(readFile(marker)).rejects.toMatchObject({
          code: "ENOENT",
        });
      }
    } finally {
      if (child.exitCode === null) {
        child.kill("SIGTERM");
        await new Promise((resolve) => child.once("exit", resolve));
      }
      await rm(dir, { recursive: true, force: true });
    }
  });
