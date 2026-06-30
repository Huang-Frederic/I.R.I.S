import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import LogsClient from '@/components/logs/LogsClient';

export const metadata = { title: 'Logs d\'activité — I.R.I.S' };
export const dynamic = 'force-dynamic';

export default async function LogsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: logs } = await supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  return <LogsClient initialLogs={logs ?? []} />;
}
