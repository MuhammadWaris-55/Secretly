import { ThemeToggle } from "@/components/theme-toggle";
import {
  ArrowDownRight,
  Bell,
  ChevronDown,
  Fingerprint,
  FolderGit2,
  GitCommitHorizontal,
  ListChecks,
  ScanLine,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SignInButton } from "@/components/sign-in-button";
import { getSession } from "@/lib/session";
import { getSecretRemediation } from "@/core/playbooks/secret-remediation";

async function SignInOrRedirect() {
  if (await getSession()) redirect("/dashboard");
  return <SignInButton />;
}

const workflow = [
  {
    icon: ScanLine,
    title: "Scan your repository",
    text: "Choose one of your public GitHub repositories. Secretly checks the current code and commit history.",
  },
  {
    icon: Wrench,
    title: "Fix the exposure",
    text: "See where a potential secret was found, which kind of credential it is, and how to rotate or revoke it.",
  },
  {
    icon: GitCommitHorizontal,
    title: "Rescan after cleanup",
    text: "Check whether the secret is still detected in current code or Git history. Keep your own record of what you fixed.",
  },
];

const features = [
  {
    icon: FolderGit2,
    title: "Discover your repositories",
    text: "Sign in with GitHub, find your public repositories, and choose which ones to scan.",
  },
  {
    icon: GitCommitHorizontal,
    title: "Scan code and commit history",
    text: "Look for API keys, tokens, private keys, and database credentials, including ones removed from the current code.",
  },
  {
    icon: ShieldCheck,
    title: "Review findings safely",
    text: "See the file, line, commit, and a masked preview. Each finding shows whether it was detected in current code, in Git history, or on an earlier scan.",
  },
  {
    icon: Wrench,
    title: "Get steps for each exposure",
    text: "Find out where to rotate or revoke the credential and how to remove it from your code before running a fresh scan.",
  },
  {
    icon: ListChecks,
    title: "Track what you’ve handled",
    text: "Mark findings fixed, ignored, or false positives, and reopen them if needed. Rescans preserve your status choices.",
  },
  {
    icon: Bell,
    title: "Get email alerts for new findings",
    text: "Opt in with a verified email. After a scan, alerts summarize new findings and include masked previews.",
  },
];

const questions = [
  {
    title: "Which repositories can I scan?",
    text: "Secretly scans public GitHub repositories you own, excluding forks. GitHub sign-in uses your profile and email, and public repository scans require no repository permissions.",
  },
  {
    title: "What data does Secretly keep?",
    text: "Secretly stores finding details, masked previews, and fingerprints. Full credentials are never stored. You can permanently delete your Secretly account and scan records from Account settings.",
  },
  {
    title: "Will I get the same alert on every scan?",
    text: "Email alerts cover newly detected findings. A repeat scan of a known finding won’t send another alert for it. You can unsubscribe from the Email alerts page.",
  },
];

function FindingPreview() {
  const guide = getSecretRemediation("database-url-with-password");

  return (
    <div className="secretly-landing-preview">
      <figure className="secretly-landing-preview-surface">
        <figcaption className="secretly-landing-preview-header">
          <span>
            <ScanLine size={16} aria-hidden="true" /> Sample scan
          </span>
          <span className="secretly-landing-preview-count">1 finding</span>
        </figcaption>
        <div className="secretly-landing-preview-body">
          <div className="secretly-landing-preview-heading">
            <p>{guide.title}</p>
            <span>In current code</span>
          </div>
          <p className="secretly-landing-location">
            <code>config/example.env:12</code>
          </p>
          <div className="secretly-landing-mask">
            <span>Masked preview</span>
            <code>••••••••••••</code>
          </div>
          <details className="secretly-landing-guide" open>
            <summary>How to fix</summary>
            <p>{guide.rotate}</p>
          </details>
        </div>
      </figure>
    </div>
  );
}

export default function Home() {
  return (
    <div className="secretly-landing">
      <header className="secretly-landing-header">
        <span className="secretly-landing-brand">
          <Fingerprint size={23} aria-hidden="true" /> Secretly
        </span>
        <div className="flex flex-wrap items-center gap-x-2 sm:gap-x-4">
          <a
            className="secretly-landing-section-link secretly-landing-features-link"
            href="#features"
          >
            Features
          </a>
          <a className="secretly-landing-section-link" href="#how-it-works">
            How it works <ArrowDownRight size={15} aria-hidden="true" />
          </a>
          <ThemeToggle />
        </div>
      </header>
      <main>
        <section className="secretly-landing-hero">
          <div className="secretly-landing-hero-copy">
            <h1>Find leaked secrets in your GitHub repos.</h1>
            <p>
              Scan your own public repositories for exposed credentials. See where they appeared,
              get steps to fix them, and check again after cleanup.
            </p>
            <Suspense
              fallback={
                <div className="secretly-landing-action-placeholder" role="status">
                  Checking session…
                </div>
              }
            >
              <SignInOrRedirect />
            </Suspense>
          </div>
          <FindingPreview />
        </section>
        <section
          className="secretly-landing-workflow"
          id="how-it-works"
          aria-labelledby="workflow-heading"
        >
          <h2 id="workflow-heading">From detection to cleanup</h2>
          <ol>
            {workflow.map(({ icon: Icon, title, text }) => (
              <li key={title}>
                <Icon size={23} strokeWidth={1.65} aria-hidden="true" />
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </section>
        <section
          className="secretly-landing-features"
          id="features"
          aria-labelledby="features-heading"
        >
          <h2 id="features-heading">What you can do with Secretly</h2>
          <ul className="secretly-feature-grid" role="list">
            {features.map(({ icon: Icon, title, text }) => (
              <li className="secretly-feature" key={title}>
                <span className="secretly-feature-icon">
                  <Icon size={21} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ul>
        </section>
        <section
          className="secretly-landing-questions"
          id="questions"
          aria-labelledby="questions-heading"
        >
          <h2 id="questions-heading">Common questions</h2>
          <div className="secretly-question-list">
            {questions.map(({ title, text }) => (
              <details key={title}>
                <summary>
                  {title}
                  <ChevronDown size={18} aria-hidden="true" />
                </summary>
                <p>{text}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
