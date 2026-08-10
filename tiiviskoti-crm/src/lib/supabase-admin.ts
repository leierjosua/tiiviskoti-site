import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/* =========================================================
   Supabasen hallintayhteys (Auth Admin API).

   TÄMÄ ON ERI AVAIN KUIN MUUALLA. `NEXT_PUBLIC_SUPABASE_ANON_KEY` on
   julkinen ja menee selaimeen asti; `SUPABASE_SECRET_KEY` ohittaa KAIKKI
   käyttöoikeustarkistukset ja voi luoda, muokata ja poistaa minkä tahansa
   käyttäjän. Siksi:

   - `server-only` — tämä tiedosto ei saa päätyä selainnippuun. Import
     selainkomponentista on käännösaikainen virhe, ei ajonaikainen yllätys.
   - Muuttujan nimessä EI ole `NEXT_PUBLIC_`-etuliitettä. Jos siihen joskus
     lisätään sellainen, avain vuotaa jokaiselle sivunlataajalle.
   - Kutsujan on aina tarkistettava käyttöoikeus itse. Tämä client ei
     tunne rooleja eikä RLS koske sitä.

   HUOM avaimen muodosta: Supabasen vanhat `service_role`-JWT:t poistettiin
   käytöstä 2026-07-26. Uusi avain on muotoa `sb_secret_…` ja löytyy
   Supabasen hallinnasta kohdasta Project Settings → API Keys.

   Ilman avainta sovellus toimii normaalisti — vain salasanan asetus on
   pois käytöstä, ja käyttöliittymä kertoo sen. Se on tarkoituksellista:
   CRM ei saa kaatua siihen että valinnainen avain puuttuu.
   ========================================================= */

const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

/** Onko salasanan asetus mahdollista tässä ympäristössä. */
export function adminAuthConfigured(): boolean {
  return Boolean(SECRET_KEY && URL);
}

export function supabaseAdmin(): SupabaseClient {
  if (!SECRET_KEY || !URL) {
    throw new Error(
      'SUPABASE_SECRET_KEY puuttuu — salasanan asetus ei ole käytössä. ' +
      'Hae avain Supabasen hallinnasta (Project Settings → API Keys) ja ' +
      'vie se tiiviskoti-crm-projektin ympäristömuuttujaksi.',
    );
  }
  return createClient(URL, SECRET_KEY, {
    // Palvelinpuolen kertakäyttöyhteys: ei istuntoa jota ylläpitää eikä
    // tokenia jota uusia. Ilman näitä client yrittäisi tallentaa istunnon.
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Authin käyttäjä sähköpostilla, tai null.
 *
 * MIKSI LISTAAMALLA: Auth Admin APIssa ei ole hakua sähköpostilla, vain
 * `getUserById` ja sivutettu `listUsers`. Tässä yrityksessä on kourallinen
 * tunnuksia, joten sivujen läpikäynti on halvempi kuin oma hakemisto joka
 * voisi ajautua eri tahtiin Authin kanssa. Raja on 10 sivua × 200, eli
 * 2000 käyttäjää — jos se joskus ylittyy, tämä on kirjoitettava uusiksi.
 */
export async function findAuthUserByEmail(email: string): Promise<{ id: string } | null> {
  const admin = supabaseAdmin();
  const target = email.trim().toLowerCase();

  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Authin käyttäjiä ei voitu lukea: ${error.message}`);

    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return { id: hit.id };
    if (data.users.length < 200) return null;
  }
  return null;
}
