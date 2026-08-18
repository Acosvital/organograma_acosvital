import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { guard } from '@/lib/routeGuard';
import { s3, PESSOAS_BUCKET } from '@/lib/s3Client';

export const dynamic = 'force-dynamic';

const MAX_SIZE = 8 * 1024 * 1024; // 8MB — sobra pra uma foto já recortada no editor
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const EXT_BY_TYPE: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

// Upload de foto de funcionário — bucket privado (LGPD). Devolve o caminho do
// proxy autenticado /api/fotos, nunca a URL direta do SeaweedFS.
export async function POST(request: NextRequest) {
  const { error } = await guard(request, { role: 'editor', action: 'write', sameOrigin: true });
  if (error) return error;

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Arquivo não enviado.' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'Formato de imagem não suportado. Use PNG, JPEG ou WEBP.' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Imagem muito grande (máx. 8MB).' }, { status: 400 });
  }

  const ext = EXT_BY_TYPE[file.type];
  const key = `uploads/${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    await s3.send(new PutObjectCommand({ Bucket: PESSOAS_BUCKET, Key: key, Body: buffer, ContentType: file.type }));
    return NextResponse.json({ url: `/api/fotos/${key}` });
  } catch {
    return NextResponse.json({ error: 'Falha ao enviar a imagem.' }, { status: 502 });
  }
}
