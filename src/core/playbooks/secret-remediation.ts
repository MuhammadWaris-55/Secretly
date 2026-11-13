const guides = new Map([
  [
    "aws-access-token",
    {
      title: "AWS access key",
      rotate:
        "Deactivate the exposed access key in AWS IAM. Update workloads that use it, then delete the old key.",
    },
  ],
  [
    "github-pat",
    {
      title: "GitHub personal access token",
      rotate:
        "Revoke the token in GitHub settings. If a workflow still needs a token, create a replacement with only the permissions it needs.",
    },
  ],
  [
    "stripe-access-token",
    {
      title: "Stripe API key",
      rotate:
        "Rotate the key in the Stripe Dashboard, update the services that use it, and expire the exposed key.",
    },
  ],
  [
    "gcp-api-key",
    {
      title: "Google Cloud API key",
      rotate:
        "Replace the key in Google Cloud, restrict the replacement to the apps and APIs that need it, and delete the exposed key.",
    },
  ],
  [
    "database-url-with-password",
    {
      title: "Database connection string",
      rotate:
        "Change the exposed database password or replace the database user. Update every connection string that used it.",
    },
  ],
  [
    "private-key",
    {
      title: "Private key",
      rotate:
        "Generate a new key pair and remove trust for the exposed key everywhere it was authorized.",
    },
  ],
]);

export function getSecretRemediation(ruleId: string) {
  return (
    guides.get(ruleId) ?? {
      title: "Possible secret",
      rotate:
        "Identify the service that issued the credential and revoke or rotate it. Update any applications that still use it.",
    }
  );
}
