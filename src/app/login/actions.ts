'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
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

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.message.includes('Invalid login credentials')) {
      return { error: 'E-mail ou senha incorretos.' };
    }
    if (error.message.includes('Email not confirmed')) {
      return { error: 'Confirme seu e-mail antes de entrar.' };
    }
    return { error: error.message };
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

  redirect(next && next.startsWith('/') ? next : '/admin');
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
