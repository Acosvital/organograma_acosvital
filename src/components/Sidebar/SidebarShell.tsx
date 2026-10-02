'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import Sidebar from './Sidebar';
import styles from './SidebarShell.module.css';
import { FsContext, type FsMode } from '@/lib/fsContext';
import {
  MODE_PARAM, enterFullscreen, exitFullscreen, readStoredMode, readUrlMode, storeMode,
} from '@/lib/kioskMode';
import IdleHomeRedirect from '@/components/IdleHomeRedirect';
import TvPlayer from '@/components/Kiosk/TvPlayer';
import TotemAttract from '@/components/Kiosk/TotemAttract';

interface Props {
  userEmail?: string;
  children: React.ReactNode;
}

const HIDDEN_PATHS = ['/login'];

export default function SidebarShell({ userEmail, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  const [mode, setModeState] = useState<FsMode>('none');
  // Só depois de ler o modo salvo dá pra mexer no data-kiosk do <html> —
  // antes disso ele vem do script KIOSK_INIT do layout e não pode ser apagado.
  const [restored, setRestored] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Restaura o modo salvo no aparelho; `?modo=` na URL tem prioridade e é
  // removido em seguida pra não ficar "grudado" nos links.
  useEffect(() => {
    const fromUrl = readUrlMode();
    if (fromUrl) {
      storeMode(fromUrl);
      const url = new URL(window.location.href);
      url.searchParams.delete(MODE_PARAM);
      router.replace(url.pathname + url.search + url.hash);
    }
    setModeState(fromUrl ?? readStoredMode());
    setRestored(true);
    // só na montagem
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setMode = useCallback((next: FsMode) => {
    storeMode(next);
    setModeState(next);
    // Chamado a partir de um clique: é o gesto que o navegador exige.
    if (next === 'none') exitFullscreen();
    else enterFullscreen();
  }, []);

  // Em quiosque, sair da tela cheia (Esc, gesto de voltar do Android) NÃO
  // desliga o modo — o próximo toque pede a tela cheia de novo. Só se sai
  // pelo botão "segure para sair". Depois de recarregar, a tela cheia também
  // só volta no primeiro toque (o navegador exige um gesto).
  useEffect(() => {
    if (mode === 'none') return;
    const again = () => { if (!document.fullscreenElement) enterFullscreen(); };
    window.addEventListener('pointerup', again);
    return () => window.removeEventListener('pointerup', again);
  }, [mode]);

  // Marca o <html> pros estilos globais de quiosque (sem seleção de texto,
  // sem menu de contexto do toque longo, cursor oculto no modo TV).
  useEffect(() => {
    if (!restored) return;
    const root = document.documentElement;
    if (mode === 'none') delete root.dataset.kiosk;
    else root.dataset.kiosk = mode;
    if (mode === 'none') return;
    const noMenu = (e: Event) => e.preventDefault();
    window.addEventListener('contextmenu', noMenu);
    return () => window.removeEventListener('contextmenu', noMenu);
  }, [mode, restored]);

  // Fecha sidebar mobile ao mudar de rota
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const exitKiosk = useCallback(() => setMode('none'), [setMode]);

  const showSidebar = !HIDDEN_PATHS.some(p => pathname.startsWith(p));

  if (!showSidebar) return (
    <FsContext.Provider value="none">
      <IdleHomeRedirect />
      {children}
    </FsContext.Provider>
  );

  const isKiosk = mode !== 'none';

  // Importante: manter uma única árvore JSX (com keys estáveis em Sidebar/conteúdo)
  // em vez de dois `return`s com formatos diferentes — caso contrário o React
  // remonta os filhos ao trocar de modo (por casarem por posição, não por tipo),
  // o que reinicia o estado interno do globo (ex.: pausa de rotação) ao entrar
  // em tela cheia.
  return (
    <FsContext.Provider value={mode}>
    <IdleHomeRedirect />
    <div className={styles.shell}>
      {/* Backdrop — cobre o conteúdo quando sidebar mobile está aberta */}
      {!isKiosk && mobileOpen && (
        <div
          key="backdrop"
          data-kiosk-hide
          className={styles.backdrop}
          onClick={closeMobile}
          aria-hidden="true"
        />
      )}

      {/* Botão hamburguer — só visível em mobile, fora dos modos de quiosque */}
      {!isKiosk && (
        <button
          key="menuBtn"
          data-kiosk-hide
          className={`${styles.menuBtn} ${mobileOpen ? styles.menuBtnOpen : ''}`}
          onClick={() => setMobileOpen(o => !o)}
          aria-label={mobileOpen ? 'Fechar menu' : 'Abrir menu'}
        >
          {mobileOpen ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          )}
        </button>
      )}

      {/* Modo TV não tem menu nenhum — só o conteúdo e a barra de controle. */}
      {mode !== 'tv' && (
        <Sidebar
          key="sidebar"
          userEmail={userEmail}
          mode={mode}
          onModeChange={setMode}
          mobileOpen={isKiosk ? false : mobileOpen}
          onMobileClose={closeMobile}
        />
      )}
      <div key="content" className={styles.content}>{children}</div>
      {mode === 'tv' && <TvPlayer key="tv" onExit={exitKiosk} />}
      {mode === 'totem' && <TotemAttract key="attract" />}
    </div>
    </FsContext.Provider>
  );
}
