/**
 * Confere os magic bytes reais do arquivo contra o Content-Type declarado pelo
 * cliente — o Content-Type de um multipart é escolhido livremente por quem
 * envia a requisição, então validar só a string não impede um payload
 * arbitrário disfarçado de imagem.
 */
const SIGNATURES: Record<string, (b: Uint8Array) => boolean> = {
  'image/png': (b) =>
    b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  'image/jpeg': (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/webp': (b) =>
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // "RIFF"
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,  // "WEBP"
};

export function hasValidImageSignature(declaredType: string, bytes: Buffer | Uint8Array): boolean {
  const check = SIGNATURES[declaredType];
  return check ? check(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)) : false;
}
