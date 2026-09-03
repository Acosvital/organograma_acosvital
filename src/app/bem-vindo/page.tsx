import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireAuth } from '@/lib/apiAuth';
import { LOGO_URL } from '@/lib/constants';
import { getWelcomeSettings } from '@/lib/data/welcomeSettings';
import { getWelcomePresetsList } from '@/lib/data/welcomePresets';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Bem-vindo — Açosvital',
};

export const dynamic = 'force-dynamic';

export default async function BemVindoPage() {
  const auth = await requireAuth();
  if (auth.err?.status === 401) {
    redirect('/login?next=%2Fbem-vindo');
  }

  const settings = await getWelcomeSettings().catch(() => ({ enabled: true, activePresetId: null }));
  if (!settings.enabled) redirect('/');

  const preset = settings.activePresetId
    ? (await getWelcomePresetsList().catch(() => []))
        .find(p => p.id === settings.activePresetId) ?? null
    : null;

  const pageStyle = preset?.corInicio && preset?.corFim
    ? { background: `linear-gradient(135deg, ${preset.corInicio} 0%, ${preset.corFim} 100%)` }
    : undefined;

  return (
    <div className={styles.page} style={pageStyle}>
      <div className={styles.card}>
        <div className={styles.logos}>
          <span className={styles.logoChip}>
            <img src={LOGO_URL} alt="Açosvital" className={styles.logo} />
          </span>
          {preset?.logoUrl && (
            <>
              <span className={styles.logosDivider} aria-hidden="true" />
              <span className={styles.logoChip}>
                <img src={preset.logoUrl} alt={preset.nomeCliente} className={styles.partnerLogo} />
              </span>
            </>
          )}
        </div>
        {preset && <p className={styles.eyebrow}>Visita especial</p>}
        <h1 className={styles.title}>
          {preset ? `Bem-vindo, ${preset.nomeCliente}.` : 'Bem-vindo.'}
        </h1>
        <p className={styles.sub}>É um prazer recebê-los na nossa empresa.</p>
        <Link href="/" className={styles.btn}>
          Ver organograma
          <span className={styles.btnArrow} aria-hidden="true">→</span>
        </Link>
      </div>
    </div>
  );
}
