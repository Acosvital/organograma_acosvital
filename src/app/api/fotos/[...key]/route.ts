import { NextRequest, NextResponse } from 'next/server';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { guard } from '@/lib/routeGuard';
import { getS3Client, PESSOAS_BUCKET, isValidUploadKey } from '@/lib/s3Client';

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

  // Só o formato exato gerado pelo upload é aceito — barra a tentativa de path
  // traversal (ex.: segmentos '..' vindos de barras codificadas no catch-all)
  // sem depender de normalização de URL, que não cobre esse caso.
  if (!isValidUploadKey(objectKey)) {
    return NextResponse.json({ error: 'Foto não encontrada.' }, { status: 404 });
  }

  try {
    const obj = await getS3Client().send(new GetObjectCommand({ Bucket: PESSOAS_BUCKET, Key: objectKey }));
    const body = obj.Body?.transformToWebStream();
    if (!body) return NextResponse.json({ error: 'Foto não encontrada.' }, { status: 404 });

    return new NextResponse(body, {
      headers: {
        'Content-Type': obj.ContentType ?? 'application/octet-stream',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err) {
    // O nome do erro ('NoSuchKey'/'NotFound') é a convenção da AWS — o
    // SeaweedFS pode não replicá-la exatamente, então também aceita o status
    // HTTP 404 devolvido pelo gateway como sinal de "objeto não existe",
    // independente do nome que o SDK deu ao erro.
    const name = (err as { name?: string })?.name;
    const httpStatus = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    if (name === 'NoSuchKey' || name === 'NotFound' || httpStatus === 404) {
      return NextResponse.json({ error: 'Foto não encontrada.' }, { status: 404 });
    }
    console.error('[fotos] falha ao buscar objeto do S3:', err);
    return NextResponse.json({ error: 'Erro ao buscar a foto.' }, { status: 502 });
  }
}
