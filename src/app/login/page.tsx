'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { LOGO_URL } from '@/lib/constants';
import { readStoredMode } from '@/lib/kioskMode';
import OnScreenKeyboard from '@/components/OnScreenKeyboard/OnScreenKeyboard';
import styles from './page.module.css';

type Field = 'email' | 'password';

const EMAIL_SUGGESTIONS = ['@acosvital.com.br', '.com.br', '.com'];

/**
 * O teclado virtual abre sozinho ao tocar num campo quando o aparelho é um
 * totem/TV (modo de quiosque salvo) ou uma tela touch grande sem teclado
 * físico. No celular fica o teclado nativo (autopreenchimento de senha etc.)
 * e no desktop o físico — mas o botão de teclado dentro do campo abre o
 * virtual em qualquer aparelho.
 */
function prefersVirtualKeyboard(): boolean {
  if (readStoredMode() !== 'none') return true;
  return window.matchMedia('(pointer: coarse)').matches && window.innerWidth >= 1024;
}

function KeyboardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M9 16h6M10 13h4" />
    </svg>
  );
}

function captureGeolocation(): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000, maximumAge: 60_000 },
    );
  });
}

function LoginForm({ onKeyboardChange }: { onKeyboardChange?: (open: boolean) => void }) {
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/';

  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]     = useState('');
  const [pending, setPending] = useState(false);

  // ── Teclado virtual ────────────────────────────────────────────────────
  const [virtualPreferred, setVirtualPreferred] = useState(false);
  const [kbField, setKbField] = useState<Field | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setVirtualPreferred(prefersVirtualKeyboard()); }, []);

  // Avisa a página (sobe o cartão pra não ficar atrás do teclado).
  useEffect(() => { onKeyboardChange?.(kbField !== null); }, [kbField, onKeyboardChange]);

  // Fecha ao tocar fora do formulário (o teclado é renderizado dentro dele).
  useEffect(() => {
    if (!kbField) return;
    const outside = (e: PointerEvent) => {
      // composedPath (fixado no disparo) em vez de contains(): uma tecla do
      // teclado virtual pode sair do DOM no meio do evento e parecer "fora".
      if (formRef.current && !e.composedPath().includes(formRef.current)) setKbField(null);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [kbField]);

  const openKeyboard = (field: Field) => {
    setKbField(field);
    (field === 'email' ? emailRef : passwordRef).current?.focus();
  };

  const kbEnter = () => {
    if (kbField === 'email') {
      openKeyboard('password');
    } else {
      setKbField(null);
      formRef.current?.requestSubmit();
    }
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError('');

    const geo = await captureGeolocation();

    const result = await signIn('credentials', { email, password, redirect: false });

    if (!result?.ok) {
      setError('E-mail ou senha incorretos.');
      setPending(false);
      return;
    }

    if (geo) {
      fetch('/api/auth/geo-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geo),
      }).catch(() => {});
    }

    window.location.href = next;
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form} ref={formRef}>
      <label className={styles.label}>
        E-mail
        <span className={styles.inputWrap}>
          <input
            ref={emailRef}
            className={`${styles.input} ${kbField === 'email' ? styles.inputKbActive : ''}`}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com.br"
            autoComplete="email"
            // Com o teclado virtual preferido, não deixa o nativo subir junto.
            inputMode={virtualPreferred ? 'none' : 'email'}
            onFocus={() => { if (virtualPreferred) setKbField('email'); else if (kbField) setKbField('email'); }}
            // O campo continua focado depois de fechar o teclado — tocar de
            // novo não dispara onFocus, e com inputMode="none" nada abriria.
            onClick={() => { if (virtualPreferred) setKbField('email'); }}
            // Digitou num teclado físico de verdade: o virtual sai da frente.
            onKeyDown={() => setKbField(null)}
            required
          />
          <button
            type="button"
            className={styles.kbToggle}
            data-on={kbField === 'email' || undefined}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => (kbField === 'email' ? setKbField(null) : openKeyboard('email'))}
            aria-label={kbField === 'email' ? 'Fechar teclado virtual' : 'Abrir teclado virtual'}
          >
            <KeyboardIcon />
          </button>
        </span>
      </label>

      <label className={styles.label}>
        Senha
        <span className={styles.inputWrap}>
          <input
            ref={passwordRef}
            className={`${styles.input} ${kbField === 'password' ? styles.inputKbActive : ''}`}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            inputMode={virtualPreferred ? 'none' : 'text'}
            onFocus={() => { if (virtualPreferred) setKbField('password'); else if (kbField) setKbField('password'); }}
            onClick={() => { if (virtualPreferred) setKbField('password'); }}
            onKeyDown={() => setKbField(null)}
            required
          />
          <button
            type="button"
            className={styles.kbToggle}
            data-on={kbField === 'password' || undefined}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => (kbField === 'password' ? setKbField(null) : openKeyboard('password'))}
            aria-label={kbField === 'password' ? 'Fechar teclado virtual' : 'Abrir teclado virtual'}
          >
            <KeyboardIcon />
          </button>
        </span>
      </label>

      {kbField && (
        <OnScreenKeyboard
          // Troca de campo remonta (camada/shift voltam ao padrão).
          key={kbField}
          variant="text"
          value={kbField === 'email' ? email : password}
          onChange={kbField === 'email' ? setEmail : setPassword}
          onEnter={kbEnter}
          onClose={() => setKbField(null)}
          placeholder={kbField === 'email' ? 'seu@email.com.br' : 'Digite sua senha'}
          enterLabel={kbField === 'email' ? 'Próximo' : 'Entrar'}
          masked={kbField === 'password'}
          suggestions={kbField === 'email' ? EMAIL_SUGGESTIONS.filter((x) => !(x.startsWith('@') && email.includes('@'))) : []}
        />
      )}

      {error && <p className={styles.error}>{error}</p>}

      <button className={styles.btn} type="submit" disabled={pending}>
        {pending ? 'Entrando…' : 'Entrar'}
      </button>

      <div className={styles.divider}><span>ou</span></div>

      <button
        type="button"
        className={styles.msButton}
        onClick={() => signIn('azure-ad', { callbackUrl: next })}
      >
        <svg className={styles.msIcon} viewBox="0 0 23 23" xmlns="http://www.w3.org/2000/svg">
          <path d="M0 0h23v23H0z" fill="#f3f3f3" />
          <path d="M1 1h10v10H1z" fill="#f35325" />
          <path d="M12 1h10v10H12z" fill="#81bc06" />
          <path d="M1 12h10v10H1z" fill="#05a6f0" />
          <path d="M12 12h10v10H12z" fill="#ffba08" />
        </svg>
        <span>Entrar com Microsoft</span>
      </button>
    </form>
  );
}

export default function LoginPage() {
  const [kbOpen, setKbOpen] = useState(false);
  return (
    <div className={`${styles.page} ${kbOpen ? styles.pageKb : ''}`}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.brand}>
            <img src={LOGO_URL} alt="Açosvital" className={styles.logo} />
            <span className={styles.brandSep} aria-hidden="true" />
            <span className={styles.brandName}>Organograma</span>
          </div>
          <h1 className={styles.title}>Bem-vindo</h1>
          <p className={styles.sub}>Acesse sua conta corporativa para continuar</p>
        </div>

        <Suspense fallback={<div className={styles.formSkeleton} />}>
          <LoginForm onKeyboardChange={setKbOpen} />
        </Suspense>

        <p className={styles.loginInfo}>
          Ao entrar, você concorda que o processamento de dados segue os padrões de
          conformidade do <span>Grupo Aços Vital</span>.
        </p>
      </div>
    </div>
  );
}
