import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase client for use in Client Components.
 * Sessions are persisted via cookies set by the SSR layer (see lib/supabase/server.ts and proxy.ts).
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
