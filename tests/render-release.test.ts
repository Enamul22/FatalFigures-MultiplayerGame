import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
const yaml = readFileSync("render.yaml", "utf8");
// Execute the actual folded Docker Command committed for Render, not a copy.
const command = yaml
  .match(/    dockerCommand: >-\n((?:      [^\n]+\n)+)/)![1]
  .split("\n")
  .map((s) => s.trim())
  .join(" ")
  .trim();
for (const scenario of ["approved", "old-build", "missing-pin"])
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
        RENDER_GIT_COMMIT: scenario === "old-build" ? "b".repeat(40) : approved,
        FATAL_RELEASE_COMMIT: scenario === "missing-pin" ? "" : approved,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (b) => (output += String(b)));
    try {
      if (scenario === "approved") {
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
