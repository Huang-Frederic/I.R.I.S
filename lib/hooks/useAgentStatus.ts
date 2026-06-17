'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export type AgentStatus = 'online' | 'offline';

const POLL_INTERVAL_MS = 30_000;
const ONLINE_THRESHOLD_MS = 90_000;

export function useAgentStatus(): AgentStatus {
  const [status, setStatus] = useState<AgentStatus>('offline');

  useEffect(() => {
    const supabase = createClient();

    async function check() {
      const cutoff = new Date(Date.now() - ONLINE_THRESHOLD_MS).toISOString();
      const { count } = await supabase
        .from('agent_heartbeats')
        .select('*', { count: 'exact', head: true })
        .gte('last_seen_at', cutoff);
      setStatus((count ?? 0) > 0 ? 'online' : 'offline');
    }

    check();
    const id = setInterval(check, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return status;
}
