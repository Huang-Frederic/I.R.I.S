'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { signIn, type LoginState } from './actions';

export default function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(signIn, undefined);
  const t = useTranslations('auth');
  const tErrors = useTranslations('auth.errors');

  // Server action returns a canonical code (e.g. "credentialsRequired") which
  // we resolve here. Unknown codes (Supabase passthrough) render as-is so the
  // user still sees the underlying cause. The cast is needed because next-intl
  // narrows keys to the literal union from the message file but the wire-level
  // code is a runtime string.
  type ErrorKey = Parameters<typeof tErrors>[0];
  const errorMessage = state?.error
    ? tErrors.has(state.error as ErrorKey)
      ? tErrors(state.error as ErrorKey)
      : state.error
    : null;

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-text-muted text-xs font-medium uppercase tracking-wide">
          {t('email')}
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
          {t('password')}
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

      {errorMessage && (
        <p className="bg-red-bg text-red rounded px-3 py-2 text-sm" role="alert">
          {errorMessage}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="bg-red mt-2 rounded px-3 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
      >
        {pending ? t('signingIn') : t('signIn')}
      </button>
    </form>
  );
}
