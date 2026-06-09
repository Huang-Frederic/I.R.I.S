'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { X, ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import VintedLogo from '@/components/ui/VintedLogo';

interface Props {
  cardId: string;
  userId: string;
  hasPrice: boolean;
  onListingsChanged: () => void;
}

export default function VintedPostButton({ cardId, userId, hasPrice, onListingsChanged }: Props) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'loading' | 'queued' | 'success' | 'error'>('idle');
  const [mounted, setMounted] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [listingId, setListingId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setMounted(true);
    if (!hasPrice) return;
    const supabase = createClient();
    supabase
      .from('vinted_post_jobs')
      .select('id, status')
      .eq('card_id', cardId)
      .eq('user_id', userId)
      .in('status', ['pending', 'processing', 'error'])
      .limit(1)
      .maybeSingle()
      .then(async ({ data }) => {
        if (!data) return;
        if (data.status === 'error') {
          await supabase.from('vinted_post_jobs').delete().eq('id', data.id);
          setState('idle');
        } else {
          setJobId(data.id);
          setState('queued');
        }
      });
  }, [cardId, userId, hasPrice]);

  // Poll for job completion when queued
  useEffect(() => {
    if (state !== 'queued' || !jobId) return;
    const supabase = createClient();
    pollRef.current = setInterval(async () => {
      const { data: job } = await supabase
        .from('vinted_post_jobs')
        .select('status')
        .eq('id', jobId)
        .maybeSingle();
      if (!job) return;
      if (job.status === 'done') {
        clearInterval(pollRef.current!);
        const { data: listing } = await supabase
          .from('card_listings')
          .select('vinted_listing_id')
          .eq('card_id', cardId)
          .eq('user_id', userId)
          .maybeSingle();
        setListingId(listing?.vinted_listing_id ?? null);
        setState('success');
      } else if (job.status === 'error') {
        clearInterval(pollRef.current!);
        await supabase.from('vinted_post_jobs').delete().eq('id', jobId);
        setState('idle');
      }
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [state, jobId, cardId]);

  const handleClick = async () => {
    setState('loading');
    try {
      const res = await fetch('/api/vinted/post-job', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ card_id: cardId }),
      });
      if (res.status === 201) {
        const { job_id } = await res.json();
        setJobId(job_id);
        setState('queued');
      } else {
        setState('error');
      }
    } catch {
      setState('error');
    }
  };

  const handleSuccessClose = () => {
    setState('idle');
    setJobId(null);
    setListingId(null);
    onListingsChanged();
    router.refresh(); // Re-fetch server data so card shows as Online immediately
  };

  if (!mounted) return null;

  if (!hasPrice) {
    return (
      <span
        className="text-[10px] sm:text-xs text-text-faint"
        title="Définir un prix dans l'annonce avant de poster"
      >
        Prix manquant
      </span>
    );
  }

  if (state === 'success') {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] sm:text-xs text-green-500 font-medium">✓ En ligne !</span>
        {listingId && (
          <a
            href={`https://www.vinted.fr/items/${listingId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] sm:text-xs text-green-500 underline inline-flex items-center gap-0.5"
          >
            Voir <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
        <button
          type="button"
          onClick={handleSuccessClose}
          className="text-text-muted hover:text-text"
          aria-label="Fermer"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  if (state === 'queued') {
    return <span className="text-[10px] sm:text-xs text-yellow-500">En attente…</span>;
  }

  if (state === 'error') {
    return <span className="text-[10px] sm:text-xs text-red-500">Erreur</span>;
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={state === 'loading'}
      className="shrink-0 inline-flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-medium hover:opacity-90 disabled:opacity-50 sm:px-3 sm:py-1.5 sm:text-xs"
      style={{ backgroundColor: '#007782', color: '#fff' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/vinted-logo.jpeg" alt="" className="h-4 w-4 rounded object-cover" />
      {state === 'loading' ? '…' : 'Vinted'}
    </button>
  );
}
