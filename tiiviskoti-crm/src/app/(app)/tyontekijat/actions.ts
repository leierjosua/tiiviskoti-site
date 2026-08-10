'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { requireManager, requireStaff } from '@/lib/session';
import { adminAuthConfigured, findAuthUserByEmail, supabaseAdmin } from '@/lib/supabase-admin';

export type ActionState = { error?: string; ok?: string };

const staffSchema = z.object({
  email: z.string().email('Tarkista sähköpostiosoite'),
  fullName: z.string().min(1, 'Nimi puuttuu'),
  phone: z.string().optional(),
  role: z.enum(['owner', 'admin', 'installer']),
});

/**
 * Lisää työntekijän. Authin tunnusta ei luoda tässä, vaan vasta kun
 * omistaja asettaa henkilölle salasanan (`setStaffPassword`) — silloin
 * tunnus ja salasana syntyvät samalla kertaa. `tk.staff.user_id` sidotaan
 * joko siinä yhteydessä tai ensimmäisellä kirjautumisella sähköpostin
 * perusteella (ks. lib/session.ts).
 */
export async function addStaff(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager();

  const parsed = staffSchema.safeParse({
    email: String(formData.get('email') ?? '').trim().toLowerCase(),
    fullName: String(formData.get('fullName') ?? '').trim(),
    phone: String(formData.get('phone') ?? '').trim() || undefined,
    role: String(formData.get('role') ?? 'installer'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Tarkista tiedot' };

  const { email, fullName, phone, role } = parsed.data;
  const existing = await sql`select 1 from tk.staff where lower(email) = ${email}`;
  if (existing.length > 0) return { error: 'Sähköposti on jo listalla.' };

  await sql`
    insert into tk.staff (email, full_name, phone, role)
    values (${email}, ${fullName}, ${phone ?? null}, ${role})
  `;

  revalidatePath('/tyontekijat');
  return { ok: `${fullName} lisätty. Aseta hänelle vielä salasana, niin tunnus syntyy.` };
}

/* Salasanan vähimmäispituus. Supabasen oma oletus on 6, mikä on liian
   vähän tunnukselle jonka joku toinen asettaa ja välittää suullisesti.
   Yläraja 72 ei ole makuasia: bcrypt katkaisee siitä, joten pidempi osa
   jäisi hiljaa huomiotta. */
const PASSWORD_MIN = 12;
const PASSWORD_MAX = 72;

const passwordSchema = z.object({
  staffId: z.string().uuid('Valitse työntekijä'),
  password: z.string()
    .min(PASSWORD_MIN, `Salasanan on oltava vähintään ${PASSWORD_MIN} merkkiä`)
    .max(PASSWORD_MAX, `Salasana saa olla enintään ${PASSWORD_MAX} merkkiä`),
});

/**
 * Asettaa työntekijälle salasanan — ja luo Authin tunnuksen jos sitä ei
 * vielä ole.
 *
 * MIKSI VAIN OMISTAJA: toisen salasanan asettaminen on täysi haltuunotto
 * siitä tunnuksesta. Jos tämän saisi tehdä `admin`-roolilla, toimistokäyttäjä
 * voisi asettaa omistajalle salasanan ja ottaa koko järjestelmän haltuun.
 * `requireManager` ei siis riitä tähän, vaikka se riittää muualla sivulla.
 *
 * MIKSI TÄMÄ ON OLEMASSA: `addStaff` luo vain `tk.staff`-rivin, ja
 * kirjautuminen vaatii lisäksi Authin tunnuksen. Ennen tätä se piti luoda
 * käsin Supabasen hallinnasta, eli uuden asentajan lisääminen ei onnistunut
 * pelkästään tässä panelissa.
 *
 * Salasanaa ei kirjata lokiin, ei paluuarvoon eikä kantaan. Ainoa paikka
 * jossa se on, on Authin oma tiiviste.
 */
export async function setStaffPassword(
  _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const me = await requireStaff();
  if (me.role !== 'owner') return { error: 'Vain omistaja voi asettaa salasanoja.' };

  if (!adminAuthConfigured()) {
    return { error: 'SUPABASE_SECRET_KEY puuttuu ympäristöstä — salasanan asetus ei ole käytössä.' };
  }

  const parsed = passwordSchema.safeParse({
    staffId: String(formData.get('staffId') ?? ''),
    password: String(formData.get('password') ?? ''),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Tarkista tiedot' };

  const { staffId, password } = parsed.data;

  const [person] = await sql<{ email: string; full_name: string; user_id: string | null }[]>`
    select email, full_name, user_id from tk.staff where id = ${staffId}
  `;
  if (!person) return { error: 'Työntekijää ei löytynyt.' };

  const admin = supabaseAdmin();

  try {
    /* Authin tunnus voi löytyä kahta reittiä: `tk.staff.user_id` on
       täytetty (henkilö on kirjautunut kerran) tai tunnus on olemassa
       samalla sähköpostilla mutta sitomatta. Jälkimmäinen on tavallinen
       tilanne, koska `user_id` sidotaan vasta ensimmäisellä kirjautumisella. */
    const existing = person.user_id
      ? { id: person.user_id }
      : await findAuthUserByEmail(person.email);

    if (existing) {
      const { error } = await admin.auth.admin.updateUserById(existing.id, { password });
      if (error) return { error: `Salasanaa ei voitu vaihtaa: ${error.message}` };

      if (!person.user_id) {
        await sql`update tk.staff set user_id = ${existing.id} where id = ${staffId}`;
      }
      revalidatePath('/tyontekijat');
      return { ok: `${person.full_name}: salasana vaihdettu.` };
    }

    /* `email_confirm: true` — osoite on jo tiedossa ja omistaja vastaa
       siitä. Ilman tätä Supabase lähettäisi vahvistuspostin eikä
       kirjautuminen onnistuisi ennen kuin siihen on klikattu. */
    const { data, error } = await admin.auth.admin.createUser({
      email: person.email,
      password,
      email_confirm: true,
    });
    if (error) return { error: `Tunnusta ei voitu luoda: ${error.message}` };

    if (data.user) {
      await sql`update tk.staff set user_id = ${data.user.id} where id = ${staffId}`;
    }
    revalidatePath('/tyontekijat');
    return { ok: `${person.full_name}: tunnus luotu ja salasana asetettu.` };
  } catch (e) {
    /* Virheteksti lokiin sellaisenaan, mutta EI salasanaa: se ei ole
       missään näistä muuttujista, eikä sitä saa vahingossakaan liittää. */
    console.error('setStaffPassword:', staffId, e instanceof Error ? e.message : e);
    return { error: 'Salasanan asetus epäonnistui. Tarkista lokit.' };
  }
}

export async function setStaffActive(formData: FormData) {
  const me = await requireManager();
  const id = String(formData.get('id') ?? '');
  const active = String(formData.get('active') ?? '') === 'true';

  // Omistaja ei saa poistaa itseään käytöstä — muuten järjestelmään ei
  // välttämättä pääse enää kukaan sisään.
  if (id === me.id) return;

  await sql`update tk.staff set active = ${active} where id = ${id}`;
  revalidatePath('/tyontekijat');
}
