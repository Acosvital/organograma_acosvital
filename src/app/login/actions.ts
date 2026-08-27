'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { rateLimit, getClientIp } from '@/lib/rateLimit';
import fs from 'fs';
import path from 'path';

export async function signIn(
  _prevState: { error: string } | null,
  formData: FormData,
): Promise<{ error: string }> {
  const email    = formData.get('email')    as string;
  const password = formData.get('password') as string;
  const next     = formData.get('next')     as string | null;
  const lat      = formData.get('lat')      as string | null;
  const lon      = formData.get('lon')      as string | null;

  if (!email || !password) {
    return { error: 'Preencha e-mail e senha.' };
  }

  // Freio anti brute-force: limita tentativas de login por IP (bucket 'auth',
  // 10/min) ANTES de bater no Supabase. Server action não recebe Request, então
  // o IP vem de headers().
  const ip = getClientIp(await headers());
  const rl = rateLimit(ip, 'auth');
  if (!rl.ok) {
    return { error: `Muitas tentativas de login. Aguarde ${Math.ceil(rl.retryAfterMs / 1000)}s e tente de novo.` };
  }

  // Qualquer falha aqui (Supabase indisponível, erro de rede, etc.) precisa
  // virar uma mensagem segura de login — nunca deixar a exceção escapar pro
  // boundary de erro genérico da aplicação.
  let signInError: { message: string } | null = null;
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    signInError = error;
  } catch {
    return { error: 'Não foi possível entrar. Tente novamente em instantes.' };
  }

  if (signInError) {
    if (signInError.message.includes('Invalid login credentials')) {
      return { error: 'E-mail ou senha incorretos.' };
    }
    if (signInError.message.includes('Email not confirmed')) {
      return { error: 'Confirme seu e-mail antes de entrar.' };
    }
    // Não repassa a mensagem crua do provedor de auth ao usuário — pode
    // conter detalhes internos. Mensagem genérica e segura.
    return { error: 'Não foi possível entrar. Tente novamente em instantes.' };
  }

  if (lat && lon) {
    try {
      const logPath = path.join(process.cwd(), 'geo-log.json');
      const entry = { email, lat: parseFloat(lat), lon: parseFloat(lon), at: new Date().toISOString() };
      const existing = fs.existsSync(logPath)
        ? JSON.parse(fs.readFileSync(logPath, 'utf-8'))
        : [];
      existing.push(entry);
      fs.writeFileSync(logPath, JSON.stringify(existing, null, 2), 'utf-8');
    } catch {}
  }

  // TEMPORÁRIO (visita Bradesco): sempre passa pela tela de boas-vindas antes
  // do destino normal. Reverter para `next && next.startsWith('/') ? next : '/admin'`
  // depois da visita.
  redirect('/bem-vindo');
}

export async function signOut(): Promise<void> {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    try {
      const supabase = await createClient();
      await supabase.auth.signOut();
    } catch {
      // ignora erros de rede; redireciona para login de qualquer forma
    }
  }
  redirect('/login');
}
