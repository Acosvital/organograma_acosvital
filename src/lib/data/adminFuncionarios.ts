import { fetchAllPages } from '@/lib/apiClient';

interface FuncRaw {
  id:             string;
  id_cargo:       string;
  id_setor:       string;
  codigo_empresa: string;
  [key: string]: unknown;
}
interface CargoRaw { id: string; nome: string; nvl_permissao: number; }
interface SetorRaw { id: string; nome: string; }
interface UnidRaw  { id: string; nome_fantasia: string; }

export async function getFuncionariosEnriched(): Promise<Record<string, unknown>[]> {
  const [funcionarios, cargos, setores, unidades] = await Promise.all([
    fetchAllPages<FuncRaw>('/funcionarios', 'funcionarios'),
    fetchAllPages<CargoRaw>('/cargos',       'cargos'),
    fetchAllPages<SetorRaw>('/setores',      'setores'),
    fetchAllPages<UnidRaw>('/unidades',      'unidades'),
  ]);

  const cargoMap   = new Map(cargos.map(c => [c.id, c]));
  const setorMap   = new Map(setores.map(s => [s.id, s]));
  const unidadeMap = new Map(unidades.map(u => [u.id, u]));

  return funcionarios.map(f => ({
    ...f,
    cargo_nome:   cargoMap.get(f.id_cargo)?.nome              ?? null,
    cargo_nvl:    cargoMap.get(f.id_cargo)?.nvl_permissao     ?? null,
    setor_nome:   setorMap.get(f.id_setor)?.nome              ?? null,
    unidade_nome: unidadeMap.get(f.codigo_empresa)?.nome_fantasia ?? null,
  }));
}
