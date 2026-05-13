import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import ManualBackupButton from './ManualBackupButton';
import ManualBackupRow from './ManualBackupRow';

export default async function ManualBackupSection() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const service = createServiceClient();
  const { data: files } = await service.storage
    .from('manual-backups')
    .list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

  const t = await getTranslations('options');

  return (
    <div className="bg-surface border-border rounded-lg border p-5">
      <h2 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
        {t('backupManualHeading')}
      </h2>
      <p className="text-text-muted mb-3 text-sm">{t('backupManualDescription')}</p>

      <ManualBackupButton />

      {files && files.length > 0 && (
        <div className="mt-5">
          <h3 className="text-text-muted mb-2 text-xs font-semibold uppercase tracking-wide">
            {t('backupExisting', { count: files.length })}
          </h3>
          <ul className="divide-border divide-y">
            {files.map((f) => (
              <ManualBackupRow
                key={f.name}
                name={f.name}
                createdAt={f.created_at ?? ''}
                sizeBytes={f.metadata?.size ?? null}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
