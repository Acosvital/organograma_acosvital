import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getUnidadesList, matchesUnidade, getUnidadeCodigo } from '@/lib/data/unidades';
import { IcoUsers, IcoBriefcase, IcoLayers, IcoArrowRight } from '../../_icons';
import styles from '../../hub.module.css';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ codigo: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { codigo } = await params;
  const codigoEmpresa = decodeURIComponent(codigo);
  const unidades = await getUnidadesList().catch(() => []);
  const unidade = unidades.find(u => matchesUnidade(codigoEmpresa, u));
  return { title: `${unidade?.nome_fantasia || codigoEmpresa} — Açosvital` };
}

export default async function AdminUnidadePage({ params }: Props) {
  const { codigo } = await params;
  const codigoEmpresa = decodeURIComponent(codigo);

  const unidades = await getUnidadesList().catch(() => []);
  const unidade = unidades.find(u => matchesUnidade(codigoEmpresa, u));
  if (!unidade) notFound();

  const base = `/admin/unidade/${encodeURIComponent(getUnidadeCodigo(unidade))}`;

  const CARDS = [
    {
      href:  `${base}/funcionarios`,
      icon:  <IcoUsers size={28} />,
      title: 'Funcionários',
      desc:  'Cadastrar funcionários desta unidade — gera automaticamente o nó no organograma',
      colorStyle: styles.cardBlue,
    },
    {
      href:  `${base}/cargos`,
      icon:  <IcoBriefcase size={28} />,
      title: 'Cargos',
      desc:  'Gerenciar cargos e seus níveis hierárquicos nesta unidade',
      colorStyle: styles.cardPurple,
    },
    {
      href:  `${base}/setores`,
      icon:  <IcoLayers size={24} />,
      title: 'Setores',
      desc:  'Criar e organizar setores e sub-setores desta unidade',
      colorStyle: styles.cardOrange,
    },
  ] as const;

  return (
    <div className={styles.page}>
      <div className={styles.contentWrap}>
        <p className={styles.prompt}>
          <Link href="/admin" style={{ color: 'inherit' }}>Administrar</Link> › {unidade.nome_fantasia}
        </p>
        <div className={styles.grid} style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
          {CARDS.map(card => (
            <Link
              key={card.href}
              href={card.href}
              className={`${styles.card} ${card.colorStyle}`}
              style={{ gridColumn: 'span 2' }}
            >
              <div className={styles.cardIcon}>{card.icon}</div>
              <p className={styles.cardTitle}>{card.title}</p>
              <p className={styles.cardDesc}>{card.desc}</p>
              <span className={styles.cardArrow}><IcoArrowRight size={16} /></span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
