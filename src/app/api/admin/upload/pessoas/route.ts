import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { guard } from '@/lib/routeGuard';
import { s3, PESSOAS_BUCKET, isValidUploadKey } from '@/lib/s3Client';
import { hasValidImageSignature } from '@/lib/imageSignature';
import { badRequest, parseJsonBody } from '@/lib/validation';

export const dynamic = 'force-dynamic';

const MAX_SIZE = 8 * 1024 * 1024; // 8MB — sobra pra uma foto já recortada no editor
const MAX_REQUEST_BYTES = MAX_SIZE + 65_536; // margem para overhead do multipart
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const EXT_BY_TYPE: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const FOTOS_PREFIX = '/api/fotos/';

// Upload de foto de funcionário — bucket privado (LGPD). Devolve o caminho do
// proxy autenticado /api/fotos, nunca a URL direta do SeaweedFS.
export async function POST(request: NextRequest) {
  const { error } = await guard(request, { role: 'editor', action: 'write', sameOrigin: true });
  if (error) return error;

  const declaredLength = Number(request.headers.get('content-length') ?? '');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: 'Requisição grande demais.' }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest('Não foi possível processar o upload.');
  }

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

  if (!hasValidImageSignature(file.type, buffer)) {
    return NextResponse.json({ error: 'Conteúdo do arquivo não corresponde ao formato declarado.' }, { status: 400 });
  }

  try {
    await s3.send(new PutObjectCommand({ Bucket: PESSOAS_BUCKET, Key: key, Body: buffer, ContentType: file.type }));
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

  const { body, error: bodyError } = await parseJsonBody(request);
  if (bodyError) return bodyError;

  const { url } = (body ?? {}) as { url?: unknown };
  if (typeof url !== 'string' || !url) return badRequest('URL não informada.');
  if (!url.startsWith(FOTOS_PREFIX)) return badRequest('URL inválida.');
  const key = url.slice(FOTOS_PREFIX.length);
  if (!isValidUploadKey(key)) return badRequest('Chave inválida.');

  try {
    await s3.send(new DeleteObjectCommand({ Bucket: PESSOAS_BUCKET, Key: key }));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[upload/pessoas] falha ao excluir do S3:', err);
    return NextResponse.json({ error: 'Falha ao excluir a imagem.' }, { status: 502 });
  }
}
