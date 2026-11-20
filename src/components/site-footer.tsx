import { ArrowUpRight, Fingerprint } from "lucide-react";
import Link from "next/link";

const productLinks = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#questions", label: "Common questions" },
] as const;

const workspaceLinks = [
  { href: "/dashboard", label: "Repositories" },
  { href: "/dashboard/email-alerts", label: "Email alerts" },
  { href: "/dashboard/account", label: "Account" },
] as const;

export function SiteFooter({ workspace = false }: { workspace?: boolean }) {
  return (
    <footer className="secretly-footer">
      <div className="secretly-footer-inner">
        <div className="secretly-footer-main">
          <div>
            <Link href={workspace ? "/dashboard" : "/"} className="secretly-footer-brand">
              <span className="secretly-footer-mark">
                <Fingerprint size={24} aria-hidden="true" />
              </span>
              Secretly
            </Link>
            <p>Find exposed credentials across your public GitHub repositories.</p>
          </div>
          <nav aria-label="Footer">
            {(workspace ? workspaceLinks : productLinks).map(({ href, label }) => (
              <Link key={href} href={href} className="secretly-footer-link">
                {label} <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            ))}
          </nav>
        </div>
        <div className="secretly-footer-bottom">
          Built by <strong>wariscodes</strong>
        </div>
      </div>
    </footer>
  );
}
