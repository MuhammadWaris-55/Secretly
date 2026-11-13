"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { Finding } from "@/core/db/schema";
import { updateFindingStatus } from "./actions";

const statusLabels = {
  open: "Open",
  fixed: "Fixed",
  ignored: "Ignored",
  false_positive: "False positive",
} satisfies Record<Finding["status"], string>;

export function FindingStatusControl({
  repoId,
  findingId,
  status,
}: {
  repoId: string;
  findingId: string;
  status: Finding["status"];
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  return (
    <form
      className="flex flex-wrap items-center gap-2 border-t pt-3 text-sm"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        setMessage("");
        startTransition(async () => {
          try {
            const result = await updateFindingStatus({
              repoId,
              findingId,
              status: formData.get("status"),
            });
            setMessage(result.ok ? "Status saved." : result.message);
          } catch {
            setMessage("Could not save the status. Please try again.");
          }
        });
      }}
    >
      <label htmlFor={`status-${findingId}`}>Status</label>
      <select
        key={status}
        id={`status-${findingId}`}
        name="status"
        defaultValue={status}
        disabled={pending}
        className="rounded-md border bg-background px-2 py-1"
      >
        {Object.entries(statusLabels).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Saving…" : "Save status"}
      </Button>
      <span role="status" className="text-muted-foreground">
        {message}
      </span>
    </form>
  );
}
