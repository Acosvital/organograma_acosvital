'use client';

import { Suspense, useActionState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { signIn } from './actions';
import { LOGO_URL } from '@/lib/constants';
import styles from './page.module.css';

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/admin';

  const [state, action, pending] = useActionState(signIn, null);
  const formRef  = useRef<HTMLFormElement>(null);
  const latRef   = useRef<HTMLInputElement>(null);
  const lonRef   = useRef<HTMLInputElement>(null);
  const geoReady = useRef(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (geoReady.current) {
      geoReady.current = false;
      return;
    }

    e.preventDefault();
    const form = formRef.current;
    if (!form) return;

    const submit = () => {
      geoReady.current = true;
      form.requestSubmit();
    };

    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (latRef.current) latRef.current.value = String(pos.coords.latitude);
          if (lonRef.current) lonRef.current.value = String(pos.coords.longitude);
          submit();
        },
        () => submit(),
        { timeout: 5000, maximumAge: 60_000 },
      );
    } else {
      submit();
    }
  }

  return (
    <form ref={formRef} action={action} onSubmit={handleSubmit} className={styles.form}>
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="lat" ref={latRef} />
      <input type="hidden" name="lon"  ref={lonRef} />

      <label className={styles.label}>
        E-mail
        <input
          className={styles.input}
          type="email"
          name="email"
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
          name="password"
          placeholder="••••••••"
          autoComplete="current-password"
          required
        />
      </label>

      {state?.error && (
        <p className={styles.error}>{state.error}</p>
      )}

      <button className={styles.btn} type="submit" disabled={pending}>
        {pending ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logoWrap}>
          <img src={LOGO_URL} alt="Açosvital" className={styles.logo} />
        </div>

        <h1 className={styles.title}>Entrar no sistema</h1>
        <p className={styles.sub}>Acesso restrito a administradores</p>

        <Suspense fallback={<div className={styles.formSkeleton} />}>
          <LoginForm />
        </Suspense>

        <p className={styles.hint}>
          Problemas? Fale com o administrador do sistema.
        </p>
      </div>
    </div>
  );
}
