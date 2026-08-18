import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { guard } from '@/lib/routeGuard';
import { s3, PESSOAS_BUCKET } from '@/lib/s3Client';

export const dynamic = 'force-dynamic';

// Proxy de leitura para o bucket privado de fotos de funcionários no SeaweedFS.
// O bucket não tem policy pública (LGPD) — só quem está autenticado no
// organograma (guard abaixo) consegue ver as fotos, e as credenciais do S3
// nunca chegam ao navegador.
export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const { error } = await guard(request, { role: 'viewer' });
  if (error) return error;

  const { key } = await params;
  const objectKey = key.join('/');

  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: PESSOAS_BUCKET, Key: objectKey }));
    const body = obj.Body?.transformToWebStream();
    if (!body) return NextResponse.json({ error: 'Foto não encontrada.' }, { status: 404 });

    return new NextResponse(body, {
      headers: {
        'Content-Type': obj.ContentType ?? 'application/octet-stream',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Foto não encontrada.' }, { status: 404 });
  }
}
