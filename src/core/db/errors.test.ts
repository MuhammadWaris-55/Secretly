import { describe, expect, it } from "vitest";
import { isUniqueViolation } from "./errors";

describe("isUniqueViolation", () => {
  it("detects a direct unique violation", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("detects one wrapped in a cause", () => {
    expect(isUniqueViolation(new Error("query failed", { cause: { code: "23505" } }))).toBe(true);
  });

  it("ignores other database errors", () => {
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
  });

  it("ignores values that are not objects", () => {
    expect(isUniqueViolation("23505")).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});
