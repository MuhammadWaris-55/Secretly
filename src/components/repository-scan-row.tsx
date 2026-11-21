"use client";

import {
  ArrowUpRight,
  Check,
  CircleAlert,
  Clock3,
  GitFork,
  ScanLine,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { ScanRepoButton } from "./scan-repo-button";
import { Badge } from "./ui/badge";

export type RepositoryScan = {
  id: string;
  status: "queued" | "running" | "done" | "failed";
  findingsCount: number;
};

function describeScan(scan?: RepositoryScan): string {
  if (!scan) return "Not scanned";
  if (scan.status === "done") {
    if (scan.findingsCount === 0) return "No secrets detected";
    return scan.findingsCount === 1 ? "1 finding" : `${scan.findingsCount} findings`;
  }
  return { queued: "Queued", running: "Scanning", failed: "Scan failed" }[scan.status];
}

export function RepositoryScanRow({
  repo,
  scan,
}: {
  repo: { id: string; fullName: string };
  scan?: RepositoryScan;
}) {
  const scanId = scan?.id;
  const status = scan?.status;
  const findingsCount = scan?.findingsCount;
  const previous = useRef({ id: scanId, status });
  const flash = useRef<HTMLSpanElement>(null);
  const result = useRef<HTMLSpanElement>(null);
  const icon = useRef<HTMLSpanElement>(null);
  const busy = scan?.status === "queued" || scan?.status === "running";
  const state = scan?.status === "done" && scan.findingsCount > 0 ? "findings" : scan?.status;
  const StateIcon =
    state === "running"
      ? ScanLine
      : state === "queued"
        ? Clock3
        : state === "done"
          ? Check
          : state === "findings"
            ? ShieldAlert
            : state === "failed"
              ? CircleAlert
              : GitFork;

  useEffect(() => {
    const before = previous.current;
    previous.current = { id: scanId, status };
    // React preserves this row across refreshes. Only a new result gets a flourish.
    if (
      !scanId ||
      (status !== "done" && status !== "failed") ||
      (before.id === scanId && before.status === status) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;

    const animations: Animation[] = [];
    const wash = flash.current?.animate(
      [{ opacity: 0 }, { opacity: 0.1, offset: 0.2 }, { opacity: 0 }],
      { duration: 1200, easing: "ease-out" },
    );
    if (wash) animations.push(wash);
    const reveal = result.current?.animate(
      [
        { opacity: 0.45, transform: "translateY(3px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 280, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" },
    );
    if (reveal) animations.push(reveal);
    if (status === "done" && findingsCount === 0) {
      const path = icon.current?.querySelector("path");
      const draw = path?.animate(
        [
          { strokeDasharray: "30", strokeDashoffset: "30" },
          { strokeDasharray: "30", strokeDashoffset: "0" },
        ],
        { duration: 420, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" },
      );
      if (draw) animations.push(draw);
    }
    return () => animations.forEach((animation) => animation.cancel());
  }, [scanId, status, findingsCount]);

  return (
    <li
      data-state={state ?? "unscanned"}
      className="secretly-workspace-row secretly-repo-row flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-4 text-sm sm:flex-nowrap sm:px-5"
    >
      <span ref={flash} className="secretly-repo-flash" aria-hidden="true" />
      <div className="relative flex min-w-0 items-center gap-3">
        <span ref={icon} className="secretly-repo-icon" aria-hidden="true">
          <StateIcon size={15} strokeWidth={1.6} />
        </span>
        <div className="min-w-0 space-y-1">
          <p className="font-semibold wrap-anywhere">{repo.fullName}</p>
          <Link
            href={`/dashboard/repos/${repo.id}`}
            aria-label={`View findings for ${repo.fullName}`}
            className="secretly-workspace-link inline-flex items-center gap-1 text-xs text-muted-foreground"
          >
            View findings <ArrowUpRight size={12} aria-hidden="true" />
          </Link>
        </div>
      </div>
      <div className="relative ml-auto flex items-center gap-2 sm:ml-0">
        <div role="status" aria-label={`Scan status for ${repo.fullName}`} aria-atomic="true">
          <Badge
            ref={result}
            variant="secondary"
            data-state={state}
            className="secretly-scan-state secretly-repo-status"
          >
            {busy && <span className="secretly-repo-status-dot" aria-hidden="true" />}
            {describeScan(scan)}
          </Badge>
        </div>
        <ScanRepoButton repoId={repo.id} busy={busy} />
      </div>
      {scan?.status === "running" && (
        <span className="secretly-repo-track" aria-hidden="true">
          <span />
        </span>
      )}
    </li>
  );
}
