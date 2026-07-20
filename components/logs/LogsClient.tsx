'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronUp } from 'lucide-react';
import PageTitle from '@/components/layout/PageTitle';

type AuditLog = {
  id: string;
  created_at: string;
  actor_type: 'user' | 'agent' | 'system';
  actor_user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown>;
};

const FRED_ID = '35385d3c-5966-4a10-8568-8d92d1be47e7';
const GILLY_ID = 'a018a4ef-e02e-4a67-9732-9fafe3167e10';

function actorBadgeClass(log: AuditLog): string {
  if (log.actor_type === 'agent') return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
  if (log.actor_type === 'user') return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
  return 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30';
}

function actionDotClass(action: string): string {
  if (action.startsWith('listing.') || action === 'job.created') return 'bg-green-400';
  if (action.includes('deleted') || action === 'job.failed') return 'bg-red-400';
  if (action.startsWith('migration.') || action.startsWith('system.')) return 'bg-yellow-400';
  return 'bg-blue-400';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function DetailsRow({ details }: { details: Record<string, unknown> }) {
  return (
    <div className="bg-bg border-border mt-1 rounded border p-2">
      <pre className="text-text-faint overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs">
        {JSON.stringify(details, null, 2)}
      </pre>
    </div>
  );
}

function LogRow({ log }: { log: AuditLog }) {
  const t = useTranslations('logs');
  const [open, setOpen] = useState(false);
  const hasDetails = log.details && Object.keys(log.details).length > 0;

  function actorLabel(l: AuditLog): string {
    if (l.actor_type === 'agent') {
      if (l.actor_user_id === FRED_ID) return t('actors.agentFred');
      if (l.actor_user_id === GILLY_ID) return t('actors.agentGilly');
      return t('actors.agent');
    }
    if (l.actor_type === 'user') {
      if (l.actor_user_id === FRED_ID) return t('actors.fred');
      if (l.actor_user_id === GILLY_ID) return t('actors.gilly');
      return t('actors.user');
    }
    return t('actors.system');
  }

  function actionLabel(action: string): string {
    // Audit actions are dot-namespaced (card.created) but next-intl reserves
    // "." for nesting — the message keys use "_" instead (card_created).
    const key = `actions.${action.replace(/\./g, '_')}` as Parameters<typeof t>[0];
    try {
      const label = t(key);
      return label !== key ? label : action;
    } catch {
      return action;
    }
  }

  return (
    <li>
      <button
        className="hover:bg-surface-hover w-full cursor-pointer px-4 py-2.5 text-left transition-colors"
        onClick={() => hasDetails && setOpen((v) => !v)}
        disabled={!hasDetails}
      >
        <div className="flex items-start gap-3">
          <div className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${actionDotClass(log.action)}`} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`border rounded px-1.5 py-0.5 font-mono text-xs ${actorBadgeClass(log)}`}>
                {actorLabel(log)}
              </span>
              <span className="text-text text-sm font-medium">{actionLabel(log.action)}</span>
              {log.details?.card_name != null && (
                <span className="text-text-muted truncate text-xs">
                  {String(log.details.card_name)}
                </span>
              )}
              {log.details?.name != null && (
                <span className="text-text-muted truncate text-xs">
                  {String(log.details.name)}
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="text-text-faint font-mono text-xs">{formatDate(log.created_at)}</span>
              {log.entity_id && (
                <span className="text-text-faint font-mono text-xs opacity-50">
                  {log.entity_id.slice(0, 8)}
                </span>
              )}
            </div>
          </div>
          {hasDetails && (
            <div className="text-text-faint flex-shrink-0">
              {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </div>
          )}
        </div>
        {open && hasDetails && <DetailsRow details={log.details} />}
      </button>
    </li>
  );
}

const ACTOR_FILTERS = ['all', 'user', 'agent', 'system'] as const;
type ActorFilter = (typeof ACTOR_FILTERS)[number];

export default function LogsClient({ initialLogs }: { initialLogs: AuditLog[] }) {
  const t = useTranslations('logs');
  const [logs, setLogs] = useState<AuditLog[]>(initialLogs);
  const [actorFilter, setActorFilter] = useState<ActorFilter>('all');
  const [actionFilter, setActionFilter] = useState('');
  const [offset, setOffset] = useState(initialLogs.length);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialLogs.length === 100);

  const filterLabels: Record<ActorFilter, string> = {
    all: t('filterAll'),
    user: t('filterUser'),
    agent: t('filterAgent'),
    system: t('filterSystem'),
  };

  const fetchLogs = useCallback(async (actor: ActorFilter, action: string, off: number) => {
    const params = new URLSearchParams({ limit: '100', offset: String(off) });
    if (actor !== 'all') params.set('actor_type', actor);
    if (action) params.set('action', action);
    const res = await fetch(`/api/logs?${params}`);
    if (!res.ok) return null;
    return res.json() as Promise<{ logs: AuditLog[]; total: number }>;
  }, []);

  const loadMore = useCallback(async () => {
    setLoading(true);
    const data = await fetchLogs(actorFilter, actionFilter, offset);
    if (data) {
      setLogs((prev) => [...prev, ...data.logs]);
      setOffset((o) => o + data.logs.length);
      setHasMore(data.logs.length === 100);
    }
    setLoading(false);
  }, [fetchLogs, offset, actorFilter, actionFilter]);

  const applyFilters = useCallback(async (actor: ActorFilter, action: string) => {
    setLoading(true);
    const data = await fetchLogs(actor, action, 0);
    if (data) {
      setLogs(data.logs);
      setOffset(data.logs.length);
      setHasMore(data.logs.length === 100);
    }
    setLoading(false);
  }, [fetchLogs]);

  return (
    <section>
      <PageTitle title={t('pageTitle')} subtitle={t('pageSubtitle')} />

      {/* Filters */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {ACTOR_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => { setActorFilter(f); void applyFilters(f, actionFilter); }}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                actorFilter === f
                  ? 'bg-accent text-white'
                  : 'bg-surface border-border text-text-muted border hover:text-text'
              }`}
            >
              {filterLabels[f]}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder={t('filterActionPlaceholder')}
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value);
            void applyFilters(actorFilter, e.target.value);
          }}
          className="bg-surface border-border text-text placeholder-text-faint rounded border px-2.5 py-1 text-xs focus:outline-none"
        />
        <span className="text-text-faint text-xs">
          {logs.length <= 1 ? t('entries', { count: logs.length }) : t('entriesPlural', { count: logs.length })}
        </span>
      </div>

      {/* Log list */}
      <div className="bg-surface border-border mt-4 overflow-hidden rounded-lg border">
        {logs.length === 0 ? (
          <p className="text-text-faint p-6 text-center text-sm">{t('empty')}</p>
        ) : (
          <ul className="divide-border divide-y">
            {logs.map((log) => (
              <LogRow key={log.id} log={log} />
            ))}
          </ul>
        )}
      </div>

      {hasMore && (
        <div className="mt-4 text-center">
          <button
            onClick={loadMore}
            disabled={loading}
            className="bg-surface border-border text-text-muted hover:text-text rounded border px-4 py-2 text-sm transition-colors disabled:opacity-50"
          >
            {loading ? t('loading') : t('loadMore')}
          </button>
        </div>
      )}
    </section>
  );
}
