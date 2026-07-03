'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useCallback, useEffect } from 'react';
import { signOut } from '@/app/login/actions';
import { LOGO_URL } from '@/lib/constants';
import ThemeToggle from '@/components/ui/ThemeToggle';
import styles from './Sidebar.module.css';

const ICON_LOGO_URL =
  'https://iaczridaljcdtnthoece.supabase.co/storage/v1/object/public/public-assets/geral/logo/logo_icone_apenas.png';

// ── Ícones ────────────────────────────────────────────────────────────────
function IconOrg() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="1" width="8" height="6" rx="1.5"/>
      <rect x="1" y="17" width="7" height="6" rx="1.5"/>
      <rect x="16" y="17" width="7" height="6" rx="1.5"/>
      <path d="M12 7v4.5M12 11.5H4.5v4M12 11.5H19.5v4"/>
    </svg>
  );
}
function IconBuilding() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18"/><path d="M2 22h20"/>
      <path d="M10 7h4M10 11h4M10 15h4"/>
    </svg>
  );
}
function IconUsers() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}
function IconSettings() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}
function IconLogout() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  );
}
function IconFullscreen({ exit }: { exit: boolean }) {
  return exit ? (
    <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
      <path d="M5 1H2v3M10 1h3v3M13 10v3h-3M5 14H2v-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
      <path d="M1 5V1h4M10 1h4v4M14 10v4h-4M5 14H1v-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function IconTv() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2"/>
      <path d="M8 3l4 4 4-4"/>
      <line x1="9" y1="21" x2="15" y2="21"/>
      <line x1="12" y1="18" x2="12" y2="21"/>
    </svg>
  );
}
function IconChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: 'transform 280ms', transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)' }}
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}


// ── Rotas ────────────────────────────────────────────────────────────────
const NAV = [
  { href: '/',         label: 'Organograma', Icon: IconOrg      },
  { href: '/unidades', label: 'Unidades',    Icon: IconBuilding },
  { href: '/clientes', label: 'Clientes',    Icon: IconUsers    },
] as const;

const ADMIN_SUB = [
  { href: '/admin/funcionarios',       label: 'Funcionários' },
  { href: '/admin/cargos',             label: 'Cargos'       },
  { href: '/admin/setores',            label: 'Setores'      },
  { href: '/admin/unidades/cadastro',  label: 'Unidades'     },
  { href: '/admin/clientes',           label: 'Clientes'     },
];

// ── Componente ────────────────────────────────────────────────────────────
interface Props {
  isAdmin: boolean;
  userEmail?: string;
  /** Em tela cheia TV o sidebar flutua sobre o conteúdo */
  floating?: boolean;
  /** True quando o modo TV está ativo */
  isTvFs?: boolean;
  /** True quando qualquer modo fullscreen está ativo */
  isAnyFs?: boolean;
  /** Entra/sai do modo TV (sidebar flutuante) */
  onTvFs?: () => void;
  /** Entra/sai do modo fullscreen limpo (sidebar oculta) */
  onCleanFs?: () => void;
  /** Mobile: drawer aberto */
  mobileOpen?: boolean;
  /** Mobile: callback para fechar o drawer */
  onMobileClose?: () => void;
}

export default function Sidebar({
  isAdmin, userEmail,
  floating = false,
  isTvFs = false, isAnyFs = false,
  onTvFs, onCleanFs,
  mobileOpen = false, onMobileClose,
}: Props) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [pending, setPending]     = useState(false);

  // Ao entrar em modo TV: colapsa automaticamente para ocupar menos espaço
  useEffect(() => {
    if (floating) setCollapsed(true);
  }, [floating]);

  async function handleSignOut() {
    setPending(true);
    await signOut();
  }

  const username = userEmail ? userEmail.split('@')[0] : 'usuário';
  const initials = username.slice(0, 2).toUpperCase();

  const cls = [
    styles.sidebar,
    collapsed   ? styles.collapsed   : '',
    floating    ? styles.floating    : '',
    mobileOpen  ? styles.mobileOpen  : '',
  ].filter(Boolean).join(' ');

  return (
    <aside className={cls}>

      {/* ── Brand ──────────────────────────────────────────────────────── */}
      <div className={styles.brand}>
        {/* Logo completo — visível quando expandido */}
        <img src={LOGO_URL} alt="Açosvital" className={styles.logo} />

        {/* Logo ícone — visível quando colapsado ou flutuante */}
        <img src={ICON_LOGO_URL} alt="Açosvital" className={styles.logoIcon} />

        {/* Botão de colapso — oculto em modo flutuante */}
        {!floating && (
          <button
            className={styles.collapseBtn}
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            <IconChevron collapsed={collapsed} />
          </button>
        )}

      </div>

      {/* ── Navegação ─────────────────────────────────────────────────── */}
      <nav className={styles.nav}>
        <span className={styles.sectionLabel}>Menu</span>
        <ul className={styles.navList}>
          {NAV.map(({ href, label, Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`${styles.navItem} ${active ? styles.active : ''}`}
                  title={collapsed ? label : undefined}
                  onClick={onMobileClose}
                >
                  {active && <span className={styles.activePip} />}
                  <span className={styles.navIcon}><Icon /></span>
                  <span className={styles.navLabel}>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className={styles.spacer} />

      {/* ── Administração ─────────────────────────────────────────────── */}
      {isAdmin && (
        <div className={styles.adminSection}>
          <span className={styles.sectionLabel}>Configurações</span>
          <Link
            href="/admin"
            className={`${styles.navItem} ${pathname.startsWith('/admin') ? styles.active : ''}`}
            title={collapsed ? 'Administrar' : undefined}
            onClick={onMobileClose}
          >
            {pathname.startsWith('/admin') && <span className={styles.activePip} />}
            <span className={styles.navIcon}><IconSettings /></span>
            <span className={styles.navLabel}>Administrar</span>
          </Link>

          {pathname.startsWith('/admin') && !collapsed && (
            <ul className={styles.subNav}>
              {ADMIN_SUB.map(({ href, label }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className={`${styles.subNavItem} ${pathname === href ? styles.subNavActive : ''}`}
                    onClick={onMobileClose}
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Rodapé ────────────────────────────────────────────────────── */}
      <div className={styles.footer}>
        <div className={styles.footerActions}>
          <ThemeToggle className={styles.footerBtn} />

          {/* Tela cheia limpa — sem sidebar */}
          <button
            onClick={onCleanFs}
            disabled={isTvFs}
            className={styles.footerBtn}
            title={isTvFs ? 'Desative o Modo TV primeiro' : isAnyFs && !isTvFs ? 'Sair da tela cheia' : 'Tela cheia'}
          >
            <IconFullscreen exit={isAnyFs && !isTvFs} />
            <span>{isAnyFs && !isTvFs ? 'Sair da tela cheia' : 'Tela cheia'}</span>
          </button>
        </div>

        {/* Card Modo TV */}
        <button
          onClick={onTvFs}
          disabled={isAnyFs && !isTvFs}
          className={`${styles.tvCard} ${isTvFs ? styles.tvCardActive : ''} ${isAnyFs && !isTvFs ? styles.tvCardDisabled : ''}`}
          title={isAnyFs && !isTvFs ? 'Desative a tela cheia primeiro' : isTvFs ? 'Sair do Modo TV' : 'Modo TV — apresentação na televisão'}
        >
          <span className={styles.tvCardIcon}>
            <IconTv />
          </span>
          <span className={styles.tvCardBody}>
            <span className={styles.tvCardTitle}>Modo TV</span>
            <span className={styles.tvCardSub}>Apresentação na televisão</span>
          </span>
          {isTvFs && <span className={styles.tvCardBadge}>Ativo</span>}
        </button>

        <div className={styles.footerDivider} />

        {/* Perfil */}
        <div className={styles.userCard}>
          <div className={styles.userAvatar} aria-hidden="true">{initials}</div>
          <div className={styles.userInfo}>
            <span className={styles.userName}>{username}</span>
            {userEmail && <span className={styles.userEmail}>{userEmail}</span>}
          </div>
          <button
            onClick={handleSignOut}
            disabled={pending}
            className={styles.logoutBtn}
            title="Sair da conta"
          >
            <IconLogout />
          </button>
        </div>
      </div>
    </aside>
  );
}
