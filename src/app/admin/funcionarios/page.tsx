import type { Metadata } from 'next';
import { getFuncionariosEnriched } from '@/lib/data/adminFuncionarios';
import { getCargosList } from '@/lib/data/adminCargos';
import { getSetoresList } from '@/lib/data/adminSetores';
import { getUnidadesList } from '@/lib/data/unidades';
import type { Funcionario, Cargo, Setor, Unidade } from '@/types/adminCore';
import FuncionariosAdmin from './FuncionariosAdmin';

export const metadata: Metadata = { title: 'Funcionários — Açosvital' };
export const dynamic = 'force-dynamic';

export default async function AdminFuncionariosPage() {
  const [funcionarios, cargos, setores, unidades] = await Promise.allSettled([
    getFuncionariosEnriched(),
    getCargosList(),
    getSetoresList(),
    getUnidadesList(),
  ]);

  return (
    <FuncionariosAdmin
      initialFuncionarios={funcionarios.status === 'fulfilled' ? funcionarios.value as unknown as Funcionario[] : []}
      initialCargos={cargos.status === 'fulfilled' ? cargos.value as Cargo[] : []}
      initialSetores={setores.status === 'fulfilled' ? setores.value as Setor[] : []}
      initialUnidades={unidades.status === 'fulfilled' ? unidades.value as Unidade[] : []}
    />
  );
}
