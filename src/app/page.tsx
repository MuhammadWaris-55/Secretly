import { ArrowDownRight, Fingerprint, GitCommitHorizontal, ScanLine, Wrench } from "lucide-react";
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
        <a className="secretly-landing-section-link" href="#how-it-works">
          How it works <ArrowDownRight size={15} aria-hidden="true" />
        </a>
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
      </main>
      <footer className="secretly-landing-footer">
        <p>Secretly stores masked previews and fingerprints for detected credentials.</p>
      </footer>
    </div>
  );
}
