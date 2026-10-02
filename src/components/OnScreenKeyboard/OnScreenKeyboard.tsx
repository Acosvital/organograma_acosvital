'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import styles from './OnScreenKeyboard.module.css';

// Teclado próprio (antes era o react-simple-keyboard). Implementado à mão
// porque assim:
//   - cada toque é exatamente UM pointerdown (a lib disparava toque + clique
//     sintético e precisava de workaround pra não digitar duas vezes);
//   - dá pra ter balão de pré-visualização da tecla, apagar segurando e
//     vibração curta no toque;
//   - não tem import dinâmico (o teclado aparecia "crescendo").
//
// Duas variantes:
//   - `search`: a busca ignora maiúsculas e acentos (normalizeSearch em
//     nodeUtils), então o layout é limpo, sem shift e sem acentos à vista.
//   - `text`: pra login — senha diferencia maiúsculas e usa símbolos, então
//     tem shift (toque duplo trava o Caps), símbolos completos e atalhos de
//     e-mail.

export type KeyboardVariant = 'search' | 'text';
type Layer = 'abc' | 'sym';
type Shift = 'off' | 'once' | 'lock';

const NUMS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

// Tecla: caractere literal, ou ação entre chaves.
const ROWS: Record<KeyboardVariant, Record<Layer, string[][]>> = {
  search: {
    abc: [
      NUMS,
      ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
      ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ç'],
      ['{sym}', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '{bksp}'],
      ['{clear}', '{space}', '{enter}'],
    ],
    // Pontuação que aparece em nomes de pessoas, cargos e setores.
    sym: [
      NUMS,
      ['-', '/', '.', ',', '&', '(', ')', "'", '"', '@'],
      ['_', ':', ';', '+', '#', '%', '*', '!', '?', 'º'],
      ['{abc}', 'á', 'é', 'í', 'ó', 'ú', 'ã', 'õ', '{bksp}'],
      ['{clear}', '{space}', '{enter}'],
    ],
  },
  text: {
    abc: [
      NUMS,
      ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
      ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ç'],
      ['{shift}', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '{bksp}'],
      ['{sym}', '@', '{space}', '.', '{enter}'],
    ],
    sym: [
      NUMS,
      ['!', '@', '#', '$', '%', '&', '*', '(', ')', '-'],
      ['_', '=', '+', '/', '\\', ':', ';', "'", '"', '?'],
      ['{abc}', ',', '<', '>', '[', ']', '{', '}', '{bksp}'],
      ['{clear}', '~', '{space}', '.', '{enter}'],
    ],
  },
};

const REPEAT_DELAY_MS = 420;
const REPEAT_EVERY_MS = 55;
const DOUBLE_TAP_MS = 350;

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Tecla de confirmar — quem chama decide o que significa (buscar, ir pro próximo campo, entrar). */
  onEnter: () => void;
  onClose: () => void;
  variant?: KeyboardVariant;
  /** Texto do campo vazio na pré-visualização. */
  placeholder?: string;
  /** Rótulo da tecla de confirmar. */
  enterLabel?: string;
  /** Pré-visualização com bolinhas (senha). */
  masked?: boolean;
  /** Atalhos de texto acima das teclas (ex.: domínios de e-mail). */
  suggestions?: string[];
}

function vibrate() {
  try { navigator.vibrate?.(8); } catch {}
}

export default function OnScreenKeyboard({
  value,
  onChange,
  onEnter,
  onClose,
  variant = 'search',
  placeholder = 'Digite para buscar',
  enterLabel = 'Buscar',
  masked = false,
  suggestions = [],
}: Props) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [layer, setLayer] = useState<Layer>('abc');
  const [shift, setShift] = useState<Shift>('off');
  const lastShiftTap = useRef(0);
  const [pressed, setPressed] = useState<string | null>(null);

  // Último valor sempre à mão: o apagar-segurando roda num timer e não pode
  // usar um `value` congelado no closure.
  const valueRef = useRef(value);
  valueRef.current = value;
  const repeatRef = useRef<{ delay?: ReturnType<typeof setTimeout>; every?: ReturnType<typeof setInterval> }>({});

  const stopRepeat = () => {
    clearTimeout(repeatRef.current.delay);
    clearInterval(repeatRef.current.every);
    repeatRef.current = {};
  };
  useEffect(() => stopRepeat, []);

  const isText = variant === 'text';
  const upper = isText && shift !== 'off';

  const backspace = () => {
    const v = valueRef.current;
    if (v) onChange(v.slice(0, -1));
  };

  const insert = (text: string) => onChange(valueRef.current + text);

  const press = (key: string) => {
    vibrate();
    switch (key) {
      case '{bksp}':
        backspace();
        // Segurar apaga em sequência, como num celular.
        repeatRef.current.delay = setTimeout(() => {
          repeatRef.current.every = setInterval(backspace, REPEAT_EVERY_MS);
        }, REPEAT_DELAY_MS);
        return;
      case '{clear}': onChange(''); return;
      case '{space}':
        // Na busca, sem espaço duplo nem no começo — só atrapalha. No texto
        // livre (senha) o espaço vale como qualquer caractere.
        if (isText) insert(' ');
        else if (value && !value.endsWith(' ')) insert(' ');
        return;
      case '{enter}': onEnter(); return;
      case '{sym}': setLayer('sym'); return;
      case '{abc}': setLayer('abc'); return;
      case '{shift}': {
        // Toque: liga pra uma letra. Toque duplo: trava (Caps). Com trava,
        // um toque desliga.
        const now = Date.now();
        const double = now - lastShiftTap.current < DOUBLE_TAP_MS;
        lastShiftTap.current = now;
        setShift((s) => (s === 'off' ? 'once' : s === 'once' && double ? 'lock' : 'off'));
        return;
      }
      default:
        insert(upper ? key.toUpperCase() : key);
        if (shift === 'once') setShift('off');
    }
  };

  // Centraliza horizontalmente ao montar — em px absolutos, no mesmo
  // referencial usado pelo arraste (ver nota no CSS: `left:50%` não serve
  // aqui por causa do ancestral com `transform` no OrgChart).
  useLayoutEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const container = el.offsetParent as HTMLElement | null;
    const containerW = container?.clientWidth ?? window.innerWidth;
    el.style.left = `${Math.max(0, (containerW - el.offsetWidth) / 2)}px`;
  }, []);

  // ── Arrastar ─────────────────────────────────────────────────────────────
  // Pega em QUALQUER ponto do painel que não seja tecla/botão (alça, borda,
  // vão entre teclas, pré-visualização) — só o cabeçalho era um alvo pequeno
  // demais pro dedo. Manipula `left`/`top` direto no DOM (sem estado) pra não
  // re-renderizar a cada pixel. Usa `offsetLeft`/`offsetTop` (relativos ao
  // containing block real) em vez de getBoundingClientRect(): o OrgChart tem
  // um ancestral com `transform` (tilt 3D), que ancora este `position:fixed`
  // nele e não na viewport — misturar as referências fazia o teclado "pular".
  const dragRef = useRef<{ startX: number; startY: number; baseLeft: number; baseTop: number; pointerId: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPanelPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = overlayRef.current;
    if (!el || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if ((e.target as HTMLElement).closest('button')) return;
    // Não tira o foco do campo que está sendo preenchido.
    e.preventDefault();
    el.style.left = `${el.offsetLeft}px`;
    el.style.top = `${el.offsetTop}px`;
    el.style.bottom = 'auto';
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseLeft: el.offsetLeft,
      baseTop: el.offsetTop,
      pointerId: e.pointerId,
    };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    setDragging(true);
  };

  const onPanelPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragRef.current;
    const el = overlayRef.current;
    if (!st || !el || st.pointerId !== e.pointerId) return;
    const container = el.offsetParent as HTMLElement | null;
    const maxLeft = (container?.clientWidth ?? window.innerWidth) - el.offsetWidth;
    const maxTop = (container?.clientHeight ?? window.innerHeight) - el.offsetHeight;
    // Nunca deixa arrastar pra fora da tela — num painel touch não teria
    // como pegar de volta.
    el.style.left = `${Math.min(Math.max(st.baseLeft + e.clientX - st.startX, 0), Math.max(maxLeft, 0))}px`;
    el.style.top = `${Math.min(Math.max(st.baseTop + e.clientY - st.startY, 0), Math.max(maxTop, 0))}px`;
  };

  const onPanelPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDragging(false);
  };

  const renderKey = (key: string, i: number, r: number) => {
    const isAction = key.startsWith('{');
    const char = upper && !isAction ? key.toUpperCase() : key;
    let label: React.ReactNode = char;
    let aria = char;
    let cls = styles.key;
    let state: string | undefined;

    if (key === '{bksp}') {
      aria = 'Apagar (segure para apagar mais)';
      cls += ` ${styles.keyFn} ${styles.keyWide}`;
      label = (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 5H8l-6 7 6 7h13a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z" /><path d="m17 9-6 6M11 9l6 6" />
        </svg>
      );
    } else if (key === '{shift}') {
      aria = shift === 'lock' ? 'Maiúsculas travadas' : shift === 'once' ? 'Maiúscula ligada' : 'Maiúscula';
      cls += ` ${styles.keyFn} ${styles.keyWide}`;
      state = shift;
      label = (
        <svg width="22" height="22" viewBox="0 0 24 24" fill={shift === 'off' ? 'none' : 'currentColor'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
          <path d="M12 4 3 13h5v6h8v-6h5z" />
          {shift === 'lock' && <path d="M8 22h8" strokeLinecap="round" />}
        </svg>
      );
    } else if (key === '{sym}' || key === '{abc}') {
      aria = key === '{sym}' ? (isText ? 'Símbolos' : 'Símbolos e acentos') : 'Letras';
      cls += ` ${styles.keyFn} ${styles.keyWide}`;
      label = key === '{sym}' ? '?123' : 'ABC';
    } else if (key === '{clear}') {
      aria = 'Limpar tudo';
      cls += ` ${styles.keyFn} ${styles.keyClear}`;
      label = 'Limpar';
    } else if (key === '{space}') {
      aria = 'Espaço';
      cls += ` ${styles.keySpace}`;
      label = <span className={styles.spaceBar} aria-hidden />;
    } else if (key === '{enter}') {
      aria = enterLabel;
      cls += ` ${styles.keyEnter}`;
      label = (
        <>
          {enterLabel === 'Buscar' ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14" /><path d="m13 6 6 6-6 6" />
            </svg>
          )}
          {enterLabel}
        </>
      );
    }

    // Id pela POSIÇÃO, não pelo caractere/camada: ao trocar de camada (?123 ↔
    // ABC) o React reaproveita o mesmo <button> e só troca o rótulo. Se fosse
    // um elemento novo, o botão tocado sairia do DOM no meio do evento e o
    // "fechar ao tocar fora" de quem usa o teclado acharia que o toque foi
    // fora — o teclado fechava ao apertar ?123.
    const id = `${r}-${i}`;
    return (
      <button
        key={id}
        type="button"
        className={cls}
        data-pressed={pressed === id || undefined}
        data-shift={state}
        aria-label={aria}
        // Pointerdown (não click): responde no instante do toque e com
        // preventDefault não tira o foco do campo.
        onPointerDown={(e) => {
          e.preventDefault();
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          setPressed(id);
          press(key);
        }}
        onPointerUp={() => { setPressed(null); stopRepeat(); }}
        onPointerLeave={() => { setPressed(null); stopRepeat(); }}
        onPointerCancel={() => { setPressed(null); stopRepeat(); }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {label}
        {/* Balão com a letra ampliada acima do dedo (só letras/símbolos). */}
        {!isAction && <span className={styles.bubble} aria-hidden>{char}</span>}
      </button>
    );
  };

  const shown = masked ? '•'.repeat(value.length) : value;

  return (
    <div
      className={`${styles.overlay} ${isText ? styles.overlayText : ''} ${dragging ? styles.dragging : ''}`}
      ref={overlayRef}
      role="group"
      aria-label="Teclado virtual"
      onPointerDown={onPanelPointerDown}
      onPointerMove={onPanelPointerMove}
      onPointerUp={onPanelPointerUp}
      onPointerCancel={onPanelPointerUp}
    >
      <div className={styles.header}>
        <span className={styles.grip} aria-hidden />
        {/* Pré-visualização: com o teclado embaixo e o campo lá em cima, o
            olho não precisa ficar indo e voltando. */}
        <div className={styles.preview} aria-live={masked ? 'off' : 'polite'}>
          {masked ? (
            <svg className={styles.previewIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          ) : (
            <svg className={styles.previewIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              {isText
                ? <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>
                : <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>}
            </svg>
          )}
          {value
            ? <span className={`${styles.previewText} ${masked ? styles.previewMasked : ''}`}>{shown}<span className={styles.caret} aria-hidden /></span>
            : <span className={styles.previewPlaceholder}><span className={styles.caret} aria-hidden />{placeholder}</span>}
        </div>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Fechar teclado">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className={styles.suggestions}>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              className={styles.suggestion}
              onPointerDown={(e) => { e.preventDefault(); vibrate(); insert(s); }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className={styles.keys}>
        {ROWS[variant][layer].map((row, r) => (
          <div key={r} className={`${styles.row} ${layer === 'abc' && r === 2 ? styles.rowInset : ''}`}>
            {row.map((k, i) => renderKey(k, i, r))}
          </div>
        ))}
      </div>
    </div>
  );
}
