"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, type ResetRequestState } from "./actions";

export function ResetRequestForm() {
  const [state, action, pending] = useActionState<ResetRequestState, FormData>(requestPasswordReset, {});

  return (
    <form action={action} className="space-y-4">
      <h2 className="text-base font-semibold text-ink">Reset your password</h2>
      <p className="text-sm text-muted">Enter the owner email. A link to choose a new password will be sent to it.</p>

      {state.error && (
        <p role="alert" className="alert-error">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="alert-success">
          {state.message}
        </p>
      )}

      <div>
        <label htmlFor="email" className="field-label">
          Email
        </label>
        <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required className="field-input" />
      </div>

      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </button>

      <p className="text-sm text-muted">
        <Link href="/login" className="btn-link">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
