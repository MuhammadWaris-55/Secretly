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
        disabled={pending || busy}
        onClick={() =>
          startTransition(async () => {
            const result = await startScan({ repoId });
            setMessage(result.ok ? null : result.message);
          })
        }
      >
        {pending ? "Queuing..." : busy ? "Scan in progress" : "Scan"}
      </Button>
      {message && <p className="max-w-48 text-right text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}
