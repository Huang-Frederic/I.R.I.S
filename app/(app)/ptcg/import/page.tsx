import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft } from 'lucide-react';
import PageTitle from '@/components/layout/PageTitle';
import PtcgImport from '@/components/ptcg/PtcgImport';

export async function generateMetadata() {
  const t = await getTranslations('ptcg');
  return { title: t('importTitle') };
}

export default async function PtcgImportPage() {
  const t = await getTranslations('ptcg');
  return (
    <section>
      <Link
        href="/ptcg"
        className="text-text-muted hover:text-text mb-3 inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t('pageTitle')}
      </Link>
      <PageTitle title={t('importTitle')} subtitle={t('importSubtitle')} />
      <div className="mt-6 max-w-3xl">
        <PtcgImport />
      </div>
    </section>
  );
}
