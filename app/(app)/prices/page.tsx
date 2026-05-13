'use client';

import { Suspense, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { PriceTrendsProvider } from '@/components/ui/PriceTrendsProvider';
import { StatsHeader } from '@/components/prices/StatsHeader';
import { PortfolioValueChart } from '@/components/prices/PortfolioValueChart';
import { TopMoversPanel } from '@/components/prices/TopMoversPanel';
import { AllCardsList } from '@/components/prices/AllCardsList';
import { PriceDetailModal } from '@/components/price/PriceDetailModal';
import { createClient } from '@/lib/supabase/client';
import type { Card } from '@/lib/types';

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
  const searchParams = useSearchParams();
  const initialSet = searchParams?.get('set') ?? null;
  const [modalCard, setModalCard] = useState<Card | null>(null);

  const openCard = async (cardId: string) => {
    const supabase = createClient();
    const { data } = await supabase.from('cards').select('*').eq('id', cardId).single();
    if (data) setModalCard(data as Card);
  };

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">{t('title')}</h1>
      <StatsHeader />
      <PortfolioValueChart />
      <TopMoversPanel onCardClick={openCard} />
      <AllCardsList initialSetFilter={initialSet} onCardClick={openCard} />
      {modalCard && (
        <PriceDetailModal
          card={modalCard}
          open={true}
          onClose={() => setModalCard(null)}
          onCardUpdated={(updated) => setModalCard(updated)}
        />
      )}
    </div>
  );
}
