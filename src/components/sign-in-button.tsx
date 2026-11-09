"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignInButton() {
  const [pending, setPending] = useState(false);

  async function signIn() {
    setPending(true);
    const { error } = await authClient.signIn.social({
      provider: "github",
      callbackURL: "/dashboard",
    });
    // On success the browser redirects to GitHub, so we only get here on failure.
    if (error) setPending(false);
  }

  return (
    <Button size="lg" disabled={pending} onClick={signIn}>
      {pending ? "Redirecting..." : "Scan my repos"}
    </Button>
  );
}
