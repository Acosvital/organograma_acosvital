import { createContext, useContext } from 'react';

/**
 * Modo de exibição da aplicação:
 * - `none`  — uso normal (desktop/celular), sidebar completa.
 * - `totem` — totem touch interativo: dock lateral grande, sem perfil/sair,
 *             tela de "toque para explorar" quando ocioso.
 * - `tv`    — apresentação passiva: sem menu, passa sozinho pelas telas.
 *
 * Os dois modos de quiosque ficam salvos no aparelho (ver `kioskMode.ts`)
 * e sobrevivem a recargas da página.
 */
export type FsMode = 'none' | 'tv' | 'totem';

export const FsContext = createContext<FsMode>('none');
export const useFsMode = () => useContext(FsContext);
