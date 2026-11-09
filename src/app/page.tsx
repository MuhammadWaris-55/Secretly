import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SignInButton } from "@/components/sign-in-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/session";

// The only part that needs the request: it lives inside <Suspense> below.
async function SignInOrRedirect() {
  const session = await getSession();
  if (session) redirect("/dashboard");
  return <SignInButton />;
}

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <Badge variant="secondary">🔐 Early development</Badge>
      <h1 className="text-5xl font-bold tracking-tight">Secretly</h1>
      <p className="max-w-md text-muted-foreground">
        Find leaked secrets. Fix them. Know you&apos;re safe.
      </p>
      <Suspense
        fallback={
          <Button size="lg" disabled>
            Scan my repos
          </Button>
        }
      >
        <SignInOrRedirect />
      </Suspense>
    </main>
  );
}
