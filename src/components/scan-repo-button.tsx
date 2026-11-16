"use client";

import { useState, useTransition } from "react";
import { startScan } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";

export function ScanRepoButton({ repoId, busy }: { repoId: string; busy: boolean }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        className="min-w-14 shadow-[0_2px_0_var(--border)] motion-safe:transition-[transform,box-shadow] motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-px motion-safe:active:shadow-none"
        disabled={pending || busy}
        onClick={() =>
          startTransition(async () => {
            setMessage(null);
            try {
              const result = await startScan({ repoId });
              setMessage(result.ok ? null : result.message);
            } catch {
              setMessage("Could not start the scan. Please try again.");
            }
          })
        }
      >
        {pending ? "Queuing…" : "Scan"}
      </Button>
      {message && (
        <p role="alert" className="max-w-48 text-right text-xs text-muted-foreground">
          {message}
        </p>
      )}
    </div>
  );
}
