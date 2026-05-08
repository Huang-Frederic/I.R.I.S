import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiError, unauthorizedResponse, validationResponse } from '@/lib/utils/api-response';

export const runtime = 'nodejs';

const FILENAME_PATTERN = /^iris-\d{4}-\d{2}-\d{2}-\d{6}\.json\.gz$/;

interface Context {
  params: Promise<{ filename: string }>;
}

export async function GET(_request: Request, { params }: Context) {
  const { filename } = await params;
  if (!FILENAME_PATTERN.test(filename)) {
    return validationResponse('Invalid filename');
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return unauthorizedResponse();

  const service = createServiceClient();
  const { data, error } = await service.storage
    .from('manual-backups')
    .createSignedUrl(filename, 3600);

  if (error || !data) {
    return apiError('sign_failed', { status: 500, message: error?.message ?? 'Sign failed' });
  }

  return NextResponse.json({ signedUrl: data.signedUrl });
}

export async function DELETE(_request: Request, { params }: Context) {
  const { filename } = await params;
  if (!FILENAME_PATTERN.test(filename)) {
    return validationResponse('Invalid filename');
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return unauthorizedResponse();

  const service = createServiceClient();
  const { error } = await service.storage.from('manual-backups').remove([filename]);

  if (error) return apiError('delete_failed', { status: 500, message: error.message });

  return NextResponse.json({ ok: true });
}
