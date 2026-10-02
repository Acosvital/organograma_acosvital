export interface Cargo {
  id: string;
  nome: string;
  nvl_permissao: number;
  descricao: string;
  ativo: boolean;
  /** Vincula o cargo a uma unidade — sempre igual a Unidade.id. */
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
  /** Vincula o setor a uma unidade — sempre igual a Unidade.id. */
  codigo_empresa: string | null;
  id_origem: string | null;
  created_at: string;
  updated_at: string;
}

export interface Unidade {
  id: string;
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
  /** Cor do card desta unidade no organograma geral, hex #RRGGBB. NULL = cor padrão do nível. */
  cor_unidade: string | null;
  /** Key do objeto no bucket "empresa" do S3, ou já uma URL completa — ver resolveFotoUrl() em lib/data/unidades.ts. NULL = sem imagem cadastrada. */
  foto_url: string | null;
  id_origem: string | null;
  created_at: string;
  updated_at: string;
}

export interface Funcionario {
  id: string;
  nome_completo: string;
  id_cargo: string;
  id_setor: string;
  /** Vincula o funcionário a uma unidade — sempre igual a Unidade.id. */
  codigo_empresa: string;
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
