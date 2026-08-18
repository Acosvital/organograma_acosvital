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
// um erro claro de configuração.
//
// A validação só pode rodar na PRIMEIRA CHAMADA REAL (lazy), nunca no
// carregamento do módulo: o estágio de build do Dockerfile roda `next build`
// sem as variáveis de S3 (só são injetadas em runtime pelo docker-compose), e
// o build já importa estas rotas para coletar metadados — um throw no topo do
// módulo derrubaria `docker build` inteiro, não só a funcionalidade de S3.
let _s3: S3Client | null = null;

export function getS3Client(): S3Client {
  if (_s3) return _s3;

  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('S3_ACCESS_KEY / S3_SECRET_KEY não configurados.');
  }

  _s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
  });
  return _s3;
}

export const PESSOAS_BUCKET = 'organograma-prd-pessoas';
export const HISTORIA_BUCKET = 'organograma-prd-historia';
export const EMPRESA_BUCKET = 'organograma-prd-empresa';

// Único formato de chave gerado pelas rotas de upload (uploads/<uuid>.<ext>) —
// usado nos DELETE de upload/pessoas e upload/historia, que só precisam
// aceitar objetos que o próprio app criou (nunca uma foto legada/migrada).
export const UPLOAD_KEY_RE =
  /^uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpe?g|webp)$/i;

export function isValidUploadKey(key: string): boolean {
  return UPLOAD_KEY_RE.test(key);
}

// Chave "segura" para LEITURA em /api/fotos/[...key]: bloqueia path traversal
// (segmentos '..'/'.'/vazios — inclusive os que só aparecem depois de decodificar
// uma barra codificada '%2f' dentro de um único segmento do catch-all) sem
// travar no formato de nome. Diferente de isValidUploadKey: fotos migradas de
// antes deste app (ex. "Diretoria/Fulano.webp", "Gerencia/beltrano.webp") não
// seguem a convenção "uploads/<uuid>.<ext>" e precisam continuar acessíveis.
export function isSafeObjectKey(key: string): boolean {
  if (!key) return false;
  return key.split('/').every(seg => seg.length > 0 && seg !== '.' && seg !== '..');
}
