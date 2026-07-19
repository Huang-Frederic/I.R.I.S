import { NextResponse } from 'next/server';
import { gzipSync } from 'node:zlib';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { fetchAllRows } from '@/lib/api/fetch-all';
import { buildManualDump, manualBackupFilename, type ManualDumpTables } from '@/lib/utils/manual-dump';
import { apiError, unauthorizedResponse } from '@/lib/utils/api-response';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Stable, unique ordering per table — required for .range() pagination
// (Supabase clamps every response at 1000 rows; a backup must never be
// silently partial, so each table is paged to completion).
const TABLES = {
  cards: ['id'],
  lots: ['id'],
  card_listings: ['card_id', 'user_id'],
  lot_listings: ['lot_id', 'user_id'],
  user_profiles: ['user_id'],
  config: ['key'],
  ocr_usage_log: ['id'],
  stock_value_snapshots: ['date'],
} as const satisfies Record<keyof ManualDumpTables, readonly string[]>;

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return unauthorizedResponse();

  const service = createServiceClient();

  const tables: Partial<ManualDumpTables> = {};
  for (const [t, orderCols] of Object.entries(TABLES)) {
    const { data, error } = await fetchAllRows((from, to) => {
      let query = service.from(t).select('*');
      for (const col of orderCols) query = query.order(col, { ascending: true });
      return query.range(from, to);
    });
    if (error) {
      return apiError('read_failed', {
        status: 500,
        message: `Failed reading ${t}: ${error.message}`,
      });
    }
    tables[t as keyof ManualDumpTables] = data ?? [];
  }

  const now = new Date();
  const dump = buildManualDump(tables as ManualDumpTables, now.toISOString());
  const json = JSON.stringify(dump);
  const gz = gzipSync(Buffer.from(json, 'utf-8'));
  const filename = manualBackupFilename(now);

  const { error: upErr } = await service.storage
    .from('manual-backups')
    .upload(filename, gz, { contentType: 'application/gzip', upsert: false });

  if (upErr) {
    return apiError('upload_failed', {
      status: 500,
      message: `Upload failed: ${upErr.message}`,
    });
  }

  return NextResponse.json({
    ok: true,
    filename,
    size_bytes: gz.byteLength,
  });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return unauthorizedResponse();

  const service = createServiceClient();
  const { data, error } = await service.storage
    .from('manual-backups')
    .list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

  if (error) return apiError('list_failed', { status: 500, message: error.message });

  return NextResponse.json({
    backups: (data ?? []).map((f) => ({
      name: f.name,
      created_at: f.created_at,
      size_bytes: f.metadata?.size ?? null,
    })),
  });
}
