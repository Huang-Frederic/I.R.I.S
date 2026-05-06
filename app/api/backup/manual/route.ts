import { NextResponse } from 'next/server';
import { gzipSync } from 'node:zlib';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { buildManualDump, manualBackupFilename, type ManualDumpTables } from '@/lib/utils/manual-dump';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TABLES = [
  'cards', 'lots', 'card_listings', 'lot_listings',
  'user_profiles', 'config', 'ocr_usage_log', 'stock_value_snapshots',
] as const satisfies readonly (keyof ManualDumpTables)[];

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();

  const tables: Partial<ManualDumpTables> = {};
  for (const t of TABLES) {
    const { data, error } = await service.from(t).select('*');
    if (error) {
      return NextResponse.json(
        { error: `Failed reading ${t}: ${error.message}` },
        { status: 500 },
      );
    }
    tables[t] = data ?? [];
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
    return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 });
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
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();
  const { data, error } = await service.storage
    .from('manual-backups')
    .list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    backups: (data ?? []).map((f) => ({
      name: f.name,
      created_at: f.created_at,
      size_bytes: f.metadata?.size ?? null,
    })),
  });
}
