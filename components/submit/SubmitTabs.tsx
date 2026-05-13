'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ScanLine, Layers, Package } from 'lucide-react';
import CardScanForm from './CardScanForm';
import LotForm from './LotForm';
import BatchForm from './BatchForm';

type Tab = 'mobile' | 'lot' | 'batch';

const TAB_DEFS: { id: Tab; labelKey: 'tabMobile' | 'tabLot' | 'tabBatch'; icon: typeof ScanLine }[] = [
  { id: 'mobile', labelKey: 'tabMobile', icon: ScanLine },
  { id: 'lot', labelKey: 'tabLot', icon: Layers },
  { id: 'batch', labelKey: 'tabBatch', icon: Package },
];

export default function SubmitTabs() {
  const t = useTranslations('scanner');
  const [tab, setTab] = useState<Tab>('mobile');

  return (
    // Desktop: parent (/submit page) gives us a fixed-height container. We
    // claim its full height, the strip is shrink-0, the content area scrolls.
    <div className="flex flex-col gap-6 lg:h-full">
      <div className="border-border flex gap-1 border-b lg:shrink-0">
        {TAB_DEFS.map(({ id, labelKey, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors ${
                active
                  ? 'border-red text-text font-medium'
                  : 'border-transparent text-text-muted hover:text-text'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {t(labelKey)}
            </button>
          );
        })}
      </div>

      {/* Only this region scrolls on desktop. CardScanForm's photo column is
          already sticky (lg:sticky lg:top-6) so it stays anchored at top of
          this scrollable parent while the form fields scroll. */}
      <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:pr-3">
        {tab === 'mobile' && <CardScanForm />}
        {tab === 'lot' && <LotForm />}
        {tab === 'batch' && <BatchForm />}
      </div>
    </div>
  );
}
