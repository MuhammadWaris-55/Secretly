"use client";

import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";

const REFRESH_INTERVAL_MS = 3000;

export function ScanStatusRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!active || pending) return;

    const refresh = () => startTransition(() => router.refresh());
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        window.clearTimeout(timer);
        refresh();
      }
    };
    const timer = window.setTimeout(() => {
      if (document.visibilityState === "visible") refresh();
    }, REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [active, pending, router]);

  return null;
}
