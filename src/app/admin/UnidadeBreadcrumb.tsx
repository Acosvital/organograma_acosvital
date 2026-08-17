import Link from 'next/link';
import type { Unidade } from '@/types/adminCore';
import styles from './crud.module.css';

interface Props {
  unidade: Unidade | undefined;
}

/** Segmento "› Nome da Unidade ›" do breadcrumb, usado por Cargos/Setores/Funcionários quando a tela está escopada a uma unidade. */
export default function UnidadeBreadcrumb({ unidade }: Props) {
  if (!unidade) return null;
  return (
    <>
      <Link href={`/admin/unidade/${encodeURIComponent(unidade.id)}`}>{unidade.nome_fantasia || 'Unidade'}</Link>
      <span className={styles.breadcrumbSep}>›</span>
    </>
  );
}
