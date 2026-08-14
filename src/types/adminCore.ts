export interface Cargo {
  id: string;
  nome: string;
  nvl_permissao: number;
  descricao: string;
  ativo: boolean;
  /** Código da unidade/empresa (Unidade.codigo_empresa) a que este cargo pertence. */
  codigo_empresa: string | null;
  id_origem: string | null;
  created_at: string;
  updated_at: string;
}

export interface Setor {
  id: string;
  codigo_setor: string | null;
  nome: string;
  descricao: string;
  ativo: boolean;
  parent_id: string | null;
  nivel: number | null;
  sigla: string | null;
  cor_setor: string | null;
  /** Vincula o setor a uma unidade — compara com Unidade.codigo_empresa. */
  id_unidades: string | null;
  id_origem: string | null;
  created_at: string;
  updated_at: string;
}

export interface Unidade {
  id: string;
  /** Código de empresa retornado pela API externa — usado para vincular Cargos e Setores a esta unidade. */
  codigo_empresa: string | null;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  tipo_unidade: 'matriz' | 'filial';
  matriz_id: string | null;
  nome_contato: string;
  email: string;
  telefone: string | null;
  celular: string | null;
  homepage: string | null;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
  /** Posição de exibição na fileira de unidades do organograma geral (menor primeiro). */
  ordem_exibicao: number | null;
  id_origem: string | null;
  created_at: string;
  updated_at: string;
}

export interface Funcionario {
  id: string;
  nome_completo: string;
  id_cargo: string;
  id_setor: string;
  id_unidade: string;
  cpf: string | null;
  rg: string | null;
  cnpj: string | null;
  contrato_tipo: 'CLT' | 'PJ' | 'Freelancer' | null;
  jornada_trabalho: 'Integral' | 'Meio Período' | 'Flexível' | null;
  data_nascimento: string | null;
  data_admissao: string | null;
  data_desligamento: string | null;
  telefone: string | null;
  celular: string | null;
  homepage: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
  // enriquecido (via join na listagem)
  cargo_nome?: string;
  cargo_nvl?: number;
  setor_nome?: string;
  unidade_nome?: string;
}

export interface OrgNodeOption {
  id: string;
  name: string;
  role: string;
  level: number;
}

export const NVL_LABELS: Record<number, string> = {
  0:  'Diretoria',
  1:  'Gerência Geral',
  4:  'Diretor de Setor',
  5:  'Gerente',
  6:  'Coordenador',
  7:  'Supervisor',
  8:  'Líder de Equipe',
  9:  'Analista',
  10: 'Assistente / Auxiliar',
  11: 'Auxiliar / Estagiário',
  12: 'Aprendiz',
};

/** Níveis válidos para Cargos (2 e 3 são reservados para setores; API aceita 0–12) */
export const CARGO_LEVELS = [0, 1, 4, 5, 6, 7, 8, 9, 10, 11, 12];
