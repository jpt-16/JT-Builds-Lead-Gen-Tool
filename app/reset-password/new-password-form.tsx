"use client";

import Link from "next/link";
import { useActionState } from "react";
import { setNewPassword, type NewPasswordState } from "./actions";

export function NewPasswordForm() {
  const [state, action, pending] = useActionState<NewPasswordState, FormData>(setNewPassword, {});

  return (
    <form action={action} className="space-y-4">
      <h2 className="text-base font-semibold text-ink">Choose a new password</h2>

      {state.error && (
        <p role="alert" className="alert-error">
          {state.error}
        </p>
      )}

      <div>
        <label htmlFor="password" className="field-label">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          aria-describedby="password-hint"
          className="field-input"
        />
        <p id="password-hint" className="mt-1 text-sm text-muted">
          At least 12 characters.
        </p>
      </div>

      <div>
        <label htmlFor="confirm" className="field-label">
          Confirm new password
        </label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={12} required className="field-input" />
      </div>

      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Saving…" : "Save password"}
      </button>

      <p className="text-sm text-muted">
        <Link href="/dashboard" className="btn-link">
          Cancel
        </Link>
      </p>
    </form>
  );
}
