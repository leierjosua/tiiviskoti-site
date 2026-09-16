'use client';

import { useRef, useState } from 'react';
import { Card, CardHeader, Empty } from '@/components/ui';
import { confirmJobPhoto, deleteJobPhoto, prepareJobPhoto, updateJobPhotoCaption } from './photo-actions';

/* =========================================================
   Työn kuvat.

   Tarkoitus on muistaa missä oltiin: mikä ikkuna vuotaa, mistä ovesta
   mennään sisään, mikä on ovikoodi. Kuvat eivät mene asiakkaalle.

   Kuvateksti tallentuu kentästä poistuttaessa eikä erillisellä napilla.
   Puhelimella seisten napin etsiminen on se kohta jossa teksti jää
   kirjoittamatta — ja kuvateksti on juuri se mikä tekee kuvasta
   muistiinpanon eikä pelkkää kuvaa.

   LATAUS MENEE SUORAAN STORAGEEN, ei palvelimen kautta. Server actionin
   rungolle on Next.js:ssä oletusraja 1 MB ja puhelimen kamerakuva on 2–8 MB,
   joten aiemmin iso kuva epäonnistui HILJAA: pieni meni läpi, isosta ei
   tullut edes virheilmoitusta. Palvelimelta pyydetään vain kertakäyttöinen
   allekirjoitus, selain lataa tiedoston ja palvelin kirjaa rivin.
   ========================================================= */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const BUCKET = 'tyokuvat';
/** Sama raja kuin palvelimella (`MAX_PHOTO_BYTES`). */
const MAX_BYTES = 15 * 1024 * 1024;

export type PhotoView = {
  id: string; caption: string | null; url: string | null; createdAt: string;
};

export function JobPhotos({ jobId, photos, canEdit }: {
  jobId: string; photos: PhotoView[]; canEdit: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [viesti, setViesti] = useState<{ ok?: string; error?: string }>({});

  /* Kuvat yksi kerrallaan: yhden epäonnistuminen ei saa kaataa muita, ja
     puhelimen yhteydellä rinnakkainen lataus vain hidastaisi. */
  async function lataa(files: File[]) {
    setPending(true);
    setViesti({});
    let onnistui = 0;
    const viat: string[] = [];

    for (const file of files) {
      if (file.size > MAX_BYTES) { viat.push(`${file.name}: liian suuri (yli 15 MB).`); continue; }
      try {
        const lupa = await prepareJobPhoto(jobId, file.type);
        if ('error' in lupa) { viat.push(`${file.name}: ${lupa.error}`); continue; }

        const res = await fetch(
          `${SUPABASE_URL}/storage/v1/object/upload/sign/${BUCKET}/${lupa.path}?token=${encodeURIComponent(lupa.token)}`,
          { method: 'PUT', headers: { 'content-type': file.type }, body: file },
        );
        if (!res.ok) { viat.push(`${file.name}: lataus epäonnistui (${res.status}).`); continue; }

        const tulos = await confirmJobPhoto(jobId, lupa.path);
        if (tulos.error) viat.push(`${file.name}: ${tulos.error}`); else onnistui++;
      } catch (e) {
        viat.push(`${file.name}: ${e instanceof Error ? e.message : 'lataus epäonnistui'}`);
      }
    }

    setPending(false);
    if (inputRef.current) inputRef.current.value = '';
    setViesti({
      ok: onnistui > 0 ? `${onnistui} kuva${onnistui === 1 ? '' : 'a'} tallennettu.` : undefined,
      error: viat.length ? viat.join(' ') : undefined,
    });
  }

  return (
    <Card>
      <CardHeader
        title="Kuvat"
        action={<span className="text-xs text-faint">Vain sisäiseen käyttöön — eivät näy asiakkaalle</span>}
      />

      {canEdit && (
        <div className="border-b border-line px-4 py-3">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            disabled={pending}
            /* Puhelimessa tämä avaa kameran suoraan. Tietokoneella selain
               jättää sen huomiotta ja näyttää tavallisen tiedostovalinnan. */
            capture="environment"
            onChange={(e) => {
              const files = [...(e.currentTarget.files ?? [])].filter((f) => f.size > 0);
              if (files.length) void lataa(files);
            }}
            className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0
                       file:bg-accent file:px-3 file:py-2 file:text-sm file:font-medium
                       file:text-accent-ink hover:file:bg-accent/90"
          />
          {pending && <p className="mt-2 text-xs text-muted">Tallennetaan…</p>}
          {viesti.ok && <p className="mt-2 text-xs text-accent">{viesti.ok}</p>}
          {viesti.error && <p className="mt-2 text-xs text-red-400">{viesti.error}</p>}
        </div>
      )}

      {photos.length === 0 ? (
        <Empty>
          Ei kuvia. {canEdit ? 'Kuvaa kartoituskäynnillä se mitä et muista viikon päästä.' : ''}
        </Empty>
      ) : (
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((p) => (
            <figure key={p.id} className="space-y-1.5">
              <div className="relative overflow-hidden rounded-md border border-line bg-ink-800">
                {p.url ? (
                  <a href={p.url} target="_blank" rel="noreferrer">
                    {/* Tavallinen img eikä next/image: osoite on allekirjoitettu
                        ja vanhenee tunnissa, joten sitä ei voi optimoida
                        välimuistiin ilman että linkki ehtii kuolla. */}
                    <img src={p.url} alt={p.caption ?? ''} loading="lazy"
                         className="aspect-square w-full object-cover" />
                  </a>
                ) : (
                  <div className="flex aspect-square items-center justify-center text-xs text-faint">
                    Kuvaa ei voitu avata
                  </div>
                )}
                {canEdit && (
                  <form action={deleteJobPhoto} className="absolute right-1 top-1">
                    <input type="hidden" name="id" value={p.id} />
                    <button
                      type="submit"
                      title="Poista kuva"
                      className="rounded bg-ink-900/80 px-1.5 py-0.5 text-xs text-muted hover:text-red-400"
                    >
                      ✕
                    </button>
                  </form>
                )}
              </div>
              {canEdit ? (
                <form action={updateJobPhotoCaption}>
                  <input type="hidden" name="id" value={p.id} />
                  <input
                    name="caption"
                    defaultValue={p.caption ?? ''}
                    placeholder="Mikä tässä on?"
                    onBlur={(e) => {
                      if (e.currentTarget.value !== (p.caption ?? '')) e.currentTarget.form?.requestSubmit();
                    }}
                    className="w-full rounded border border-line bg-ink-800 px-2 py-1 text-xs text-text
                               placeholder:text-faint focus:border-accent focus:outline-none"
                  />
                </form>
              ) : (
                <figcaption className="text-xs text-muted">{p.caption ?? '—'}</figcaption>
              )}
            </figure>
          ))}
        </div>
      )}
    </Card>
  );
}
