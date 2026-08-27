import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAuth } from '@/lib/apiAuth';
import { LOGO_URL } from '@/lib/constants';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Bem-vindo — Açosvital',
};

export const dynamic = 'force-dynamic';

export default async function BemVindoPage() {
  await requireAuth('viewer');

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logos}>
          <span className={styles.logoChip}>
            <img src={LOGO_URL} alt="Açosvital" className={styles.logo} />
          </span>
          <span className={styles.logosDivider} aria-hidden="true" />
          <span className={styles.logoChip}>
            <img
              src="https://assets.bradesco/content/dam/portal-bradesco/marca/assets/img/Bradesco-white.png"
              alt="Bradesco"
              className={styles.partnerLogo}
            />
          </span>
        </div>
        <p className={styles.eyebrow}>Visita especial</p>
        <h1 className={styles.title}>Bem-vindo, Bradesco.</h1>
        <p className={styles.sub}>É um prazer recebê-los na nossa empresa.</p>
        <Link href="/" className={styles.btn}>
          Ver organograma
          <span className={styles.btnArrow} aria-hidden="true">→</span>
        </Link>
      </div>
    </div>
  );
}
