'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './HoldButton.module.css';

interface Props {
  /** Tempo segurando até disparar (ms). */
  holdMs?: number;
  onComplete: () => void;
  className?: string;
  /** Texto enquanto não está sendo segurado. */
  label: string;
  /** Texto enquanto segura. */
  holdingLabel?: string;
  icon?: React.ReactNode;
  /** Só ícone (dock compacto); o texto vira title/aria-label. */
  iconOnly?: boolean;
}

/**
 * Botão que só dispara depois de segurado por `holdMs` — usado pra sair dos
 * modos de quiosque: um visitante tocando por curiosidade não desliga o
 * totem, mas quem sabe o que está fazendo sai sem precisar de teclado.
 * Teclado: segurar Enter/Espaço funciona igual.
 */
export default function HoldButton({
  holdMs = 3000,
  onComplete,
  className,
  label,
  holdingLabel = 'Continue segurando…',
  icon,
  iconOnly = false,
}: Props) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };

  const start = () => {
    if (timer.current) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setHolding(false);
      onComplete();
    }, holdMs);
  };

  useEffect(() => cancel, []);

  return (
    <button
      type="button"
      className={`${styles.btn} ${holding ? styles.holding : ''} ${className ?? ''}`}
      style={{ '--hold-ms': `${holdMs}ms` } as React.CSSProperties}
      onPointerDown={(e) => {
        // Captura: o dedo escorregar um pouco pra fora não cancela.
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
        start();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); start(); } }}
      onKeyUp={(e) => { if (e.key === 'Enter' || e.key === ' ') cancel(); }}
      onBlur={cancel}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={label}
      title={iconOnly ? label : undefined}
    >
      <span className={styles.fill} aria-hidden />
      {icon && <span className={styles.icon}>{icon}</span>}
      {!iconOnly && <span className={styles.label}>{holding ? holdingLabel : label}</span>}
    </button>
  );
}
