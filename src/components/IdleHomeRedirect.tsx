'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useFsMode } from '@/lib/fsContext';

/** Tempo sem interação até voltar pra tela inicial — pensado para quiosque/TV:
 *  se a pessoa atual ficou parada e outra chegar, a tela já está "limpa". */
const IDLE_MS = 3 * 60 * 1_000;
const CHECK_INTERVAL_MS = 15_000;

/** Rotas onde o redirecionamento por inatividade não deve valer. */
const EXCLUDED_PREFIXES = ['/login'];

/**
 * Leva de volta para "/" após IDLE_MS sem nenhuma interação, em qualquer tela
 * pública (organograma de uma unidade, lista, história etc.) — não só reseta
 * o zoom/estado local da página atual. Monta uma vez no layout raiz.
 */
export default function IdleHomeRedirect() {
  const pathname = usePathname();
  const router = useRouter();
  const fsMode = useFsMode();
  const lastActivity = useRef(Date.now());

  // Trocar de rota conta como atividade — evita redirecionar alguém que
  // acabou de navegar e ainda não tocou em nada na tela nova.
  useEffect(() => {
    lastActivity.current = Date.now();
  }, [pathname]);

  // Sair do Modo TV também conta como atividade — sem isso, a contagem
  // parada durante a apresentação já estaria "vencida" no instante em que o
  // modo TV é desligado, disparando um redirecionamento imediato indevido.
  useEffect(() => {
    lastActivity.current = Date.now();
  }, [fsMode]);

  useEffect(() => {
    const markActive = () => { lastActivity.current = Date.now(); };
    window.addEventListener('pointerdown', markActive);
    window.addEventListener('keydown', markActive);
    window.addEventListener('wheel', markActive, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', markActive);
      window.removeEventListener('keydown', markActive);
      window.removeEventListener('wheel', markActive);
    };
  }, []);

  useEffect(() => {
    const isExcluded = pathname === '/' || EXCLUDED_PREFIXES.some(p => pathname.startsWith(p));
    // Modo TV é uma apresentação passiva de propósito — ninguém toca na tela
    // enquanto ela gira sozinha, então a contagem de inatividade não deve
    // valer aqui (senão ela sempre "vence" e interrompe a apresentação).
    if (isExcluded || fsMode === 'tv') return;

    const id = setInterval(() => {
      if (Date.now() - lastActivity.current > IDLE_MS) {
        router.push('/');
      }
    }, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [pathname, router, fsMode]);

  return null;
}
