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
    // Breaks out of the shared layout's `max-w-[1200px]` — this page's
    // grouped card grid genuinely benefits from the extra width (more
    // columns, groups sitting side by side) where a text-heavy page
    // wouldn't. `w-screen` + `left-1/2 -translate-x-1/2` re-centers on the
    // true viewport regardless of the ancestor's own width/centering; the
    // fixed, opaque sidebar simply covers whatever spills behind it.
    <section className="relative left-1/2 w-screen -translate-x-1/2 px-4 md:px-8">
      <PageTitle title={t('botPageTitle')} />
      <div className="mt-6">
        <MonitoringSection />
      </div>
    </section>
  );
}
