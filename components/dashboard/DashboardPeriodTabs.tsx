'use client';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import type { DashboardPeriod } from '@/lib/utils/dashboard-queries';

const OPTIONS = [
  { value: '7d', label: '7j' },
  { value: '30d', label: '30j' },
  { value: '90d', label: '90j' },
  { value: '365d', label: '1 an' },
] as const;

export default function DashboardPeriodTabs({ current }: { current: DashboardPeriod }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setPeriod(value: DashboardPeriod) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('period', value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div role="tablist" className="bg-surface-2 inline-flex rounded-md p-0.5">
      {OPTIONS.map((opt) => {
        const active = opt.value === current;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setPeriod(opt.value)}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              active ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
