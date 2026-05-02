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
      <div className="border-border flex gap-1 border-b">
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
