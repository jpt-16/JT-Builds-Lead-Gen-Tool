"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthFormState } from "./actions";

type Mode = "signin" | "signup";

export function LoginForm({ next, notice }: { next: string; notice?: string }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [signInState, signInAction, signInPending] = useActionState<AuthFormState, FormData>(signIn, {});
  const [signUpState, signUpAction, signUpPending] = useActionState<AuthFormState, FormData>(signUp, {});

  const isSignIn = mode === "signin";
  const state = isSignIn ? signInState : signUpState;
  const pending = isSignIn ? signInPending : signUpPending;
  const error = state.error ?? (isSignIn ? notice : undefined);

  return (
    <form action={isSignIn ? signInAction : signUpAction} className="space-y-4">
      <h2 className="text-lg font-semibold">{isSignIn ? "Sign in" : "Create the owner account"}</h2>

      {error && (
        <p role="alert" className="alert-error">
          {error}
        </p>
      )}
      {state.message && (
        <p role="status" className="alert-success">
          {state.message}
        </p>
      )}

      <input type="hidden" name="next" value={next} />

      <div>
        <label htmlFor="email" className="field-label">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          className="field-input"
        />
      </div>

      <div>
        <label htmlFor="password" className="field-label">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={isSignIn ? "current-password" : "new-password"}
          minLength={isSignIn ? undefined : 12}
          required
          aria-describedby={isSignIn ? undefined : "password-hint"}
          className="field-input"
        />
        {!isSignIn && (
          <p id="password-hint" className="mt-1 text-sm text-slate-600">
            At least 12 characters.
          </p>
        )}
      </div>

      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Working…" : isSignIn ? "Sign in" : "Create account"}
      </button>

      <p className="text-sm text-slate-600">
        {isSignIn ? "First time here? " : "Already set up? "}
        <button type="button" className="btn-link" onClick={() => setMode(isSignIn ? "signup" : "signin")}>
          {isSignIn ? "Create the owner account" : "Sign in"}
        </button>
      </p>
    </form>
  );
}
