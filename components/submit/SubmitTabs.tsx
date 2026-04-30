'use client';

import { useState } from 'react';
import { ScanLine, Layers, Terminal } from 'lucide-react';
import CardScanForm from './CardScanForm';

type Tab = 'mobile' | 'lot' | 'script';

const TABS: { id: Tab; label: string; icon: typeof ScanLine }[] = [
  { id: 'mobile', label: 'Mobile', icon: ScanLine },
  { id: 'lot', label: 'Lot ≤20', icon: Layers },
  { id: 'script', label: 'Script', icon: Terminal },
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
      {tab === 'lot' && (
        <p className="text-text-muted bg-surface border-border rounded-lg border p-6 text-sm">
          Mode lot (jusqu&apos;à 20 cartes en une fois) disponible en Phase 3.
        </p>
      )}
      {tab === 'script' && (
        <p className="text-text-muted bg-surface border-border rounded-lg border p-6 text-sm">
          Le script Python d&apos;import en masse arrive en Phase 3. Voir{' '}
          <code className="bg-surface-2 rounded px-1 py-0.5 text-xs">scripts/add_cards.py</code>.
        </p>
      )}
    </div>
  );
}
