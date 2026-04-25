'use client';

import { useActionState } from 'react';
import { signIn, type LoginState } from './actions';

export default function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(signIn, undefined);

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-text-muted text-xs font-medium uppercase tracking-wide">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="bg-surface-2 border-border focus:border-red rounded border px-3 py-2 text-sm outline-none"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="password"
          className="text-text-muted text-xs font-medium uppercase tracking-wide"
        >
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="bg-surface-2 border-border focus:border-red rounded border px-3 py-2 text-sm outline-none"
        />
      </div>

      {state?.error && (
        <p className="bg-red-bg text-red rounded px-3 py-2 text-sm" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="bg-red mt-2 rounded px-3 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
      >
        {pending ? 'Connexion…' : 'Se connecter'}
      </button>
    </form>
  );
}
