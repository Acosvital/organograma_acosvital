import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { guard } from '@/lib/routeGuard';
import { getS3Client, EMPRESA_BUCKET } from '@/lib/s3Client';
import { parseUploadedImage, handleImageDelete } from '@/lib/uploadRoute';

export const dynamic = 'force-dynamic';

function empresaPrefix(): string {
  const endpoint = (process.env.S3_ENDPOINT ?? '').replace(/\/$/, '');
  return `${endpoint}/${EMPRESA_BUCKET}/`;
}

// Upload da imagem de empresa exibida no card de uma unidade no organograma
// geral (no lugar da foto do(s) gerente(s)) — bucket público da empresa, sem
// nenhuma relação com o bucket (privado, LGPD) de fotos de funcionários.
export async function POST(request: NextRequest) {
  const { error } = await guard(request, { role: 'editor', action: 'write', sameOrigin: true });
  if (error) return error;

  const { data, error: parseError } = await parseUploadedImage(request);
  if (parseError) return parseError;

  const key = `uploads/${randomUUID()}.${data.ext}`;

  try {
    await getS3Client().send(new PutObjectCommand({ Bucket: EMPRESA_BUCKET, Key: key, Body: data.buffer, ContentType: data.contentType }));
    return NextResponse.json({ url: `${empresaPrefix()}${key}` });
  } catch (err) {
    console.error('[upload/unidade-logo] falha ao enviar para o S3:', err);
    return NextResponse.json({ error: 'Falha ao enviar a imagem.' }, { status: 502 });
  }
}

// Remove uma imagem de empresa previamente enviada — chamado ao trocar/remover
// a imagem no admin, para não deixar o objeto antigo órfão no bucket.
export async function DELETE(request: NextRequest) {
  const { error } = await guard(request, { role: 'editor', action: 'write', sameOrigin: true });
  if (error) return error;

  return handleImageDelete(request, { bucket: EMPRESA_BUCKET, prefix: empresaPrefix(), logTag: 'upload/unidade-logo' });
}
