'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { LOGO_URL } from '@/lib/constants';
import type { FsMode } from '@/lib/fsContext';
import HoldButton from '@/components/Kiosk/HoldButton';
import styles from './Sidebar.module.css';

// Layout e comportamento espelham o menu do Aços Hub
// (00 - HUB/components/Layout/AppLayout/Menu/Menu.tsx): busca com Ctrl+K,
// páginas recentes, seções recolhíveis, perfil em popover e modo compacto.
// Diferenças: os itens são fixos (o organograma tem poucas telas, sem
// submenu) e há a seção "Apresentação" com Modo Totem / Modo TV. No Modo
// Totem o menu vira um dock lateral pra toque (ver TotemDock).

const RECENTS_KEY = 'organograma:recentPages';
const COLLAPSED_GROUPS_KEY = 'organograma:collapsedGroups';
const MAX_RECENTS = 4;

// ── Ícones (traço Lucide, 16px) ───────────────────────────────────────────
type IconProps = { size?: number; className?: string };
function Svg({ size = 16, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}
    >
      {children}
    </svg>
  );
}
const IconWelcome = (p: IconProps) => <Svg {...p}><path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z"/></Svg>;
const IconOrg = (p: IconProps) => (
  <Svg {...p}>
    <rect x="8" y="1" width="8" height="6" rx="1.5"/><rect x="1" y="17" width="7" height="6" rx="1.5"/>
    <rect x="16" y="17" width="7" height="6" rx="1.5"/><path d="M12 7v4.5M12 11.5H4.5v4M12 11.5H19.5v4"/>
  </Svg>
);
const IconBuilding = (p: IconProps) => (
  <Svg {...p}><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18"/><path d="M2 22h20"/><path d="M10 7h4M10 11h4M10 15h4"/></Svg>
);
const IconUsers = (p: IconProps) => (
  <Svg {...p}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </Svg>
);
const IconBook = (p: IconProps) => (
  <Svg {...p}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></Svg>
);
const IconTv = (p: IconProps) => (
  <Svg {...p}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M8 3l4 4 4-4"/></Svg>
);
const IconTotem = (p: IconProps) => (
  <Svg {...p}><path d="M9 11V6a2 2 0 0 1 4 0v5"/><path d="M13 10.5V9a2 2 0 0 1 4 0v3"/><path d="M17 11a2 2 0 0 1 4 0v3a8 8 0 0 1-8 8h-1a8 8 0 0 1-6.5-3.3L3 15.2a2 2 0 0 1 3.2-2.4L9 15"/></Svg>
);
const IconSearch = (p: IconProps) => <Svg {...p}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></Svg>;
const IconClock = (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></Svg>;
const IconX = (p: IconProps) => <Svg {...p}><path d="M18 6 6 18M6 6l12 12"/></Svg>;
const IconChevronDown = (p: IconProps) => <Svg {...p}><path d="m6 9 6 6 6-6"/></Svg>;
const IconChevronLeft = (p: IconProps) => <Svg {...p}><path d="m15 18-6-6 6-6"/></Svg>;
const IconChevronRight = (p: IconProps) => <Svg {...p}><path d="m9 18 6-6-6-6"/></Svg>;
const IconChevronsUpDown = (p: IconProps) => <Svg {...p}><path d="m7 15 5 5 5-5M7 9l5-5 5 5"/></Svg>;
const IconSun = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></Svg>
);
const IconMoon = (p: IconProps) => <Svg {...p}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></Svg>;
const IconLogout = (p: IconProps) => (
  <Svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></Svg>
);
const IconPower = (p: IconProps) => <Svg {...p}><path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/></Svg>;

// ── Rotas ────────────────────────────────────────────────────────────────
// `group` vazio = sem rótulo de seção (fica no topo), como no groupMap do Hub.
const NAV = [
  { href: '/bem-vindo', label: 'Bem-vindo',      Icon: IconWelcome,  group: '' },
  { href: '/',          label: 'Organograma',    Icon: IconOrg,      group: '' },
  { href: '/unidades',  label: 'Unidades',       Icon: IconBuilding, group: 'Empresa' },
  { href: '/clientes',  label: 'Clientes',       Icon: IconUsers,    group: 'Empresa' },
  { href: '/historia',  label: 'Nossa História', Icon: IconBook,     group: 'Empresa' },
] as const;
type NavItem = (typeof NAV)[number];

const APRESENTACAO = 'Apresentação';

function isActive(href: string, pathname: string) {
  return href === '/' ? pathname === '/' || pathname.startsWith('/organograma') : pathname.startsWith(href);
}

// Remove acentos pra busca funcionar digitando "historia".
function normalizeSearch(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // preferência é só conveniência
  }
}

// Mesma cor por nome que o Avatar do Hub (hash → hex, escurecido).
function stringToColor(s: string) {
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) hash = s.charCodeAt(i) + ((hash << 5) - hash);
  let color = '#';
  for (let i = 0; i < 3; i += 1) color += `00${((hash >> (i * 8)) & 0xff).toString(16)}`.slice(-2);
  return color;
}

function initials(name: string) {
  const parts = name.replace(/[._-]+/g, ' ').trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase() || '?';
}

// ── Componente ────────────────────────────────────────────────────────────
// Modo Totem: dock lateral fixo, só os destinos — sem busca (não há
// teclado físico), sem perfil/tema/sair (visitante não pode deslogar o
// aparelho). Alvos de toque grandes, com rótulo embaixo do ícone. Sai
// segurando o botão do rodapé.
const TOTEM_ICON_URL =
  'https://s3.acosvital.com.br/organograma-prd-empresa/geral/logo/logo_icone_apenas.png';

// Hora/data no rodapé do dock — num totem de recepção é a informação que
// mais gente procura de relance. Só renderiza no cliente (evita mismatch
// de hidratação com a hora do servidor).
function TotemRelogio() {
  const [agora, setAgora] = useState<Date | null>(null);
  useEffect(() => {
    setAgora(new Date());
    const id = setInterval(() => setAgora(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);
  if (!agora) return <div className={styles.totemRelogio} aria-hidden />;
  const hora = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dia = agora
    .toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' })
    .replace('.', '')
    .replace(',', '');
  return (
    <div className={styles.totemRelogio}>
      <span className={styles.totemHora}>{hora}</span>
      <span className={styles.totemData}>{dia}</span>
    </div>
  );
}

function TotemDock({ pathname, onExit }: { pathname: string; onExit: () => void }) {
  return (
    <aside className={`${styles.root} ${styles.totem}`} aria-label="Navegação principal">
      <div className={styles.totemLogo}>
        <img src={TOTEM_ICON_URL} alt="Aços Vital" className={styles.totemLogoImg} draggable={false} />
      </div>
      <nav className={styles.totemNav} aria-label="Menu">
        <ul className={styles.totemLista}>
          {NAV.map((item) => {
            const ativo = isActive(item.href, pathname);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`${styles.totemItem} ${ativo ? styles.totemItemAtivo : ''}`}
                  aria-current={ativo ? 'page' : undefined}
                  draggable={false}
                >
                  <span className={styles.totemTile}><item.Icon size={22} /></span>
                  <span className={styles.totemRotulo}>
                    {item.label === 'Nossa História' ? 'História' : item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className={styles.totemRodape}>
        <TotemRelogio />
        <HoldButton
          className={styles.totemSair}
          icon={<IconPower size={16} />}
          iconOnly
          holdMs={3000}
          label="Segure por 3 segundos para sair do Modo Totem"
          onComplete={onExit}
        />
      </div>
    </aside>
  );
}

interface Props {
  userEmail?: string;
  /** Modo de exibição atual (ver fsContext). `tv` não renderiza sidebar. */
  mode?: FsMode;
  /** Liga/desliga Modo Totem / Modo TV */
  onModeChange?: (mode: FsMode) => void;
  /** Mobile: drawer aberto */
  mobileOpen?: boolean;
  /** Mobile: callback para fechar o drawer */
  onMobileClose?: () => void;
}

export default function Sidebar(props: Props) {
  const pathname = usePathname();
  if (props.mode === 'totem') {
    return <TotemDock pathname={pathname} onExit={() => props.onModeChange?.('none')} />;
  }
  return <SidebarCompleta {...props} />;
}

function SidebarCompleta({
  userEmail,
  onModeChange,
  mobileOpen = false, onMobileClose,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();

  const [minimizado, setMinimizado] = useState(false);
  const [tablet, setTablet] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [busca, setBusca] = useState('');
  const [recentes, setRecentes] = useState<string[]>([]);
  const [gruposRecolhidos, setGruposRecolhidos] = useState<Set<string>>(new Set());
  const [perfilAberto, setPerfilAberto] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [saindo, setSaindo] = useState(false);
  const buscaRef = useRef<HTMLInputElement>(null);
  const rodapeRef = useRef<HTMLDivElement>(null);

  // No mobile o menu é sempre a gaveta completa; no tablet (768–1023px),
  // sempre compacto — mesma regra que a sidebar antiga fazia por CSS.
  const gaveta = mobileOpen && mobile;
  const compacto = !gaveta && (minimizado || tablet);

  useEffect(() => {
    const mqTablet = window.matchMedia('(min-width: 768px) and (max-width: 1023px)');
    const mqMobile = window.matchMedia('(max-width: 767px)');
    const sync = () => {
      setTablet(mqTablet.matches);
      setMobile(mqMobile.matches);
    };
    sync();
    mqTablet.addEventListener('change', sync);
    mqMobile.addEventListener('change', sync);
    return () => {
      mqTablet.removeEventListener('change', sync);
      mqMobile.removeEventListener('change', sync);
    };
  }, []);

  // Preferências no localStorage, lidas uma vez no cliente (evita mismatch
  // de hidratação).
  useEffect(() => {
    setRecentes(readJson<string[]>(RECENTS_KEY, []));
    setGruposRecolhidos(new Set(readJson<string[]>(COLLAPSED_GROUPS_KEY, [])));
    setIsDark(document.documentElement.dataset.theme !== 'light');
  }, []);

  // A página atual entra nos recentes.
  useEffect(() => {
    const atual = NAV.find((i) => isActive(i.href, pathname));
    if (!atual) return;
    setRecentes((prev) => {
      if (prev[0] === atual.href) return prev;
      const next = [atual.href, ...prev.filter((p) => p !== atual.href)].slice(0, MAX_RECENTS);
      writeJson(RECENTS_KEY, next);
      return next;
    });
  }, [pathname]);

  // Nunca deixa escondida a seção que contém a página atual.
  useEffect(() => {
    const grupo = NAV.find((i) => isActive(i.href, pathname))?.group;
    if (!grupo) return;
    setGruposRecolhidos((prev) => {
      if (!prev.has(grupo)) return prev;
      const next = new Set(prev);
      next.delete(grupo);
      writeJson(COLLAPSED_GROUPS_KEY, [...next]);
      return next;
    });
  }, [pathname]);

  useEffect(() => {
    setBusca('');
    setPerfilAberto(false);
  }, [pathname]);

  // Ctrl/Cmd+K foca a busca (e reabre o menu se estiver compacto).
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setMinimizado(false);
        // No modo compacto o campo ainda não existe: foca após renderizar.
        requestAnimationFrame(() => buscaRef.current?.focus());
      }
    }
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, []);

  // Popover do perfil fecha com clique fora ou Esc.
  useEffect(() => {
    if (!perfilAberto) return;
    function fora(e: PointerEvent) {
      if (!rodapeRef.current?.contains(e.target as Node)) setPerfilAberto(false);
    }
    function esc(e: KeyboardEvent) {
      if (e.key === 'Escape') setPerfilAberto(false);
    }
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [perfilAberto]);

  const alternarGrupo = (grupo: string) => {
    setGruposRecolhidos((prev) => {
      const next = new Set(prev);
      if (next.has(grupo)) next.delete(grupo);
      else next.add(grupo);
      writeJson(COLLAPSED_GROUPS_KEY, [...next]);
      return next;
    });
  };

  const buscaNormalizada = normalizeSearch(busca.trim());
  const resultados = useMemo(
    () => (buscaNormalizada ? NAV.filter((i) => normalizeSearch(i.label).includes(buscaNormalizada)) : []),
    [buscaNormalizada],
  );

  const teclaNaBusca = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setBusca('');
      buscaRef.current?.blur();
    } else if (e.key === 'Enter' && resultados.length) {
      router.push(resultados[0].href);
      setBusca('');
      buscaRef.current?.blur();
      onMobileClose?.();
    }
  };

  const destacar = (label: string) => {
    const idx = normalizeSearch(label).indexOf(buscaNormalizada);
    if (idx === -1 || !buscaNormalizada) return label;
    const fim = idx + busca.trim().length;
    return (
      <>
        {label.slice(0, idx)}
        <mark className={styles.marca}>{label.slice(idx, fim)}</mark>
        {label.slice(fim)}
      </>
    );
  };

  const chipsRecentes = recentes
    .map((href) => NAV.find((i) => i.href === href))
    .filter((i): i is NavItem => !!i && !isActive(i.href, pathname));

  const removerRecente = (href: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setRecentes((prev) => {
      const next = prev.filter((p) => p !== href);
      writeJson(RECENTS_KEY, next);
      return next;
    });
  };

  const alternarTema = () => {
    const next = isDark ? 'light' : 'dark';
    if (next === 'light') document.documentElement.dataset.theme = 'light';
    else delete document.documentElement.dataset.theme;
    // `theme` é lido como string crua (sem JSON) pelo script anti-flash do layout.
    try { localStorage.setItem('theme', next); } catch {}
    setIsDark(!isDark);
    setPerfilAberto(false);
  };

  async function sair() {
    setSaindo(true);
    await signOut({ callbackUrl: '/login' });
  }

  const email = session?.user?.email ?? userEmail ?? '';
  const userName = session?.user?.name || (email ? email.split('@')[0] : 'usuário');

  const semGrupo = NAV.filter((i) => !i.group);
  const ordemGrupos = [...new Set(NAV.map((i) => i.group).filter(Boolean))];

  const renderItem = (item: NavItem) => {
    const ativo = isActive(item.href, pathname);
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          className={`${styles.item} ${ativo ? styles.itemAtivo : ''}`}
          aria-current={ativo ? 'page' : undefined}
          title={compacto ? item.label : undefined}
          onClick={onMobileClose}
        >
          <span className={styles.icone}><item.Icon /></span>
          {!compacto && <span className={styles.rotulo}>{item.label}</span>}
        </Link>
      </li>
    );
  };

  const renderGrupo = (grupo: string, children: React.ReactNode) => {
    const recolhido = gruposRecolhidos.has(grupo);
    return (
      <Fragment key={grupo}>
        {compacto ? (
          <li className={styles.divisor} aria-hidden />
        ) : (
          <li className={styles.grupoItem}>
            <button
              type="button"
              className={styles.grupo}
              onClick={() => alternarGrupo(grupo)}
              aria-expanded={!recolhido}
            >
              <span>{grupo}</span>
              <IconChevronDown
                size={12}
                className={`${styles.grupoSeta} ${recolhido ? styles.grupoSetaFechada : ''}`}
              />
            </button>
          </li>
        )}
        {(!recolhido || compacto) && children}
      </Fragment>
    );
  };

  const cls = [
    styles.root,
    compacto ? styles.compacto : '',
    gaveta ? styles.mobileAberto : '',
  ].filter(Boolean).join(' ');

  return (
    <>
      <aside className={cls} aria-label="Navegação principal" data-kiosk-hide>
        {!tablet && (
          <button
            type="button"
            className={styles.recolher}
            onClick={() => setMinimizado(!minimizado)}
            aria-label={compacto ? 'Expandir menu' : 'Recolher menu'}
          >
            {compacto ? <IconChevronRight size={12} /> : <IconChevronLeft size={12} />}
          </button>
        )}

        <div className={styles.logo}>
          <Link href="/" aria-label="Início" onClick={onMobileClose}>
            {compacto ? (
              <span className={styles.monograma}>AV</span>
            ) : (
              <img src={LOGO_URL} alt="Aços Vital" className={styles.logoImg} />
            )}
          </Link>
        </div>

        {!compacto && (
          <div className={styles.buscaArea}>
            <label className={styles.busca}>
              <IconSearch size={14} className={styles.buscaIcone} />
              <input
                ref={buscaRef}
                type="text"
                className={styles.buscaInput}
                placeholder="Buscar página"
                aria-label="Buscar página"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={teclaNaBusca}
                autoComplete="off"
              />
              {!busca && <kbd className={styles.kbd}>Ctrl K</kbd>}
            </label>
            {!busca && !!chipsRecentes.length && (
              <div className={styles.recentes} aria-label="Páginas recentes">
                {chipsRecentes.map((item) => (
                  <Link key={item.href} href={item.href} className={styles.chip} onClick={onMobileClose}>
                    <IconClock size={11} />
                    <span className={styles.chipTexto}>{item.label}</span>
                    <button
                      type="button"
                      className={styles.chipRemover}
                      onClick={(e) => removerRecente(item.href, e)}
                      aria-label={`Remover ${item.label} dos recentes`}
                    >
                      <IconX size={10} />
                    </button>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        <nav className={styles.nav} aria-label="Menu">
          <ul className={styles.lista}>
            {busca.trim() ? (
              resultados.length ? (
                resultados.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className={styles.resultado} onClick={onMobileClose}>
                      <span className={styles.icone}><item.Icon /></span>
                      <span className={styles.resultadoTexto}>
                        <span className={styles.rotulo}>{destacar(item.label)}</span>
                        {!!item.group && <span className={styles.migalha}>{item.group}</span>}
                      </span>
                    </Link>
                  </li>
                ))
              ) : (
                <li className={styles.vazio}>Nada encontrado para &quot;{busca}&quot;</li>
              )
            ) : (
              <>
                {semGrupo.map(renderItem)}
                {ordemGrupos.map((grupo) => renderGrupo(grupo, NAV.filter((i) => i.group === grupo).map(renderItem)))}
                {renderGrupo(APRESENTACAO, (
                  <>
                    <li>
                      <button
                        type="button"
                        className={styles.item}
                        onClick={() => onModeChange?.('totem')}
                        title={compacto ? 'Modo Totem — tela touch interativa' : 'Tela touch interativa (hall, recepção)'}
                      >
                        <span className={styles.icone}><IconTotem /></span>
                        {!compacto && <span className={styles.rotulo}>Modo Totem</span>}
                      </button>
                    </li>
                    <li>
                      <button
                        type="button"
                        className={styles.item}
                        onClick={() => onModeChange?.('tv')}
                        title={compacto ? 'Modo TV — apresentação automática' : 'Apresentação automática, sem toque'}
                      >
                        <span className={styles.icone}><IconTv /></span>
                        {!compacto && <span className={styles.rotulo}>Modo TV</span>}
                      </button>
                    </li>
                  </>
                ))}
              </>
            )}
          </ul>
        </nav>

        <div className={styles.rodape} ref={rodapeRef}>
          {perfilAberto && (
            <div className={styles.popover} role="menu">
              <button type="button" role="menuitem" className={styles.popoverItem} onClick={alternarTema}>
                {isDark ? <IconSun /> : <IconMoon />}
                {isDark ? 'Tema claro' : 'Tema escuro'}
              </button>
              <div className={styles.popoverDivisor} />
              <button
                type="button"
                role="menuitem"
                className={`${styles.popoverItem} ${styles.popoverSair}`}
                onClick={sair}
                disabled={saindo}
              >
                <IconLogout />
                {saindo ? 'Saindo…' : 'Sair'}
              </button>
            </div>
          )}
          <button
            type="button"
            className={`${styles.perfil} ${perfilAberto ? styles.perfilAberto : ''}`}
            onClick={() => setPerfilAberto((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={perfilAberto}
            title={compacto ? userName : undefined}
          >
            <span
              className={styles.avatar}
              style={{ background: `color-mix(in srgb, ${stringToColor(userName)} 85%, black)` }}
              aria-hidden
            >
              {initials(userName)}
            </span>
            {!compacto && (
              <>
                <span className={styles.perfilInfo}>
                  <span className={styles.perfilNome}>{userName}</span>
                  {!!email && <span className={styles.perfilEmail}>{email}</span>}
                </span>
                <IconChevronsUpDown size={14} className={styles.perfilSeta} />
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}
