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
   *  unidade). Só a Diretoria (nível 0) não tem — é papel global; Gerência
   *  Geral e demais pessoas são filtradas pela unidade de cada uma. */
  unidadeId?: string | null;
  /** true para o diretor "original" (nível 0 já correto na view externa).
   *  Um co-diretor com o mesmo cargo "Diretoria" cai errado em nível 4 no
   *  backend — corrigimos o nível aqui, mas usamos esta flag para saber quem
   *  é o principal (foto padrão do card mesclado) e quem é o co-diretor. */
  isPrimaryDirector?: boolean;
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
