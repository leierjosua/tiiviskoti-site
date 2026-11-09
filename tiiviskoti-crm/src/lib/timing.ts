import 'server-only';

/* =========================================================
   Hitaan tai jumittuvan kutsun paljastin.

   9.11.2026 kirjautuneet sivut jäivät latausnäkymään Vercelin katkoon asti
   (ensin 300 s, sitten 60 s), mutta lokiin jäi vain "Task timed out" —
   ei tietoa SIITÄ, mikä odotus ei palannut. Kanta, Auth ja Storage
   vastasivat ulkopuolelta kaikki heti, joten syy on löydettävä sisältä.

   `timed('nimi', lupaus)`:
   - yli 2 s → `[hidas] nimi 3412 ms` lokiin (Vercel → Logs)
   - yli 20 s → `[jumi] nimi` lokiin ja virhe, jolloin sivu näyttää
     virhenäkymän "Yritä uudelleen" -napilla eikä pyöri tyhjänä minuuttia.
   Itse kutsua ei peruta (postgres.js:n kyselyä ei voi luotettavasti
   perua poolerin läpi); virhe vain vapauttaa sivun.
   ========================================================= */

const SLOW_MS = 2_000;
const HANG_MS = 20_000;

export async function timed<T>(label: string, work: PromiseLike<T>, hangMs = HANG_MS): Promise<T> {
  const start = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const hang = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      console.error(`[jumi] ${label} ei palannut ${hangMs} ms:ssa`);
      reject(new Error(`Aikakatkaisu: ${label}`));
    }, hangMs);
  });
  try {
    return await Promise.race([Promise.resolve(work), hang]);
  } finally {
    clearTimeout(timer);
    const ms = Date.now() - start;
    if (ms >= SLOW_MS && ms < hangMs) console.warn(`[hidas] ${label} ${ms} ms`);
  }
}
