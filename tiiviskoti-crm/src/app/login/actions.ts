'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { supabaseServer } from '@/lib/session';
import { sql } from '@/lib/db';

const schema = z.object({
  email: z.string().email('Tarkista sähköpostiosoite'),
  password: z.string().min(1, 'Anna salasana'),
});

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: String(formData.get('email') ?? '').trim(),
    password: String(formData.get('password') ?? ''),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Tarkista tiedot' };
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  // Väärä salasana on vain yksi mahdollinen syy. Aiemmin kaikki virheet
  // näytettiin "ei täsmää" -viestinä, mikä johti harhaan silloin kun kyse
  // oli esim. vahvistamattomasta sähköpostista tai kutsurajasta. Koodi
  // näytetään, jotta syy selviää ilman palvelinlokia.
  if (error) {
    const known: Record<string, string> = {
      invalid_credentials: 'Sähköposti tai salasana ei täsmää.',
      email_not_confirmed: 'Sähköpostia ei ole vahvistettu.',
      over_request_rate_limit: 'Liian monta yritystä. Odota hetki ja yritä uudelleen.',
      user_banned: 'Tunnus on jäädytetty.',
    };
    const message = known[error.code ?? ''];
    return {
      error: message ?? `Kirjautuminen ei onnistunut (${error.code ?? error.status ?? 'tuntematon'}): ${error.message}`,
    };
  }
  if (!data.user?.email) {
    return { error: 'Kirjautuminen palautti tunnuksen ilman sähköpostia.' };
  }

  // Authin käyttäjä ei vielä riitä: pääsy ratkeaa tk.staff-rivistä.
  // Jos sitä ei ole, istunto kirjataan heti ulos, ettei puolinainen
  // sisäänkirjautuminen jää roikkumaan.
  const rows = await sql<{ id: string }[]>`
    select id from tk.staff
     where active and (user_id = ${data.user.id} or lower(email) = lower(${data.user.email}))
     limit 1
  `;
  if (rows.length === 0) {
    await supabase.auth.signOut();
    return { error: 'Tunnuksella ei ole käyttöoikeutta tähän järjestelmään.' };
  }

  redirect('/');
}

export async function logout() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect('/login');
}
