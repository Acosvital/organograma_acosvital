'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { KeyboardReactInterface } from 'react-simple-keyboard';
import 'react-simple-keyboard/build/css/index.css';
import styles from './OnScreenKeyboard.module.css';

// Mexe no DOM na importação — nunca pode rodar durante o SSR (mesmo motivo do
// FilerobotImageEditor em ImageUploadField.tsx).
const Keyboard = dynamic(() => import('react-simple-keyboard'), { ssr: false });

type LayoutName = 'default' | 'shift' | 'special';

// Layout próprio em vez do preset "brazilian" do simple-keyboard-layouts: aquele
// preset emula um teclado físico ABNT2, onde acentos (á, ã, é...) dependem de
// teclas mortas (´ ~ ^) que compõem com a vogal seguinte só num teclado real —
// a lib não implementa essa composição ao toque, só insere o caractere da tecla
// literalmente. Por isso as vogais acentuadas viram botões de toque único aqui.
//
// `layoutName` é controlado manualmente em vez de deixar a lib alternar sozinha
// — o toggle nativo de {shift} só sabe alternar entre "default"/"shift"; com um
// 3º layout ("special") próprio, é mais simples e previsível cuidar da troca de
// camada inteiramente no onKeyPress abaixo.
const LAYOUT: Record<LayoutName, string[]> = {
  default: [
    '1 2 3 4 5 6 7 8 9 0 {bksp}',
    'q w e r t y u i o p',
    'a s d f g h j k l ç',
    '{shift} z x c v b n m',
    'á à ã â é ê í ó õ ô ú',
    '{special} {space} {enter}',
  ],
  shift: [
    '! @ # $ % & * ( ) _ {bksp}',
    'Q W E R T Y U I O P',
    'A S D F G H J K L Ç',
    '{shift} Z X C V B N M',
    'Á À Ã Â É Ê Í Ó Õ Ô Ú',
    '{special} {space} {enter}',
  ],
  // Símbolos que não cabem nas camadas normais/shift — pontuação comum em
  // nomes/endereços (hífen, barra, parênteses...) e caracteres menos usados.
  special: [
    '- _ / : ; ( ) & @ " {bksp}',
    '. , ? ! \' + = * # %',
    '~ ^ ` < > [ ] { } |',
    '{abc} {space} {enter}',
  ],
};

const DISPLAY = {
  '{bksp}': '⌫',
  '{enter}': 'Buscar ↵',
  '{shift}': '⇧',
  '{space}': ' ',
  '{special}': '#+=',
  '{abc}': 'ABC',
};

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Tecla "Buscar"/Enter do teclado — quem chama decide o que "confirmar" significa (ex.: selecionar o primeiro resultado). */
  onEnter: () => void;
  onClose: () => void;
}

export default function OnScreenKeyboard({ value, onChange, onEnter, onClose }: Props) {
  const keyboardRef = useRef<KeyboardReactInterface | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [layoutName, setLayoutName] = useState<LayoutName>('default');

  // Mantém o buffer interno do teclado sincronizado quando `value` muda por
  // fora (ex.: digitação num teclado físico conectado, ou o botão "×" da
  // busca limpando o campo) — sem isso o teclado visual fica com texto obsoleto.
  useEffect(() => {
    keyboardRef.current?.setInput(value);
  }, [value]);

  // Centraliza horizontalmente ao montar — em px absolutos, calculados no
  // mesmo referencial usado pelo arraste (ver nota no CSS: `left:50%` não dá
  // pra usar aqui por causa do ancestral com `transform`). Só a largura, não
  // a altura: a altura continua ancorada por `bottom` no CSS, que lida bem
  // com o teclado ainda crescendo (import dinâmico do react-simple-keyboard).
  useLayoutEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const container = el.offsetParent as HTMLElement | null;
    const containerW = container?.clientWidth ?? window.innerWidth;
    el.style.left = `${Math.max(0, (containerW - el.offsetWidth) / 2)}px`;
  }, []);

  // ── Arrastar pelo cabeçalho ──────────────────────────────────────────────
  // Manipula `left`/`top` direto no DOM (sem useState) para não re-renderizar
  // o teclado inteiro a cada pixel de movimento — mesmo motivo do pan do
  // canvas principal em OrgChart.tsx. No primeiro arraste "trava" a posição
  // atual (calculada da âncora `left:50%;bottom:24px` original) em px
  // absolutos, substituindo a âncora por CSS — dali em diante o overlay só
  // responde à posição que o usuário escolheu.
  //
  // Usa `offsetLeft`/`offsetTop` (relativos ao containing block real deste
  // elemento) em vez de `getBoundingClientRect()` (sempre relativo à
  // viewport): o wrapper do OrgChart tem um `transform` no ancestral (efeito
  // de tilt 3D) — mesmo uma matriz identidade — o que já basta, por spec do
  // CSS, pra tirar um `position:fixed` descendente da viewport e ancorá-lo
  // nesse ancestral transformado. Misturar as duas referências fazia o
  // teclado "pular" um tanto de página assim que o arraste começava.
  const dragRef = useRef<{ startX: number; startY: number; baseLeft: number; baseTop: number; pointerId: number } | null>(null);

  const onHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = overlayRef.current;
    if (!el || (e.pointerType === 'mouse' && e.button !== 0)) return;
    // Não inicia arraste ao tocar no "×" — só o gesto de fechar deve valer ali.
    if ((e.target as HTMLElement).closest(`.${styles.closeBtn}`)) return;
    el.style.left = `${el.offsetLeft}px`;
    el.style.top = `${el.offsetTop}px`;
    el.style.bottom = 'auto';
    el.style.transform = 'none';
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseLeft: el.offsetLeft,
      baseTop: el.offsetTop,
      pointerId: e.pointerId,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragRef.current;
    const el = overlayRef.current;
    if (!st || !el) return;
    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;
    // Limites no mesmo referencial de `left`/`top` (o containing block real,
    // não necessariamente a janela inteira — ver nota acima).
    const container = el.offsetParent as HTMLElement | null;
    const containW = container?.clientWidth ?? window.innerWidth;
    const containH = container?.clientHeight ?? window.innerHeight;
    const maxLeft = containW - el.offsetWidth;
    const maxTop = containH - el.offsetHeight;
    // Mantém pelo menos uma faixa visível dentro da tela — nunca deixa
    // arrastar o teclado inteiro pra fora, onde ficaria impossível de pegar
    // de volta num painel touch (sem mouse pra "puxar" de longe).
    const left = Math.min(Math.max(st.baseLeft + dx, 0), Math.max(maxLeft, 0));
    const top = Math.min(Math.max(st.baseTop + dy, 0), Math.max(maxTop, 0));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  };

  const onHeaderPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  };

  return (
    <div className={styles.overlay} ref={overlayRef}>
      <div
        className={styles.header}
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        onPointerCancel={onHeaderPointerUp}
      >
        <span className={styles.dragHandle} aria-hidden="true">⠿</span>
        <span className={styles.title}>Teclado</span>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Fechar teclado">
          ×
        </button>
      </div>
      <Keyboard
        keyboardRef={r => { keyboardRef.current = r; }}
        layout={LAYOUT}
        layoutName={layoutName}
        display={DISPLAY}
        mergeDisplay
        theme="hg-theme-default"
        // Em touch, sem isso a lib escuta toque E o mousedown/click sintético
        // que o navegador dispara logo depois — um toque só vira duas
        // ativações da tecla (efeito "digitou duas vezes"). Só troca pro
        // modo touch-only quando um dispositivo touch é realmente detectado
        // (ontouchstart/maxTouchPoints, na própria lib) — mouse/desktop
        // continua funcionando normalmente por clique.
        autoUseTouchEvents
        buttonTheme={[
          ...(layoutName === 'shift' ? [{ class: styles.kbToggleActive, buttons: '{shift}' }] : []),
          ...(layoutName === 'special' ? [{ class: styles.kbToggleActive, buttons: '{special}' }] : []),
          { class: styles.kbSpecial, buttons: '{special} {abc}' },
          { class: styles.kbEnter, buttons: '{enter}' },
        ]}
        onChange={onChange}
        onKeyPress={button => {
          if (button === '{enter}') { onEnter(); return; }
          if (button === '{shift}') { setLayoutName(l => (l === 'shift' ? 'default' : 'shift')); return; }
          if (button === '{special}') { setLayoutName('special'); return; }
          if (button === '{abc}') { setLayoutName('default'); return; }
        }}
      />
    </div>
  );
}
