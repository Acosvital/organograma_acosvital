'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import HoldButton from './HoldButton';
import { TV_DONE_EVENT, TV_PAUSE_EVENT, TV_STEP_EVENT } from '@/lib/kioskMode';
import styles from './TvPlayer.module.css';

/** Quanto tempo cada tela fica no ar antes de passar pra próxima. */
const DWELL_MS = {
  overview: 25_000,
  unidade:  45_000,
  globo:    40_000,
  historia: 40_000,
} as const;

/** Controles somem depois desse tempo sem mexer em nada. */
const CONTROLS_MS = 5_000;

interface Step {
  href: string;
  label: string;
  ms: number;
}

const BASE_START: Step[] = [{ href: '/', label: 'Organograma — visão geral', ms: DWELL_MS.overview }];
const BASE_END: Step[] = [
  { href: '/unidades', label: 'Unidades',       ms: DWELL_MS.globo },
  { href: '/clientes', label: 'Clientes',       ms: DWELL_MS.globo },
  { href: '/historia', label: 'Nossa História', ms: DWELL_MS.historia },
];

interface Props {
  onExit: () => void;
}

/**
 * Modo TV: apresentação passiva, sem menu. Passa sozinho por visão geral →
 * organograma de cada unidade → globo de unidades → clientes → história, e
 * recomeça. Qualquer toque/movimento mostra por alguns segundos a barra de
 * controle (anterior / pausar / próxima / segurar pra sair); fora isso o
 * cursor fica escondido.
 */
export default function TvPlayer({ onExit }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [unidades, setUnidades] = useState<{ id: string; nome: string }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [index, setIndex] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  // Muda a cada "continuar": reinicia juntos o timer e a barra de progresso.
  const [runId, setRunId] = useState(0);
  const [controls, setControls] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/unidades')
      .then((r) => (r.ok ? r.json() : []))
      .then((list: { id: string; nome_fantasia: string }[]) => {
        if (alive && Array.isArray(list)) {
          setUnidades(list.map((u) => ({ id: u.id, nome: u.nome_fantasia })));
        }
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);

  const steps = useMemo<Step[]>(() => [
    ...BASE_START,
    ...unidades.map((u) => ({ href: `/organograma/${u.id}`, label: `Organograma — ${u.nome}`, ms: DWELL_MS.unidade })),
    ...BASE_END,
  ], [unidades]);

  // Começa (ou retoma após recarregar) pela tela em que já está; se a tela
  // atual não faz parte da apresentação, vai pra primeira.
  // Espera a lista de unidades (exceto na visão geral, que é sempre a etapa
  // 0): as etapas das unidades entram no meio da lista, então uma posição
  // calculada antes apontaria pra outra tela depois — recarregar em
  // /unidades fazia a TV pular na hora pro organograma da 1ª unidade.
  useEffect(() => {
    if (index !== null) return;
    if (!loaded && pathname !== '/') return;
    const found = steps.findIndex((s) => s.href === pathname);
    setIndex(found >= 0 ? found : 0);
  }, [steps, pathname, index, loaded]);

  const current = index !== null ? steps[index % steps.length] : null;

  // Duração pedida pela própria tela (ex.: o passeio pelos setores no
  // organograma de uma unidade leva mais que os 45 s padrão).
  const [override, setOverride] = useState<{ href: string; ms: number } | null>(null);
  const stepMs = current && override?.href === current.href ? override.ms : current?.ms ?? 0;

  useEffect(() => {
    if (current && current.href !== pathname) router.push(current.href);
    // só reage à troca de etapa — não a navegações internas da página
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.href]);

  const go = useCallback((delta: number) => {
    setIndex((i) => (i === null ? 0 : (i + delta + steps.length) % steps.length));
  }, [steps.length]);

  useEffect(() => {
    if (!current || paused) return;
    const id = setTimeout(() => go(1), stepMs);
    return () => clearTimeout(id);
  }, [current, stepMs, paused, go, index, runId]);

  // A tela no ar pede outra duração (reinicia timer e barra a partir de
  // agora) ou avisa que terminou a apresentação dela (passa pra próxima).
  const currentHref = current?.href;
  useEffect(() => {
    const onStep = (e: Event) => {
      const d = (e as CustomEvent<{ href: string; ms: number }>).detail;
      if (!d?.href || !(d.ms > 0)) return;
      // Guarda mesmo se ainda não for a etapa atual: depois de recarregar
      // direto numa unidade, a tela pede a duração antes do TvPlayer saber
      // em que etapa está (ele espera a lista de unidades).
      setOverride({ href: d.href, ms: d.ms });
      if (d.href === currentHref) setRunId((n) => n + 1);
    };
    const onDone = (e: Event) => {
      const d = (e as CustomEvent<{ href: string }>).detail;
      if (d?.href === currentHref && !pausedRef.current) go(1);
    };
    window.addEventListener(TV_STEP_EVENT, onStep);
    window.addEventListener(TV_DONE_EVENT, onDone);
    return () => {
      window.removeEventListener(TV_STEP_EVENT, onStep);
      window.removeEventListener(TV_DONE_EVENT, onDone);
    };
  }, [currentHref, go]);

  // Avisa a tela no ar quando pausa/continua (o passeio da câmera para junto).
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
    window.dispatchEvent(new CustomEvent(TV_PAUSE_EVENT, { detail: { paused } }));
  }, [paused]);

  const togglePause = useCallback(() => {
    setPaused((p) => {
      if (p) setRunId((n) => n + 1);
      return !p;
    });
  }, []);

  // Mostra os controles em qualquer interação; esconde cursor quando somem.
  useEffect(() => {
    const show = () => {
      setControls(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setControls(false), CONTROLS_MS);
    };
    window.addEventListener('pointermove', show);
    window.addEventListener('pointerdown', show);
    window.addEventListener('keydown', show);
    return () => {
      window.removeEventListener('pointermove', show);
      window.removeEventListener('pointerdown', show);
      window.removeEventListener('keydown', show);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (controls) delete root.dataset.tvIdle;
    else root.dataset.tvIdle = '';
    return () => { delete root.dataset.tvIdle; };
  }, [controls]);

  // Teclado/controle remoto: ← → trocam de tela, espaço pausa.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === ' ' && (e.target as HTMLElement)?.tagName !== 'BUTTON') {
        e.preventDefault();
        togglePause();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, togglePause]);

  if (!current) return null;
  const pos = (index ?? 0) % steps.length;

  return (
    <div className={`${styles.wrap} ${controls ? styles.visible : ''}`} aria-hidden={!controls}>
      <div className={styles.bar} role="toolbar" aria-label="Controles do Modo TV">
        <div className={styles.info}>
          <span className={styles.tag}>Modo TV</span>
          <span className={styles.title}>{current.label}</span>
          <span className={styles.count}>{pos + 1} / {steps.length}</span>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.btn} onClick={() => go(-1)} aria-label="Tela anterior">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnMain}`}
            onClick={togglePause}
            aria-label={paused ? 'Continuar' : 'Pausar'}
          >
            {paused ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
            )}
          </button>
          <button type="button" className={styles.btn} onClick={() => go(1)} aria-label="Próxima tela">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
          <HoldButton className={styles.exit} label="Segure para sair" holdingLabel="Saindo…" onComplete={onExit} />
        </div>

        {/* Progresso até a próxima tela — `key` reinicia a animação a cada etapa */}
        <div className={styles.track} aria-hidden>
          <div
            key={`${pos}-${current.href}-${runId}`}
            className={styles.progress}
            style={{ animationDuration: `${stepMs}ms`, animationPlayState: paused ? 'paused' : 'running' }}
          />
        </div>
      </div>
    </div>
  );
}
