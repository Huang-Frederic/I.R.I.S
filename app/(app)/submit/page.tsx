import { getTranslations } from 'next-intl/server';
import SubmitTabs from '@/components/submit/SubmitTabs';
import PageTitle from '@/components/layout/PageTitle';

export async function generateMetadata() {
  const t = await getTranslations('scanner');
  return { title: t('metaTitle') };
}

export default async function SubmitPage() {
  const t = await getTranslations('scanner');
  return (
    // Desktop: viewport-height shell with overflow-hidden. The form column
    // inside SubmitTabs gets its own overflow-y-auto so ONLY the form scrolls;
    // header, tabs, and photo column stay put. Mobile keeps natural flow
    // (BottomNav eats viewport, header sticky would overcrowd).
    // 3.5rem = parent layout's pt-6 (1.5rem) + pb-8 (2rem) padding.
    <section className="lg:h-[calc(100dvh-3.5rem)] lg:overflow-hidden lg:flex lg:flex-col">
      <div className="lg:shrink-0">
        <PageTitle
          title={t('pageTitle')}
          subtitle={t('pageSubtitle')}
        />
      </div>
      <div className="mt-6 lg:flex-1 lg:min-h-0 lg:overflow-hidden">
        <SubmitTabs />
      </div>
    </section>
  );
}
