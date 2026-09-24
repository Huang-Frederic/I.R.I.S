import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import PageTitle from '@/components/layout/PageTitle';
import MonitoringSection from '@/components/vinted/monitoring/MonitoringSection';

export async function generateMetadata() {
  const t = await getTranslations('vinted');
  return { title: t('botMetaTitle') };
}

export default async function VintedBotPage() {
  const t = await getTranslations('vinted');
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const allowedIds = (process.env.VINTED_USER_IDS ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const vintedEnabled = !!user && allowedIds.includes(user.id);

  if (!vintedEnabled) {
    return (
      <section>
        <PageTitle title={t('botPageTitle')} />
        <p className="text-text-muted mt-4 text-sm">{t('botNotEnabled')}</p>
      </section>
    );
  }

  return (
    <section>
      <PageTitle title={t('botPageTitle')} />
      <div className="mt-6">
        <MonitoringSection />
      </div>
    </section>
  );
}
