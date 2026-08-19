import { useEffect, useState } from 'react';

/**
 * Detecta se o dispositivo tem entrada touch (painel/quiosque touch, tablet).
 * Começa em `false` e só é atualizado depois do mount — `matchMedia`/`navigator`
 * não existem no server, então resolver isso de cara causaria mismatch de
 * hydration.
 *
 * `pointer: coarse` sozinho não basta: ele reflete só o ponteiro PRIMÁRIO, e em
 * quiosques/all-in-ones Windows com touch + mouse/trackpad conectados, o
 * navegador às vezes reporta o mouse como primário mesmo a tela sendo touch —
 * a checagem falha silenciosamente e o teclado virtual nunca aparece. Some
 * `any-pointer: coarse` (touch como ponteiro secundário disponível) e
 * `maxTouchPoints`/`ontouchstart` (evidência direta de hardware touch) como
 * sinais adicionais — qualquer um bastando classifica o dispositivo como touch.
 */
export function useIsTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    const coarsePointer =
      window.matchMedia('(pointer: coarse)').matches ||
      window.matchMedia('(any-pointer: coarse)').matches;
    const hasTouchHardware =
      navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
    setIsTouch(coarsePointer || hasTouchHardware);
  }, []);

  return isTouch;
}
