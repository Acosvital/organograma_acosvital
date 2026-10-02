import type { FsMode } from './fsContext';

/**
 * Persistência do modo de quiosque (Totem / TV) no aparelho.
 *
 * O estado não pode viver só na memória do React: o KioskAutoRefresh recarrega
 * a página a cada 6 h, e quedas de rede/reinício do navegador também — sem
 * isso o totem voltaria pra tela normal e alguém teria que ir lá religar.
 *
 * Também dá pra ligar pela URL, pra configurar o atalho do aparelho uma vez
 * só (ex.: `chrome --kiosk https://.../?modo=totem`):
 *   ?modo=totem | ?modo=tv | ?modo=off (desliga e limpa o que estava salvo)
 */
const STORAGE_KEY = 'organograma:kioskMode';
export const MODE_PARAM = 'modo';

function parse(value: string | null): FsMode | null {
  if (value === 'tv' || value === 'totem') return value;
  if (value === 'off' || value === 'none') return 'none';
  return null;
}

export function readStoredMode(): FsMode {
  try {
    return parse(localStorage.getItem(STORAGE_KEY)) ?? 'none';
  } catch {
    return 'none';
  }
}

export function storeMode(mode: FsMode) {
  try {
    if (mode === 'none') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // sem storage (aba anônima etc.): o modo vale só até recarregar
  }
}

/** Modo pedido pela URL atual, ou null se não houver `?modo=`. */
export function readUrlMode(): FsMode | null {
  return parse(new URLSearchParams(window.location.search).get(MODE_PARAM));
}

export async function enterFullscreen() {
  if (document.fullscreenElement) return;
  try {
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch {
    // Sem gesto do usuário (ex.: logo após recarregar) o navegador recusa —
    // o shell tenta de novo no próximo toque. Em `--kiosk` nem é preciso.
  }
}

export async function exitFullscreen() {
  if (!document.fullscreenElement) return;
  try {
    await document.exitFullscreen();
  } catch {}
}

// ── Modo TV: conversa entre o TvPlayer e a tela que está no ar ───────────
// Uma tela com apresentação própria (ex.: o passeio da câmera pelos setores
// no OrgChart) avisa quanto tempo precisa e quando terminou; o TvPlayer
// avisa quando foi pausado. Eventos de window porque o TvPlayer é irmão do
// conteúdo no SidebarShell, não ancestral (sem contexto em comum).

/** detail: { href: string; ms: number } — a tela pede `ms` de duração. */
export const TV_STEP_EVENT = 'organograma:tv-step';
/** detail: { href: string } — a tela terminou sua apresentação. */
export const TV_DONE_EVENT = 'organograma:tv-done';
/** detail: { paused: boolean } — o TvPlayer pausou/continuou. */
export const TV_PAUSE_EVENT = 'organograma:tv-pause';
