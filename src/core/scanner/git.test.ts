import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { it, expect } from "vitest";
import { CloneError } from "./errors";
import { getHeadSha } from "./git";

it("reports an empty repository only for a valid clone with no commits", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "secretly-head-"));
  const git = (args: string[]) =>
    promisify(execFile)("git", ["-C", dir, ...args], { windowsHide: true });
  try {
    await expect(getHeadSha(dir)).rejects.toBeInstanceOf(CloneError);
    await git(["init", "--initial-branch=main"]);
    expect(await getHeadSha(dir)).toBeNull();
    await git([
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "commit.gpgSign=false",
      "-c",
      "core.hooksPath=NUL",
      "commit",
      "--allow-empty",
      "-m",
      "Fixture",
    ]);
    expect(await getHeadSha(dir)).toMatch(/^[0-9a-f]{40}$/);
    await git(["symbolic-ref", "HEAD", "refs/heads/missing"]);
    await expect(getHeadSha(dir)).rejects.toBeInstanceOf(CloneError);
  } finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 3 });
  }
});
