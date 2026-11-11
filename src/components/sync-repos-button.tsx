"use client";

import { useState, useTransition } from "react";
import { syncRepos } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";

export function SyncReposButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await syncRepos();
            setMessage(result.ok ? `Found ${result.count} public repositories.` : result.message);
          })
        }
      >
        {pending ? "Finding repositories..." : "Find my repositories"}
      </Button>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
