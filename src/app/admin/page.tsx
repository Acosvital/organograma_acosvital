import type { Metadata } from 'next';
import Link from 'next/link';
import { getUnidadesList } from '@/lib/data/unidades';
import { IcoBuilding, IcoGlobe, IcoBook, IcoArrowRight } from './_icons';
import styles from '../UnidadeSelectorView.module.css';
import hubStyles from './hub.module.css';

export const metadata: Metadata = { title: 'Administrar — Açosvital' };
export const dynamic = 'force-dynamic';

const SECONDARY_LINKS = [
  { href: '/admin/unidades/cadastro', icon: <IcoBuilding size={20} />, label: 'Gerenciar unidades' },
  { href: '/admin/clientes',          icon: <IcoGlobe size={20} />,    label: 'Clientes' },
  { href: '/admin/historia',          icon: <IcoBook size={20} />,     label: 'Nossa História' },
] as const;

export default async function AdminPage() {
  let unidades: Awaited<ReturnType<typeof getUnidadesList>> = [];
  let error = false;
  try {
    unidades = await getUnidadesList();
  } catch {
    error = true;
  }

  return (
    <div className={styles.page}>
      <div className={styles.contentWrap}>
        <p className={styles.prompt}>Administrar — selecione uma unidade</p>

        {error && unidades.length === 0 && (
          <p className={styles.status}>Não foi possível carregar as unidades.</p>
        )}
        {!error && unidades.length === 0 && (
          <p className={styles.status}>Nenhuma unidade cadastrada ainda.</p>
        )}

        <div className={styles.grid}>
          {unidades.map(u => {
            const disponivel = !!u.codigo_empresa;
            const card = (
              <>
                <div className={styles.cardIcon}><IcoBuilding size={24} /></div>
                <p className={styles.cardTitle}>{u.nome_fantasia}</p>
                <div className={styles.cardMeta}>
                  <span className={styles.badge}>{u.tipo_unidade === 'matriz' ? 'Matriz' : 'Filial'}</span>
                  {(u.cidade || u.estado) && (
                    <span className={styles.cardLocation}>
                      {[u.cidade, u.estado].filter(Boolean).join(' / ')}
                    </span>
                  )}
                </div>
                {disponivel
                  ? <span className={styles.cardArrow}><IcoArrowRight size={16} /></span>
                  : <span className={styles.cardLocation}>Aguardando sincronização</span>}
              </>
            );
            return disponivel ? (
              <Link key={u.id} href={`/admin/unidade/${encodeURIComponent(u.codigo_empresa!)}`} className={styles.card}>
                {card}
              </Link>
            ) : (
              <div key={u.id} className={styles.card} style={{ opacity: 0.55, cursor: 'not-allowed' }}>
                {card}
              </div>
            );
          })}
        </div>

        <div className={hubStyles.grid} style={{ marginTop: 8 }}>
          {SECONDARY_LINKS.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={hubStyles.card}
              style={{ gridColumn: 'span 2', padding: '18px 20px' }}
            >
              <div className={hubStyles.cardIcon} style={{ width: 36, height: 36 }}>{link.icon}</div>
              <p className={hubStyles.cardTitle} style={{ fontSize: 15 }}>{link.label}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
