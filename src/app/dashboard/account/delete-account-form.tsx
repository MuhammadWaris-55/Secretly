"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { deleteMyAccount } from "./actions";

export function DeleteAccountForm() {
  const [message, action, pending] = useActionState(deleteMyAccount, "");

  return (
    <form action={action} className="mt-5 flex flex-col items-start gap-3">
      <label htmlFor="delete-confirmation" className="text-sm font-medium">
        Type <code>DELETE</code> to confirm
      </label>
      <input
        id="delete-confirmation"
        name="confirmation"
        autoComplete="off"
        spellCheck={false}
        required
        disabled={pending}
        className="w-full max-w-64 rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
      />
      <Button type="submit" variant="destructive" disabled={pending}>
        {pending ? "Deleting account…" : "Permanently delete account"}
      </Button>
      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
    </form>
  );
}
