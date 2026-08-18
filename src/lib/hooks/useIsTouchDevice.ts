import { useEffect, useState } from 'react';

/**
 * Detecta se o dispositivo primário é touch (painel/quiosque touch, tablet)
 * via `matchMedia('(pointer: coarse)')`. Começa em `false` e só é atualizado
 * depois do mount — `matchMedia` não existe no server, então resolver isso
 * de cara causaria mismatch de hydration.
 */
export function useIsTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    setIsTouch(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  return isTouch;
}
