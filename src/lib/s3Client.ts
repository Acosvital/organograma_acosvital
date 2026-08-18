import { S3Client } from '@aws-sdk/client-s3';

/**
 * Cliente S3 para o SeaweedFS interno. Bucket de pessoas é privado (nunca
 * exposto publicamente por LGPD) — servido só via /api/fotos, que exige
 * autenticação antes de repassar os bytes. Empresa/história são públicos.
 *
 * requestChecksumCalculation 'WHEN_REQUIRED': o SDK da AWS por padrão anexa um
 * checksum (CRC32) em todo PutObject; o SeaweedFS não valida esse checksum
 * corretamente e responde 500 genérico — desligar isso é obrigatório aqui.
 */
// Passar um objeto `credentials` explícito para o S3Client já desliga a cadeia
// de credenciais padrão do SDK (env/shared config/IMDS) — se essas variáveis
// vierem vazias, toda chamada falha de autenticação silenciosamente em vez de
// um erro claro de configuração. Falha alto e cedo, no carregamento do módulo.
const accessKeyId = process.env.S3_ACCESS_KEY;
const secretAccessKey = process.env.S3_SECRET_KEY;
if (!accessKeyId || !secretAccessKey) {
  throw new Error('S3_ACCESS_KEY / S3_SECRET_KEY não configurados.');
}

export const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: 'us-east-1',
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
  requestChecksumCalculation: 'WHEN_REQUIRED',
});

export const PESSOAS_BUCKET = 'organograma-prd-pessoas';
export const HISTORIA_BUCKET = 'organograma-prd-historia';
export const EMPRESA_BUCKET = 'organograma-prd-empresa';

// Único formato de chave gerado pelas rotas de upload (uploads/<uuid>.<ext>) —
// /api/fotos/[...key] e os DELETE de upload/pessoas e upload/historia usam
// isto para rejeitar qualquer chave fora desse formato (defesa contra path
// traversal via segmentos '..' ou barras codificadas no catch-all da rota).
export const UPLOAD_KEY_RE =
  /^uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpe?g|webp)$/i;

export function isValidUploadKey(key: string): boolean {
  return UPLOAD_KEY_RE.test(key);
}
