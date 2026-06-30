import { createServiceClient } from '@/lib/supabase/service';

type ActorType = 'user' | 'agent' | 'system';

export type AuditEntry = {
  actor_type: ActorType;
  actor_user_id?: string | null;
  action: string;
  entity_type?: string;
  entity_id?: string;
  details?: Record<string, unknown>;
};

export async function auditLog(entry: AuditEntry): Promise<void> {
  try {
    const svc = createServiceClient();
    await svc.from('audit_logs').insert(entry);
  } catch {
    // fire-and-forget — never block the main action
  }
}
