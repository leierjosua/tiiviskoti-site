'use client';

import { useActionState, useRef } from 'react';
import { Card, CardHeader, Empty } from '@/components/ui';
import { deleteJobPhoto, updateJobPhotoCaption, uploadJobPhotos, type PhotoState } from './photo-actions';

/* =========================================================
   Työn kuvat.

   Tarkoitus on muistaa missä oltiin: mikä ikkuna vuotaa, mistä ovesta
   mennään sisään, mikä on ovikoodi. Kuvat eivät mene asiakkaalle.

   Kuvateksti tallentuu kentästä poistuttaessa eikä erillisellä napilla.
   Puhelimella seisten napin etsiminen on se kohta jossa teksti jää
   kirjoittamatta — ja kuvateksti on juuri se mikä tekee kuvasta
   muistiinpanon eikä pelkkää kuvaa.
   ========================================================= */

export type PhotoView = {
  id: string; caption: string | null; url: string | null; createdAt: string;
};

export function JobPhotos({ jobId, photos, canEdit }: {
  jobId: string; photos: PhotoView[]; canEdit: boolean;
}) {
  const [state, action, pending] = useActionState<PhotoState, FormData>(uploadJobPhotos, {});
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Card>
      <CardHeader
        title="Kuvat"
        action={<span className="text-xs text-faint">Vain sisäiseen käyttöön — eivät näy asiakkaalle</span>}
      />

      {canEdit && (
        <form action={action} className="border-b border-line px-4 py-3">
          <input
            ref={inputRef}
            type="file"
            name="kuvat"
            accept="image/*"
            multiple
            /* Puhelimessa tämä avaa kameran suoraan. Tietokoneella selain
               jättää sen huomiotta ja näyttää tavallisen tiedostovalinnan. */
            capture="environment"
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0
                       file:bg-accent file:px-3 file:py-2 file:text-sm file:font-medium
                       file:text-accent-ink hover:file:bg-accent/90"
          />
          <input type="hidden" name="jobId" value={jobId} />
          {pending && <p className="mt-2 text-xs text-muted">Tallennetaan…</p>}
          {state.ok && <p className="mt-2 text-xs text-accent">{state.ok}</p>}
          {state.error && <p className="mt-2 text-xs text-red-400">{state.error}</p>}
        </form>
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
