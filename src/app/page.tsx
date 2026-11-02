import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <Badge variant="secondary">🔐 Setup check</Badge>
      <h1 className="text-5xl font-bold tracking-tight">Secretly</h1>
      <p className="max-w-md text-muted-foreground">
        Find leaked secrets. Fix them. Know you&apos;re safe.
      </p>
      <Button size="lg">Scan my repos</Button>
    </main>
  );
}