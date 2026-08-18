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
export const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? '',
    secretAccessKey: process.env.S3_SECRET_KEY ?? '',
  },
  requestChecksumCalculation: 'WHEN_REQUIRED',
});

export const PESSOAS_BUCKET = 'organograma-prd-pessoas';
export const HISTORIA_BUCKET = 'organograma-prd-historia';
export const EMPRESA_BUCKET = 'organograma-prd-empresa';
