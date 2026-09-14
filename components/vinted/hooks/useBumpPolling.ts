'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Track items with a queued bump (repost) job so the row can show a badge,
 * polling `vinted_post_jobs` until the job settles (done/error) and then
 * refreshing the page. Polls are cleaned up on unmount.
 */
export function useBumpPolling() {
  const router = useRouter();
  const [bumpingIds, setBumpingIds] = useState<Map<string, string>>(new Map());
  const bumpPollRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  const onBumpQueued = useCallback((itemId: string, jobId: string) => {
    setBumpingIds((prev) => new Map(prev).set(itemId, jobId));
    const supabase = createClient();
    const interval = setInterval(async () => {
      const { data: job } = await supabase
        .from('vinted_post_jobs')
        .select('status')
        .eq('id', jobId)
        .maybeSingle();
      if (job?.status === 'done' || job?.status === 'error') {
        clearInterval(interval);
        bumpPollRef.current.delete(itemId);
        setBumpingIds((prev) => { const next = new Map(prev); next.delete(itemId); return next; });
        router.refresh();
      }
    }, 3000);
    bumpPollRef.current.set(itemId, interval);
  }, [router]);

  // Clean up any running polls on unmount.
  useEffect(() => {
    const polls = bumpPollRef.current;
    return () => { polls.forEach((iv) => clearInterval(iv)); };
  }, []);

  return { bumpingIds, onBumpQueued };
}
