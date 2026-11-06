import { describe, expect, it } from "vitest";
import { InvalidRepoUrlError } from "./errors";
import { parseRepoUrl } from "./repo-url";

describe("parseRepoUrl", () => {
  it("accepts a normal repo URL and rebuilds the clone URL", () => {
    expect(parseRepoUrl("https://github.com/MuhammadWaris-55/secretly")).toEqual({
      owner: "MuhammadWaris-55",
      name: "secretly",
      fullName: "MuhammadWaris-55/secretly",
      cloneUrl: "https://github.com/MuhammadWaris-55/secretly.git",
    });
  });

  it("accepts a trailing .git or slash", () => {
    expect(parseRepoUrl("https://github.com/a/b.git").fullName).toBe("a/b");
    expect(parseRepoUrl("https://github.com/a/b/").fullName).toBe("a/b");
  });

  it.each([
    ["wrong protocol", "http://github.com/a/b"],
    ["ssh style", "git@github.com:a/b.git"],
    ["lookalike host", "https://github.com.evil.com/a/b"],
    ["other host", "https://gitlab.com/a/b"],
    ["credentials", "https://user:pw@github.com/a/b"],
    ["port", "https://github.com:8443/a/b"],
    ["query string", "https://github.com/a/b?x=1"],
    ["extra path", "https://github.com/a/b/tree/main"],
    ["missing repo", "https://github.com/a"],
    ["option-like owner", "https://github.com/--upload-pack=evil/b"],
    ["dot-dot repo", "https://github.com/a/.."],
    ["empty", ""],
    ["garbage", "not a url"],
  ])("rejects %s", (_label, input) => {
    expect(() => parseRepoUrl(input)).toThrow(InvalidRepoUrlError);
  });
});
