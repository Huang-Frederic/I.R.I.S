'use client';

import { useState } from 'react';
import { ScanLine, Layers, Package } from 'lucide-react';
import CardScanForm from './CardScanForm';
import LotForm from './LotForm';
import BatchForm from './BatchForm';

type Tab = 'mobile' | 'lot' | 'batch';

const TABS: { id: Tab; label: string; icon: typeof ScanLine }[] = [
  { id: 'mobile', label: 'Mobile', icon: ScanLine },
  { id: 'lot', label: 'Lot Vinted', icon: Layers },
  { id: 'batch', label: 'Batch', icon: Package },
];

export default function SubmitTabs() {
  const [tab, setTab] = useState<Tab>('mobile');

  return (
    <div className="flex flex-col gap-6">
      {/* Desktop only: stick the tab strip just under the page header (which
          is itself sticky at top-0). Stack of two sticky elements stays
          visible while the active tab content scrolls. ~80px = h1 + intro + py-3. */}
      <div className="border-border lg:bg-bg lg:sticky lg:top-[80px] lg:z-10 lg:-mx-8 lg:px-8 flex gap-1 border-b">
        {TABS.map(({ id, label, icon: Icon }) => {
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
              {label}
            </button>
          );
        })}
      </div>

      {tab === 'mobile' && <CardScanForm />}
      {tab === 'lot' && <LotForm />}
      {tab === 'batch' && <BatchForm />}
    </div>
  );
}
