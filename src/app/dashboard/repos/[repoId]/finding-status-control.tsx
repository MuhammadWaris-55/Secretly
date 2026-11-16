"use client";

import { Select } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import { useId, useState, useTransition } from "react";
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
  const labelId = useId();

  return (
    <form
      className="flex flex-wrap items-center gap-2.5 border-t pt-4 text-sm"
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
      <span id={labelId} className="font-medium">
        Status
      </span>
      <Select.Root
        key={status}
        name="status"
        defaultValue={status}
        items={statusLabels}
        disabled={pending}
      >
        <Select.Trigger
          aria-labelledby={labelId}
          className="group inline-flex h-8 min-w-36 items-center justify-between gap-3 rounded-md border border-input bg-card px-2.5 font-medium shadow-[0_2px_0_#e1ded2] hover:bg-muted disabled:opacity-60"
        >
          <Select.Value />
          <Select.Icon className="text-muted-foreground group-data-popup-open:rotate-180 motion-safe:transition-transform">
            <ChevronDown size={14} aria-hidden="true" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner
            align="start"
            alignItemWithTrigger={false}
            sideOffset={6}
            className="z-50"
          >
            <Select.Popup className="max-w-(--available-width) min-w-(--anchor-width) origin-(--transform-origin) rounded-lg border border-[#d4d2c5] bg-[#fcfaf4] p-1 text-sm text-[#22241e] shadow-lg data-ending-style:opacity-0 data-starting-style:opacity-0 motion-safe:transition-[opacity,transform] motion-safe:duration-150 motion-safe:data-ending-style:-translate-y-1 motion-safe:data-starting-style:-translate-y-1">
              <Select.List>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <Select.Item
                    key={value}
                    value={value}
                    className="flex min-h-8 cursor-default items-center justify-between gap-3 rounded-md px-2.5 outline-none select-none data-highlighted:bg-[#ece9df] data-selected:font-semibold"
                  >
                    <Select.ItemText>{label}</Select.ItemText>
                    <Select.ItemIndicator className="text-[#526235]">
                      <Check size={14} aria-hidden="true" />
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Saving…" : "Save status"}
      </Button>
      <span role="status" className="text-muted-foreground">
        {message}
      </span>
    </form>
  );
}
