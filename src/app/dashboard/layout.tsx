import { Fingerprint } from "lucide-react";
import Link from "next/link";

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="secretly-workspace">
      <header className="secretly-workspace-header">
        <div className="secretly-workspace-width flex min-h-16 flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-lg font-bold tracking-tight"
          >
            <Fingerprint size={23} aria-hidden="true" />
            Secretly
          </Link>
          <nav
            aria-label="Workspace"
            className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium"
          >
            <Link href="/dashboard" className="secretly-workspace-link">
              Repositories
            </Link>
            <Link href="/dashboard/email-alerts" className="secretly-workspace-link">
              Email alerts
            </Link>
            <Link href="/dashboard/account" className="secretly-workspace-link">
              Account
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
