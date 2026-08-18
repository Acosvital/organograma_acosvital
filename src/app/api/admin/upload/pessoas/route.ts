import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { guard } from '@/lib/routeGuard';
import { getS3Client, PESSOAS_BUCKET } from '@/lib/s3Client';
import { parseUploadedImage, handleImageDelete } from '@/lib/uploadRoute';

export const dynamic = 'force-dynamic';

const FOTOS_PREFIX = '/api/fotos/';

// Upload de foto de funcionário — bucket privado (LGPD). Devolve o caminho do
// proxy autenticado /api/fotos, nunca a URL direta do SeaweedFS.
export async function POST(request: NextRequest) {
  const { error } = await guard(request, { role: 'editor', action: 'write', sameOrigin: true });
  if (error) return error;

  const { data, error: parseError } = await parseUploadedImage(request);
  if (parseError) return parseError;

  const key = `uploads/${randomUUID()}.${data.ext}`;

  try {
    await getS3Client().send(new PutObjectCommand({ Bucket: PESSOAS_BUCKET, Key: key, Body: data.buffer, ContentType: data.contentType }));
    return NextResponse.json({ url: `${FOTOS_PREFIX}${key}` });
  } catch (err) {
    console.error('[upload/pessoas] falha ao enviar para o S3:', err);
    return NextResponse.json({ error: 'Falha ao enviar a imagem.' }, { status: 502 });
  }
}

// Remove uma foto previamente enviada — chamado ao trocar/remover a foto de um
// funcionário, para não deixar o objeto antigo órfão no bucket (LGPD).
export async function DELETE(request: NextRequest) {
  const { error } = await guard(request, { role: 'editor', action: 'write', sameOrigin: true });
  if (error) return error;

  return handleImageDelete(request, { bucket: PESSOAS_BUCKET, prefix: FOTOS_PREFIX, logTag: 'upload/pessoas' });
}
