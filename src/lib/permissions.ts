export interface MenuItem {
  id: string;
  label: string;
  pode_visualizar: boolean;
  pode_criar: boolean;
  pode_editar: boolean;
  pode_deletar: boolean;
  submenu?: MenuItem[];
}

export type Acao = 'pode_visualizar' | 'pode_criar' | 'pode_editar' | 'pode_deletar';

/** Busca recursiva na árvore de menu (vinda de /permissoes_usuario/menu/:id)
 *  pelo slug da tela — mesmo mecanismo usado no Aços Hub. */
export function hasPermission(menu: MenuItem[], itemId: string, acao: Acao): boolean {
  for (const item of menu) {
    if (item.id === itemId) return item[acao] ?? false;
    if (item.submenu?.length) {
      const found = hasPermission(item.submenu, itemId, acao);
      if (found) return true;
    }
  }
  return false;
}

/** Prefixo das telas deste app na árvore de permissões do Aços Hub. */
const ORGANOGRAMA_PREFIX = 'organograma';

/**
 * Reduz a árvore de menu do Aços Hub às telas do organograma, numa lista
 * plana sem submenus — é isso que vai pro token JWT da sessão.
 *
 * A árvore inteira (~70 telas do Hub, ~9 KB de JSON) virava um cookie de
 * sessão de ~12 KB (criptografado e dividido em pedaços). Somado aos cookies
 * dos outros sistemas no mesmo domínio, passava do limite de cabeçalho do
 * Node e o site respondia HTTP 431. O organograma só consulta as próprias
 * telas (`organograma-*`), e `hasPermission` funciona igual numa lista plana.
 */
export function compactMenu(menu: MenuItem[]): MenuItem[] {
  const out: MenuItem[] = [];
  const walk = (items: MenuItem[]) => {
    for (const { submenu, ...item } of items) {
      if (item.id?.startsWith(ORGANOGRAMA_PREFIX)) out.push(item);
      if (submenu?.length) walk(submenu);
    }
  };
  walk(menu);
  return out;
}
