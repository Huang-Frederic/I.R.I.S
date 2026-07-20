/**
 * Upload the (already client-resized) photo of a trade batch.
 * Shared by the Vinted and Stock bulk-trade flows — one upload per batch,
 * the returned URL is stamped on every traded card.
 *
 * Browser-only (fetch + FormData against our own API route).
 */
export async function uploadTradePhoto(photo: Blob): Promise<{ url: string | null; error?: string }> {
  const fd = new FormData();
  fd.append('image', photo, 'trade.jpg');
  try {
    const res = await fetch('/api/trades/photo', { method: 'POST', body: fd });
    const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !json.url) return { url: null, error: json.error };
    return { url: json.url };
  } catch {
    return { url: null };
  }
}
