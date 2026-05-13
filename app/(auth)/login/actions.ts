'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Server actions return canonical error CODES (not localized strings) so the
 * client can translate via next-intl. The login form looks up
 * `auth.errors.<code>` and falls back to the raw code if the key is absent —
 * this lets us pass through unmapped Supabase messages without crashing.
 */
export type LoginState = { error?: string } | undefined;

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { error: 'credentialsRequired' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Supabase's English-only error message is passed through as-is when no
    // canonical code matches — better UX than swallowing the underlying cause.
    return { error: error.message };
  }

  redirect('/');
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
