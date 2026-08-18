import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client, EMPRESA_BUCKET } from '@/lib/s3Client';

/**
 * Imagem de empresa por unidade, mostrada no card do organograma geral no
 * lugar da(s) foto(s) do(s) gerente(s) — o nome do(s) gerente(s) continua
 * aparecendo embaixo do card normalmente, só a foto pessoal é substituída.
 * Não existe campo equivalente na API externa da Açosvital (nem seria o
 * lugar certo — a Unidade em si não tem "foto"), então persiste como um
 * mapa unidadeId → URL num JSON pequeno no bucket público da empresa,
 * reaproveitando o S3/SeaweedFS já usado pelas outras imagens deste app.
 */
const CONFIG_KEY = 'config/organograma-cards.json';

export type OrganogramaCardImages = Record<string, string>;

async function readCardImages(): Promise<OrganogramaCardImages> {
  try {
    const obj = await getS3Client().send(new GetObjectCommand({ Bucket: EMPRESA_BUCKET, Key: CONFIG_KEY }));
    const text = await obj.Body?.transformToString();
    if (!text) return {};
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: OrganogramaCardImages = {};
    for (const [id, url] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof url === 'string' && url) out[id] = url;
    }
    return out;
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name !== 'NoSuchKey' && name !== 'NotFound') {
      console.error('[organogramaCards] falha ao ler configuração do S3:', err);
    }
    return {};
  }
}

export async function getOrganogramaCardImages(): Promise<OrganogramaCardImages> {
  return readCardImages();
}

/**
 * Lê o mapa atual, aplica a mudança e regrava por inteiro (leitura-modificação-
 * escrita, sem lock) — aceitável aqui: só admins editam unidades, uma de cada
 * vez, e o pior caso de uma corrida rara é perder a atualização mais recente,
 * não corromper dados.
 */
export async function setUnidadeCardImage(unidadeId: string, imageUrl: string | null): Promise<void> {
  const current = await readCardImages();
  const next = { ...current };
  if (imageUrl) next[unidadeId] = imageUrl;
  else delete next[unidadeId];

  await getS3Client().send(new PutObjectCommand({
    Bucket: EMPRESA_BUCKET,
    Key: CONFIG_KEY,
    Body: JSON.stringify(next),
    ContentType: 'application/json',
  }));
}
