import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { guard } from '@/lib/routeGuard';
import { getS3Client, HISTORIA_BUCKET } from '@/lib/s3Client';
import { parseUploadedImage, handleImageDelete } from '@/lib/uploadRoute';

export const dynamic = 'force-dynamic';

function endpointBase(): string {
  return (process.env.S3_ENDPOINT ?? '').replace(/\/$/, '');
}

function historiaPrefix(): string {
  return `${endpointBase()}/${HISTORIA_BUCKET}/`;
}

// Upload de imagem de fundo / marcos da linha do tempo de "Nossa História" —
// bucket público (conteúdo institucional, sem dado pessoal sensível).
export async function POST(request: NextRequest) {
  const { error } = await guard(request, { role: 'editor', action: 'write', sameOrigin: true });
  if (error) return error;

  const { data, error: parseError } = await parseUploadedImage(request);
  if (parseError) return parseError;

  const key = `uploads/${randomUUID()}.${data.ext}`;

  try {
    await getS3Client().send(new PutObjectCommand({ Bucket: HISTORIA_BUCKET, Key: key, Body: data.buffer, ContentType: data.contentType }));
    return NextResponse.json({ url: `${historiaPrefix()}${key}` });
  } catch (err) {
    console.error('[upload/historia] falha ao enviar para o S3:', err);
    return NextResponse.json({ error: 'Falha ao enviar a imagem.' }, { status: 502 });
  }
}

// Remove uma imagem previamente enviada — chamado ao trocar/remover uma
// imagem no admin, para não deixar o objeto antigo órfão no bucket.
export async function DELETE(request: NextRequest) {
  const { error } = await guard(request, { role: 'editor', action: 'write', sameOrigin: true });
  if (error) return error;

  return handleImageDelete(request, { bucket: HISTORIA_BUCKET, prefix: historiaPrefix(), logTag: 'upload/historia' });
}
