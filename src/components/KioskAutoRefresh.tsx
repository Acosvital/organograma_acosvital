'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  /** true quando a última busca de dados falhou — encurta o intervalo até recuperar. */
  hasError?: boolean;
  /** Intervalo normal de atualização dos dados (ms). */
  refreshIntervalMs?: number;
  /** Intervalo de nova tentativa enquanto hasError=true (ms). */
  retryIntervalMs?: number;
  /** Intervalo para uma recarga completa da página — evita acúmulo de estado
   *  do cliente (memória, contexto WebGL etc.) em telas que ficam rodando por
   *  dias sem interação humana (ms). */
  hardReloadIntervalMs?: number;
}

/**
 * Mantém uma tela pública (ex.: organograma em modo TV/quiosque) se
 * recuperando sozinha: refaz a busca de dados periodicamente (router.refresh
 * reexecuta o Server Component), tenta de novo com mais frequência enquanto
 * a última tentativa falhou, e recarrega a página inteira em intervalos
 * longos para não acumular estado indefinidamente no cliente. Não renderiza
 * nada — é só o efeito.
 */
export default function KioskAutoRefresh({
  hasError = false,
  refreshIntervalMs = 5 * 60_000,
  retryIntervalMs = 30_000,
  hardReloadIntervalMs = 6 * 60 * 60_000,
}: Props) {
  const router = useRouter();

  useEffect(() => {
    const interval = hasError ? retryIntervalMs : refreshIntervalMs;
    const id = setInterval(() => router.refresh(), interval);
    return () => clearInterval(id);
  }, [hasError, refreshIntervalMs, retryIntervalMs, router]);

  useEffect(() => {
    const id = setTimeout(() => window.location.reload(), hardReloadIntervalMs);
    return () => clearTimeout(id);
  }, [hardReloadIntervalMs]);

  return null;
}
