import { NextResponse } from 'next/server';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client, isValidUploadKey } from './s3Client';
import { badRequest, parseJsonBody } from './validation';
import { hasValidImageSignature } from './imageSignature';
import { MAX_UPLOAD_SIZE, ALLOWED_UPLOAD_TYPES, EXT_BY_UPLOAD_TYPE } from './uploadLimits';

const ALLOWED_TYPES = new Set<string>(ALLOWED_UPLOAD_TYPES);
const MAX_REQUEST_BYTES = MAX_UPLOAD_SIZE + 65_536; // margem para overhead do multipart

export interface ParsedUpload {
  ext: string;
  buffer: Buffer;
  contentType: string;
}

/**
 * Lê, valida (Content-Length, presença, tipo, tamanho e magic bytes reais) e
 * decodifica o arquivo de um POST multipart de upload de imagem. Compartilhado
 * entre /api/admin/upload/historia e /api/admin/upload/pessoas — o único ponto
 * onde as duas rotas diferem é o bucket/URL de destino.
 */
export async function parseUploadedImage(
  request: Request,
): Promise<{ data: ParsedUpload; error: null } | { data: null; error: NextResponse }> {
  const declaredLength = Number(request.headers.get('content-length') ?? '');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return { data: null, error: NextResponse.json({ error: 'Requisição grande demais.' }, { status: 413 }) };
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return { data: null, error: badRequest('Não foi possível processar o upload.') };
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return { data: null, error: NextResponse.json({ error: 'Arquivo não enviado.' }, { status: 400 }) };
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return {
      data: null,
      error: NextResponse.json({ error: 'Formato de imagem não suportado. Use PNG, JPEG ou WEBP.' }, { status: 400 }),
    };
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    return { data: null, error: NextResponse.json({ error: 'Imagem muito grande (máx. 8MB).' }, { status: 400 }) };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!hasValidImageSignature(file.type, buffer)) {
    return {
      data: null,
      error: NextResponse.json({ error: 'Conteúdo do arquivo não corresponde ao formato declarado.' }, { status: 400 }),
    };
  }

  return { data: { ext: EXT_BY_UPLOAD_TYPE[file.type], buffer, contentType: file.type }, error: null };
}

/**
 * Remove um objeto previamente enviado a partir da URL devolvida no upload —
 * compartilhado entre os DELETE de /api/admin/upload/historia e .../pessoas.
 * `prefix` é a parte fixa da URL (endpoint+bucket ou o proxy /api/fotos/) que
 * identifica de qual bucket a chave deve ser removida.
 */
export async function handleImageDelete(
  request: Request,
  opts: { bucket: string; prefix: string; logTag: string },
): Promise<NextResponse> {
  const { body, error: bodyError } = await parseJsonBody(request);
  if (bodyError) return bodyError;

  const { url } = (body ?? {}) as { url?: unknown };
  if (typeof url !== 'string' || !url) return badRequest('URL não informada.');
  if (!url.startsWith(opts.prefix)) return badRequest('URL inválida.');
  const key = url.slice(opts.prefix.length);
  if (!isValidUploadKey(key)) return badRequest('Chave inválida.');

  try {
    await getS3Client().send(new DeleteObjectCommand({ Bucket: opts.bucket, Key: key }));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[${opts.logTag}] falha ao excluir do S3:`, err);
    return NextResponse.json({ error: 'Falha ao excluir a imagem.' }, { status: 502 });
  }
}
