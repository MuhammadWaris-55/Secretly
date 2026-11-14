import { describe, expect, it } from "vitest";
import { readWorkerEmailConfig } from "./config";

describe("worker email configuration", () => {
  it.each(["http://localhost:3000", "http://127.0.0.1:3000", "https://secretly.example"])(
    "supports the app URL %s",
    (baseUrl) => {
      expect(
        readWorkerEmailConfig({
          RESEND_API_KEY: "test-key",
          EMAIL_FROM: "Secretly <onboarding@resend.dev>",
          BETTER_AUTH_URL: baseUrl,
        }),
      ).toMatchObject({ invalid: [], config: { baseUrl } });
    },
  );

  it("reports only invalid variable names and leaves scans available", () => {
    expect(
      readWorkerEmailConfig({
        RESEND_API_KEY: "test-key",
        EMAIL_FROM: "http://localhost:3000",
        BETTER_AUTH_URL: "file:///bad",
      }),
    ).toEqual({ invalid: ["EMAIL_FROM", "BETTER_AUTH_URL"] });
  });

  it("treats an empty key as email delivery being off", () => {
    expect(readWorkerEmailConfig({ RESEND_API_KEY: " " })).toEqual({ invalid: [] });
  });
});
