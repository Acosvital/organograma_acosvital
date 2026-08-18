/**
 * Limites/formatos de upload de imagem compartilhados entre o client
 * (ImageUploadField) e as rotas de upload — um único lugar em vez de o mesmo
 * literal (8MB, tipos aceitos, extensão por tipo) repetido em cada arquivo.
 * Sem imports server-only aqui de propósito, para poder ser usado no client.
 */
export const MAX_UPLOAD_SIZE = 8 * 1024 * 1024; // 8MB — sobra pra uma foto já recortada no editor

export const ALLOWED_UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export const EXT_BY_UPLOAD_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
