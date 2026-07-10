import type { Metadata } from 'next';
import Link from 'next/link';
import { IcoUsers, IcoBriefcase, IcoLayers, IcoBuilding, IcoGlobe, IcoBook, IcoArrowRight } from './_icons';
import styles from './hub.module.css';

export const metadata: Metadata = {
  title: 'Painel — Açosvital',
};

const CARDS = [
  {
    href:       '/admin/funcionarios',
    icon:       <IcoUsers size={28} />,
    title:      'Funcionários',
    desc:       'Cadastrar funcionários — gera automaticamente o nó no organograma',
    colorStyle: styles.cardBlue,
  },
  {
    href:       '/admin/cargos',
    icon:       <IcoBriefcase size={28} />,
    title:      'Cargos',
    desc:       'Gerenciar cargos e seus níveis hierárquicos',
    colorStyle: styles.cardPurple,
  },
  {
    href:       '/admin/setores',
    icon:       <IcoLayers size={24} />,
    title:      'Setores',
    desc:       'Criar e organizar setores e sub-setores da empresa',
    colorStyle: styles.cardOrange,
  },
  {
    href:       '/admin/unidades/cadastro',
    icon:       <IcoBuilding size={24} />,
    title:      'Unidades',
    desc:       'Cadastrar matrizes e filiais da empresa',
    colorStyle: styles.cardGreen,
  },
  {
    href:       '/admin/clientes',
    icon:       <IcoGlobe size={24} />,
    title:      'Clientes',
    desc:       'Visualizar e buscar clientes integrados via Omie',
    colorStyle: styles.cardRed,
  },
  {
    href:       '/admin/historia',
    icon:       <IcoBook size={24} />,
    title:      'História da Empresa',
    desc:       'Editar texto, imagens e vídeo da página institucional',
    colorStyle: styles.cardPink,
  },
] as const;

export default function AdminHubPage() {
  return (
    <div className={styles.page}>
      <div className={styles.contentWrap}>
        <p className={styles.prompt}>O que você deseja gerenciar?</p>
        <div className={styles.grid}>
          {CARDS.map(card => (
            <Link
              key={card.href}
              href={card.href}
              className={`${styles.card} ${card.colorStyle}`}
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
