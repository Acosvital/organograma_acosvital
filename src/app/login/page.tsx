'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { LOGO_URL } from '@/lib/constants';
import styles from './page.module.css';

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

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/';

  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]     = useState('');
  const [pending, setPending] = useState(false);

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
    <form onSubmit={handleSubmit} className={styles.form}>
      <label className={styles.label}>
        E-mail
        <input
          className={styles.input}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="seu@email.com.br"
          autoComplete="email"
          required
        />
      </label>

      <label className={styles.label}>
        Senha
        <input
          className={styles.input}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
          required
        />
      </label>

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
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <img src={LOGO_URL} alt="Açosvital" className={styles.logo} />
          <h1 className={styles.title}>Bem-vindo ao Organograma</h1>
          <p className={styles.sub}>Acesse sua conta corporativa para continuar</p>
        </div>

        <Suspense fallback={<div className={styles.formSkeleton} />}>
          <LoginForm />
        </Suspense>

        <p className={styles.loginInfo}>
          Ao entrar, você concorda que o processamento de dados segue os padrões de
          conformidade do <span>Grupo Aços Vital</span>.
        </p>
      </div>
    </div>
  );
}
