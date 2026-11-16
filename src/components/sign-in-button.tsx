"use client";

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignInButton() {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signIn() {
    setPending(true);
    setFailed(false);
    try {
      const { data, error } = await authClient.signIn.social({
        provider: "github",
        callbackURL: "/dashboard",
      });
      if (!error && data?.redirect) return;
    } catch {
      // Network failures can be retried from this page.
    }
    setFailed(true);
    setPending(false);
  }

  return (
    <div className="space-y-2">
      <Button
        size="lg"
        className="h-12 gap-3 rounded-md border-[#22241e] bg-[#22241e] px-4 text-[#f4f2eb] shadow-[0_3px_0_#69704f] hover:bg-[#353928] focus-visible:ring-[#535d35] motion-safe:transition-[transform,background-color] motion-safe:active:translate-y-0.5"
        disabled={pending}
        onClick={signIn}
      >
        {pending ? "Opening GitHub…" : "Sign in with GitHub"}
        <ArrowUpRight aria-hidden="true" />
      </Button>
      {failed && (
        <p role="alert" className="text-sm text-[#852f29]">
          Could not start GitHub sign-in. Try again.
        </p>
      )}
    </div>
  );
}
