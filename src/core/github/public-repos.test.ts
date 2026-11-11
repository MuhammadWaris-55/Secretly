import { describe, expect, it } from "vitest";
import { pickRepos } from "./public-repos";

function repo(name: string, overrides: Record<string, unknown> = {}) {
  return {
    full_name: `me/${name}`,
    fork: false,
    private: false,
    pushed_at: "2026-01-01T00:00:00Z",
    size: 100,
    ...overrides,
  };
}

describe("pickRepos", () => {
  it("skips forks and private repos", () => {
    const result = pickRepos([repo("a"), repo("b", { fork: true }), repo("c", { private: true })]);
    expect(result.map((r) => r.fullName)).toEqual(["me/a"]);
  });

  it("orders by most recently pushed", () => {
    const result = pickRepos([
      repo("old", { pushed_at: "2025-01-01T00:00:00Z" }),
      repo("new", { pushed_at: "2026-06-01T00:00:00Z" }),
    ]);
    expect(result.map((r) => r.fullName)).toEqual(["me/new", "me/old"]);
  });

  it("puts repos that were never pushed last", () => {
    const result = pickRepos([repo("empty", { pushed_at: null }), repo("real")]);
    expect(result.map((r) => r.fullName)).toEqual(["me/real", "me/empty"]);
  });

  it("caps the result at the limit", () => {
    const many = Array.from({ length: 50 }, (_, i) => repo(`r${i}`));
    expect(pickRepos(many, 30)).toHaveLength(30);
  });

  it("passes the reported size through", () => {
    expect(pickRepos([repo("a", { size: 4096 })])[0]?.sizeKb).toBe(4096);
  });
});
