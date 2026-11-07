import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dirSize } from "./clone";

describe("dirSize", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "secretly-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("sums file sizes recursively", async () => {
    await writeFile(path.join(dir, "a.txt"), "12345");
    await mkdir(path.join(dir, "nested"));
    await writeFile(path.join(dir, "nested", "b.txt"), "1234567890");
    expect(await dirSize(dir)).toBe(15);
  });

  it("returns 0 for an empty directory", async () => {
    expect(await dirSize(dir)).toBe(0);
  });
});
