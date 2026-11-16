"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setMessage("");
            try {
              const { data, error } = await authClient.signOut();
              if (!error && data?.success) {
                // Load the page with the cleared session cookie and a fresh router cache.
                window.location.replace("/");
                return;
              }
            } catch {
              // A failed request can be retried from the dashboard.
            }
            setMessage("Could not sign out. Please try again.");
          })
        }
      >
        {pending ? "Signing out…" : "Sign out"}
      </Button>
      {message && (
        <p role="alert" className="text-sm text-muted-foreground">
          {message}
        </p>
      )}
    </div>
  );
}
