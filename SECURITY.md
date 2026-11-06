# Security

## Reporting a vulnerability

Please report security issues privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Please don't open a public issue for security problems.

## Design rules

These are the rules the project is built to follow:

- **Never store a full secret.** Only a masked preview and an HMAC fingerprint are stored.
- **Secrets stay in memory.** Repositories are cloned into a temporary directory, scanned, and deleted. Raw findings are never logged.
- **Never test found keys.** Findings are reported as "likely secret". Secretly doesn't call any provider API with a key it found.
- **Minimal GitHub access.** Login requests profile and email only, never repository access. Public repositories need no permission.
- **Hostile input.** Every repository is treated as untrusted: validated URLs, no shell execution, timeouts and size limits.
- **Secrets stay out of the repo.** Real values live in environment variables, and a Gitleaks pre-commit hook scans every commit.
