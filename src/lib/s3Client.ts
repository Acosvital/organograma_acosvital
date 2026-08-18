import { S3Client } from '@aws-sdk/client-s3';

/**
 * Cliente S3 para o SeaweedFS interno (fotos de funcionários — bucket privado,
 * nunca exposto publicamente por LGPD). Servido apenas via /api/fotos, que exige
 * autenticação antes de repassar os bytes.
 */
export const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? '',
    secretAccessKey: process.env.S3_SECRET_KEY ?? '',
  },
});

export const PESSOAS_BUCKET = 'organograma-prd-pessoas';
