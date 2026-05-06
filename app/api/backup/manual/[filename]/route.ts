import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';

const FILENAME_PATTERN = /^iris-\d{4}-\d{2}-\d{2}-\d{6}\.json\.gz$/;

interface Context {
  params: Promise<{ filename: string }>;
}

export async function GET(_request: Request, { params }: Context) {
  const { filename } = await params;
  if (!FILENAME_PATTERN.test(filename)) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();
  const { data, error } = await service.storage
    .from('manual-backups')
    .createSignedUrl(filename, 3600);

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Sign failed' }, { status: 500 });
  }

  return NextResponse.json({ signedUrl: data.signedUrl });
}

export async function DELETE(_request: Request, { params }: Context) {
  const { filename } = await params;
  if (!FILENAME_PATTERN.test(filename)) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = createServiceClient();
  const { error } = await service.storage.from('manual-backups').remove([filename]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
