'use client';

import { usePathname } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import Sidebar from './Sidebar';
import styles from './SidebarShell.module.css';
import { FsContext } from '@/lib/fsContext';

interface Props {
  isAdmin: boolean;
  userEmail?: string;
  children: React.ReactNode;
}

const HIDDEN_PATHS = ['/login'];

export default function SidebarShell({ isAdmin, userEmail, children }: Props) {
  const pathname = usePathname();

  /** 'none' | 'tv' (sidebar flutuante) | 'clean' (sidebar oculta) */
  const [fsMode, setFsMode] = useState<'none' | 'tv' | 'clean'>('none');
  const [mobileOpen, setMobileOpen] = useState(false);

  // Reset quando o usuário sai do fullscreen pelo Esc / API do browser
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setFsMode('none');
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Fecha sidebar mobile ao mudar de rota
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  const enterTvFs = useCallback(async () => {
    try {
      if (fsMode === 'tv') {
        await document.exitFullscreen();
        setFsMode('none');
      } else {
        if (!document.fullscreenElement)
          await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        setFsMode('tv');
      }
    } catch {}
  }, [fsMode]);

  const enterCleanFs = useCallback(async () => {
    try {
      if (fsMode === 'clean') {
        await document.exitFullscreen();
        setFsMode('none');
      } else {
        if (!document.fullscreenElement)
          await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        setFsMode('clean');
      }
    } catch {}
  }, [fsMode]);

  const showSidebar = !HIDDEN_PATHS.some(p => pathname.startsWith(p));

  if (!showSidebar) return <FsContext.Provider value={fsMode}>{children}</FsContext.Provider>;

  // Modo TV ou modo limpo: sidebar flutuante (position: fixed) sobre o conteúdo.
  if (fsMode === 'tv' || fsMode === 'clean') {
    return (
      <FsContext.Provider value={fsMode}>
      <div className={styles.shell}>
        <Sidebar
          isAdmin={isAdmin}
          userEmail={userEmail}
          floating={true}
          isTvFs={fsMode === 'tv'}
          isAnyFs={true}
          onTvFs={enterTvFs}
          onCleanFs={enterCleanFs}
          mobileOpen={false}
          onMobileClose={closeMobile}
        />
        <div className={styles.content}>{children}</div>
      </div>
      </FsContext.Provider>
    );
  }

  return (
    <FsContext.Provider value={fsMode}>
    <div className={styles.shell}>
      {/* Backdrop — cobre o conteúdo quando sidebar mobile está aberta */}
      {mobileOpen && (
        <div
          className={styles.backdrop}
          onClick={closeMobile}
          aria-hidden="true"
        />
      )}

      {/* Botão hamburguer — só visível em mobile */}
      <button
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

      <Sidebar
        isAdmin={isAdmin}
        userEmail={userEmail}
        floating={false}
        isTvFs={false}
        isAnyFs={false}
        onTvFs={enterTvFs}
        onCleanFs={enterCleanFs}
        mobileOpen={mobileOpen}
        onMobileClose={closeMobile}
      />
      <div className={styles.content}>{children}</div>
    </div>
    </FsContext.Provider>
  );
}
