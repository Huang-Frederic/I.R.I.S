import { NextResponse } from 'next/server';
import { detectText } from '@/lib/api/vision';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('image');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing "image" file' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString('base64');

  try {
    const result = await detectText(base64);
    return NextResponse.json(result);
  } catch (error) {
    console.error('OCR failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'OCR failed' },
      { status: 502 },
    );
  }
}
