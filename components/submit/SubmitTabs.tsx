'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ScanLine, Box, Shirt } from 'lucide-react';
import BatchForm from './BatchForm';
import OtherForm from './OtherForm';
import OtherItemForm from '../other-items/OtherItemForm';
import { useUserContext } from '@/lib/hooks/useUserContext';
import { FRED_USER_ID } from '@/lib/vinted/other-item-queue-sync';

type Tab = 'batch' | 'other' | 'other-item';

// "Scanner" (batch flow) is the primary tab, shown first + selected by default.
// "Autre & Lot" (manual lot/single form) sits to its right. "Objets" (non-card
// Vinted items) is Fred-only — see other-item-queue-sync.ts for why.
const TAB_DEFS: {
  id: Tab;
  labelKey: 'tabBatch' | 'tabOther' | 'tabOtherItem';
  icon: typeof ScanLine;
}[] = [
  { id: 'batch', labelKey: 'tabBatch', icon: ScanLine },
  { id: 'other', labelKey: 'tabOther', icon: Box },
  { id: 'other-item', labelKey: 'tabOtherItem', icon: Shirt },
];

export default function SubmitTabs() {
  const t = useTranslations('scanner');
  const { myUserId } = useUserContext();
  const [tab, setTab] = useState<Tab>('batch');
  const tabs = TAB_DEFS.filter((d) => d.id !== 'other-item' || myUserId === FRED_USER_ID);

  return (
    <div className="flex flex-col gap-6 lg:h-full">
      <div className="border-border flex gap-1 border-b lg:shrink-0">
        {tabs.map(({ id, labelKey, icon: Icon }) => {
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
                  : 'text-text-muted hover:text-text border-transparent'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {t(labelKey)}
            </button>
          );
        })}
      </div>

      <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-3">
        {tab === 'batch' && <BatchForm />}
        {tab === 'other' && <OtherForm />}
        {tab === 'other-item' && <OtherItemForm />}
      </div>
    </div>
  );
}
