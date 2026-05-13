'use client';

import { Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { PriceTrendsProvider } from '@/components/ui/PriceTrendsProvider';
import { StatsHeader } from '@/components/prices/StatsHeader';

export default function PricesPage() {
  return (
    <Suspense>
      <PriceTrendsProvider>
        <PricesPageContent />
      </PriceTrendsProvider>
    </Suspense>
  );
}

function PricesPageContent() {
  const t = useTranslations('prices');
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">{t('title')}</h1>
      <StatsHeader />
      {/* PortfolioValueChart / TopMoversPanel / AllCardsList added in T23-T26 */}
    </div>
  );
}
