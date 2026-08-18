export interface GlobePoint {
  id: number;
  lat: number;
  lon: number;
  label: string;
  /** Tema "hub" (Unidades): true para a matriz — rótulo tem prioridade e nunca perde
   *  a reserva de espaço para uma filial próxima na tela. */
  isMatriz?: boolean;
  /** Tema "hub": id (hash) da unidade matriz desta filial — usado para desenhar a
   *  linha matriz→filial. null/undefined quando não há relação (matriz, ou dado sem
   *  tema "hub", ex. Clientes). */
  matrizId?: number | null;
}

export interface Star {
  x: number;
  y: number;
  r: number;
  b: number;
  spd: number;
  c: number; // 0=blue-white, 0.5=white, 1=warm-yellow
}
