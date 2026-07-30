import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { sql } from './db';

/* =========================================================
   Kirjautuminen ja käyttöoikeus.

   Supabase Auth hoitaa vain tunnistautumisen. Se kuka saa tehdä mitä
   ratkeaa `tk.staff`-taulusta: authin käyttäjä ilman aktiivista
   staff-riviä ei pääse mihinkään.
   ========================================================= */

export type Staff = {
  id: string;
  email: string;
  fullName: string;
  role: 'owner' | 'admin' | 'installer';
};

export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          // Server Component ei saa kirjoittaa evästeitä. Istunnon
          // uusiminen tapahtuu middlewaressa, joten tämä saa epäonnistua.
          try {
            for (const { name, value, options } of list) cookieStore.set(name, value, options);
          } catch { /* luettu Server Componentista */ }
        },
      },
    },
  );
}

/**
 * Kirjautunut työntekijä, tai null.
 *
 * Kutsu sidotaan `tk.staff`-riviin ensimmäisellä kirjautumisella:
 * kutsuttaessa tiedetään vain sähköposti, `user_id` täytetään vasta kun
 * henkilö oikeasti kirjautuu.
 */
export async function currentStaff(): Promise<Staff | null> {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;

  /* Luku ensin, kirjoitus vain kun se on tarpeen.
     Tämä oli aiemmin pelkkä UPDATE … RETURNING, joten JOKA sivulataus teki
     kirjoituksen kantaan. Kirjoitus on tarpeen vain kertaalleen, kun kutsuttu
     henkilö kirjautuu ensimmäisen kerran ja `user_id` sidotaan riviin. */
  const rows = await sql<{
    id: string; email: string; full_name: string; role: Staff['role']; user_id: string | null;
  }[]>`
    select id, email, full_name, role, user_id
      from tk.staff
     where active
       and (user_id = ${user.id} or (user_id is null and lower(email) = lower(${user.email})))
     limit 1
  `;
  const row = rows[0];
  if (!row) return null;

  if (row.user_id === null) {
    await sql`update tk.staff set user_id = ${user.id} where id = ${row.id}`;
  }

  return { id: row.id, email: row.email, fullName: row.full_name, role: row.role };
}

export async function requireStaff(): Promise<Staff> {
  const staff = await currentStaff();
  if (!staff) redirect('/login');
  return staff;
}

/** Kalentereita, työntekijöitä ja asetuksia saa muokata vain omistaja tai admin. */
export async function requireManager(): Promise<Staff> {
  const staff = await requireStaff();
  if (staff.role === 'installer') redirect('/');
  return staff;
}
