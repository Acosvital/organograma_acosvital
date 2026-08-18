'use client';

import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { KeyboardReactInterface } from 'react-simple-keyboard';
import 'react-simple-keyboard/build/css/index.css';
import styles from './OnScreenKeyboard.module.css';

// Mexe no DOM na importação — nunca pode rodar durante o SSR (mesmo motivo do
// FilerobotImageEditor em ImageUploadField.tsx).
const Keyboard = dynamic(() => import('react-simple-keyboard'), { ssr: false });

// Layout próprio em vez do preset "brazilian" do simple-keyboard-layouts: aquele
// preset emula um teclado físico ABNT2, onde acentos (á, ã, é...) dependem de
// teclas mortas (´ ~ ^) que compõem com a vogal seguinte só num teclado real —
// a lib não implementa essa composição ao toque, só insere o caractere da tecla
// literalmente. Por isso as vogais acentuadas viram botões de toque único aqui.
const LAYOUT = {
  default: [
    '1 2 3 4 5 6 7 8 9 0 {bksp}',
    'q w e r t y u i o p',
    'a s d f g h j k l ç',
    '{shift} z x c v b n m',
    'á à ã â é ê í ó õ ô ú',
    '{space} {enter}',
  ],
  shift: [
    '! @ # $ % & * ( ) _ {bksp}',
    'Q W E R T Y U I O P',
    'A S D F G H J K L Ç',
    '{shift} Z X C V B N M',
    'Á À Ã Â É Ê Í Ó Õ Ô Ú',
    '{space} {enter}',
  ],
};

const DISPLAY = {
  '{bksp}': '⌫',
  '{enter}': 'Buscar ↵',
  '{shift}': '⇧',
  '{space}': ' ',
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

  // Mantém o buffer interno do teclado sincronizado quando `value` muda por
  // fora (ex.: digitação num teclado físico conectado, ou o botão "×" da
  // busca limpando o campo) — sem isso o teclado visual fica com texto obsoleto.
  useEffect(() => {
    keyboardRef.current?.setInput(value);
  }, [value]);

  return (
    <div className={styles.overlay}>
      <div className={styles.header}>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Fechar teclado">
          ×
        </button>
      </div>
      <Keyboard
        keyboardRef={r => { keyboardRef.current = r; }}
        layout={LAYOUT}
        display={DISPLAY}
        mergeDisplay
        theme="hg-theme-default"
        onChange={onChange}
        onKeyPress={button => { if (button === '{enter}') onEnter(); }}
      />
    </div>
  );
}
