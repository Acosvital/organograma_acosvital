/**
 * IDs determinísticos para <radialGradient>/<clipPath> compartilhados no
 * organograma. Antes cada NodeCard/SectorCard criava seu próprio <defs> (um
 * gradiente por nó — 250+ definições na DOM para uma árvore grande); como
 * cor e raio vêm de um conjunto pequeno e fixo de valores (por nível/cargo),
 * um único elemento compartilhado por cor/raio serve a todos os nós que o usam.
 */

export function colorGradientId(color: string): string {
  return `grad-c-${color.replace(/[^a-zA-Z0-9]/g, '')}`;
}

export function radiusClipId(r: number): string {
  return `clip-r-${Math.round(r)}`;
}
