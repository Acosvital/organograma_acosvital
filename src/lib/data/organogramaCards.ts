import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client, EMPRESA_BUCKET } from '@/lib/s3Client';

/**
 * Aparência de cada unidade no card do organograma geral — imagem de empresa
 * (no lugar da(s) foto(s) do(s) gerente(s)) e cor do card. O nome do(s)
 * gerente(s) continua aparecendo embaixo do card normalmente em ambos os
 * casos. Não existe campo equivalente na API externa da Açosvital (nem seria
 * o lugar certo — a Unidade em si não tem "foto"/"cor"), então persiste como
 * um JSON pequeno no bucket público da empresa, reaproveitando o
 * S3/SeaweedFS já usado pelas outras imagens deste app.
 */
const CONFIG_KEY = 'config/organograma-cards.json';

export interface OrganogramaCardConfig {
  /** URL pública da imagem de empresa, ou null para mostrar a foto do(s) gerente(s). */
  imageUrl: string | null;
  /** Cor do card no organograma geral, ou null para usar a cor padrão do nível. */
  color: string | null;
}

export type OrganogramaCardConfigs = Record<string, OrganogramaCardConfig>;

const EMPTY_CONFIG: OrganogramaCardConfig = { imageUrl: null, color: null };

// Formato antigo (antes de existir a cor por empresa) guardava só a URL da
// imagem como string — mantém essas entradas legíveis em vez de perdê-las.
function normalizeEntry(raw: unknown): OrganogramaCardConfig {
  if (typeof raw === 'string') return { imageUrl: raw || null, color: null };
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    return {
      imageUrl: typeof obj.imageUrl === 'string' ? obj.imageUrl : null,
      color: typeof obj.color === 'string' ? obj.color : null,
    };
  }
  return EMPTY_CONFIG;
}

async function readCardConfigs(): Promise<OrganogramaCardConfigs> {
  try {
    const obj = await getS3Client().send(new GetObjectCommand({ Bucket: EMPRESA_BUCKET, Key: CONFIG_KEY }));
    const text = await obj.Body?.transformToString();
    if (!text) return {};
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: OrganogramaCardConfigs = {};
    for (const [id, raw] of Object.entries(parsed as Record<string, unknown>)) {
      out[id] = normalizeEntry(raw);
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

export async function getOrganogramaCardConfigs(): Promise<OrganogramaCardConfigs> {
  return readCardConfigs();
}

/**
 * Atualiza um dos campos (imagem/cor) de uma unidade, preservando o outro.
 * Leitura-modificação-escrita, sem lock — aceitável aqui: só admins editam
 * unidades, uma de cada vez, e o pior caso de uma corrida rara é perder a
 * atualização mais recente, não corromper dados.
 */
export async function setUnidadeCardConfig(
  unidadeId: string,
  patch: Partial<OrganogramaCardConfig>,
): Promise<void> {
  const current = await readCardConfigs();
  const merged: OrganogramaCardConfig = { ...(current[unidadeId] ?? EMPTY_CONFIG), ...patch };
  const next = { ...current };
  // Remove a entrada por completo quando os dois campos ficam vazios, pra não
  // acumular lixo no JSON.
  if (!merged.imageUrl && !merged.color) delete next[unidadeId];
  else next[unidadeId] = merged;

  await getS3Client().send(new PutObjectCommand({
    Bucket: EMPRESA_BUCKET,
    Key: CONFIG_KEY,
    Body: JSON.stringify(next),
    ContentType: 'application/json',
  }));
}
