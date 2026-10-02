'use client';

import { useEffect, useRef, useState } from 'react';
import { LOGO_URL } from '@/lib/constants';
import styles from './TotemAttract.module.css';

/** Ociosidade até cobrir a tela com o convite. Fica abaixo dos 3 min do
 *  IdleHomeRedirect: quem chega encontra o convite já na tela inicial. */
const ATTRACT_MS = 90_000;
const CHECK_MS = 5_000;

/**
 * Modo Totem: depois de um tempo sem ninguém mexer, cobre a tela com um
 * convite "Toque para explorar" — um totem parado numa tela qualquer não
 * diz pra quem passa que dá pra interagir. O primeiro toque só fecha o
 * convite (não atravessa pro conteúdo embaixo).
 */
export default function TotemAttract() {
  const [visible, setVisible] = useState(false);
  const last = useRef(Date.now());

  useEffect(() => {
    const mark = () => { last.current = Date.now(); };
    window.addEventListener('pointerdown', mark);
    window.addEventListener('keydown', mark);
    window.addEventListener('wheel', mark, { passive: true });
    const id = setInterval(() => {
      if (Date.now() - last.current > ATTRACT_MS) setVisible(true);
    }, CHECK_MS);
    return () => {
      window.removeEventListener('pointerdown', mark);
      window.removeEventListener('keydown', mark);
      window.removeEventListener('wheel', mark);
      clearInterval(id);
    };
  }, []);

  if (!visible) return null;

  const dismiss = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    last.current = Date.now();
    setVisible(false);
  };

  return (
    <div
      className={styles.overlay}
      // Fecha no click (fim do toque), não no pointerdown: se sumisse no
      // pointerdown, o click do mesmo toque cairia no conteúdo embaixo.
      onClick={dismiss}
      onKeyDown={dismiss}
      role="button"
      tabIndex={0}
      aria-label="Toque para explorar"
    >
      <img src={LOGO_URL} alt="Aços Vital" className={styles.logo} />
      <div className={styles.ring} aria-hidden>
        <span className={styles.pulse} />
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11V6a2 2 0 0 1 4 0v5"/><path d="M13 10.5V9a2 2 0 0 1 4 0v3"/>
          <path d="M17 11a2 2 0 0 1 4 0v3a8 8 0 0 1-8 8h-1a8 8 0 0 1-6.5-3.3L3 15.2a2 2 0 0 1 3.2-2.4L9 15"/>
        </svg>
      </div>
      <p className={styles.title}>Toque para explorar</p>
      <p className={styles.sub}>Conheça a estrutura, as unidades e a história da Aços Vital</p>
    </div>
  );
}
