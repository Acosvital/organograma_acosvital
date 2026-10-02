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
