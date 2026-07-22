'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ScanLine, Box } from 'lucide-react';
import BatchForm from './BatchForm';
import OtherForm from './OtherForm';

type Tab = 'batch' | 'other';

// "Scanner" (batch flow) is the primary tab, shown first + selected by default.
// "Autre & Lot" (manual lot/single form) sits to its right.
const TAB_DEFS: { id: Tab; labelKey: 'tabBatch' | 'tabOther'; icon: typeof ScanLine }[] = [
  { id: 'batch', labelKey: 'tabBatch', icon: ScanLine },
  { id: 'other', labelKey: 'tabOther', icon: Box },
];

export default function SubmitTabs() {
  const t = useTranslations('scanner');
  const [tab, setTab] = useState<Tab>('batch');

  return (
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

      <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:pr-3">
        {tab === 'batch' && <BatchForm />}
        {tab === 'other' && <OtherForm />}
      </div>
    </div>
  );
}
