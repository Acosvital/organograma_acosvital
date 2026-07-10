export interface OrgNode {
  id: string;
  name: string;
  role: string;
  department?: string;
  level: number;
  parentId: string | null;
  photoUrl?: string;
  isSector?: boolean;
  sectorColor?: string;
  funcionarioId?: string | null;
  sectorDirectorOf?: string | null;
  /** Unidade do funcionário (só presente quando o organograma foi filtrado por
   *  unidade). Diretoria/Gerência Geral não têm — são papéis globais. */
  unidadeId?: string | null;
}

export interface PositionedNode extends OrgNode {
  x: number;
  y: number;
  angle: number;
  radius: number; // visual radius (pre-computed at layout time)
}

export interface Connection {
  fromId: string;
  toId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  level: number;
}
