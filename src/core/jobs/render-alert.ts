export function renderAlert(baseUrl: string, repoId: string, count: number, previews: string[]) {
  const findingsUrl = new URL(`/dashboard/repos/${repoId}`, baseUrl).href;
  const settingsUrl = new URL("/dashboard/email-alerts", baseUrl).href;
  return {
    subject: "Secretly found possible secrets",
    text: [
      `Secretly detected ${count} new potential ${count === 1 ? "secret" : "secrets"} in a repository scan.`,
      "",
      "Masked previews",
      ...previews.map((preview) => `• ${preview}`),
      "",
      `Review findings and fix guidance: ${findingsUrl}`,
      "",
      `Unsubscribe from scan alerts: ${settingsUrl}`,
    ].join("\n"),
  };
}
