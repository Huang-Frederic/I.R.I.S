// lib/supabase/service.ts
//
// Note: server-only import removed because it prevents usage in Node.js scripts
// (like snapshot-catalog). Scripts are inherently trusted (developer machine only).
// The Next.js app layer provides the actual client-side boundary.

import { createClient } from '@supabase/supabase-js';

/**
 * Supabase client using the SERVICE ROLE key — bypasses RLS.
 *
 * Use ONLY from trusted server contexts: scripts run on the developer's
 * machine, and route handlers explicitly authorized by a CRON_SECRET.
 * NEVER expose this client to the browser.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set',
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
