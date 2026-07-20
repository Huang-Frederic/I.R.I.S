import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import PageTitle from '@/components/layout/PageTitle';
import EventsList from '@/components/events/EventsList';
import type { StoreEventRow } from '@/lib/types';

export async function generateMetadata() {
  const t = await getTranslations('events');
  return { title: t('metaTitle') };
}

export default async function EventsPage() {
  const t = await getTranslations('events');
  const supabase = await createClient();

  // Upcoming only: events from the start of today onward, plus undated ones
  // (shown last). starts_at is UTC-built by the scraper.
  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('store_events')
    .select('*')
    .or(`starts_at.gte.${cutoff.toISOString()},starts_at.is.null`)
    .order('starts_at', { ascending: true, nullsFirst: false })
    .limit(500);

  if (error) {
    return (
      <section>
        <PageTitle title={t('pageTitle')} />
        <p className="text-red mt-4 text-sm">{t('loadError', { message: error.message })}</p>
      </section>
    );
  }

  const events = (data ?? []) as StoreEventRow[];

  return (
    <section>
      <PageTitle title={t('pageTitle')} subtitle={t('pageSubtitle', { count: events.length })} />
      <div className="mt-6">
        <EventsList events={events} />
      </div>
    </section>
  );
}
