'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, cx } from '@/components/ui';
import { StepHeader } from './step-header';
import { KARTOITUS_PHOTO_SLOTS, type KartoitusData, type KartoitusPhotoSlot } from '@/lib/kartoitus-schema';
import { prepareKartoitusPhoto, saveKartoitusPhotos } from './actions';

/* =========================================================
   Kartoituksen kuvat.

   Samat kuusi kuvaa kuin asiakkaan kohdetietokyselyssä (ikkuna ja ovi:
   sisältä, tiiviste, ulkoa) samoin ohjein kuin varausvahvistuksessa, ja
   lisäksi vapaa määrä muita kuvia. Ruutua napauttamalla puhelin tarjoaa
   kameran tai kuvagallerian (ei `capture`-attribuuttia: se pakottaisi
   kameran eikä jo otettua kuvaa voisi valita).

   Lataus suoraan Storageen allekirjoitetulla osoitteella, kuten työn
   kuvissa (server actionin 1 MB runkoraja, ks. tyot/[id]/photos.tsx).
   Tallennetulla kartoituksella kuvat menevät talteen heti; uudella ne
   tallentuvat lomakkeen mukana.
   ========================================================= */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const BUCKET = 'tyokuvat';
const MAX_BYTES = 15 * 1024 * 1024;

type Photos = Pick<KartoitusData, 'photos' | 'extraPhotos'>;

const GROUPS: { title: string; slots: KartoitusPhotoSlot[] }[] = [
  { title: 'Ikkuna', slots: ['ikkuna_sisa', 'ikkuna_tiiviste', 'ikkuna_ulko'] },
  { title: 'Ovi', slots: ['ovi_sisa', 'ovi_tiiviste', 'ovi_ulko'] },
];

async function upload(kid: string, file: File): Promise<string> {
  if (file.size > MAX_BYTES) throw new Error('liian suuri (yli 15 MB)');
  const lupa = await prepareKartoitusPhoto(kid, file.type || 'image/jpeg');
  if ('error' in lupa) throw new Error(lupa.error);
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/upload/sign/${BUCKET}/${lupa.path}?token=${encodeURIComponent(lupa.token)}`,
    { method: 'PUT', headers: { 'content-type': file.type || 'image/jpeg' }, body: file },
  );
  if (!res.ok) throw new Error(`lataus epäonnistui (${res.status})`);
  return lupa.path;
}

function Thumb({ url, onRemove, disabled }: { url?: string; onRemove: () => void; disabled?: boolean }) {
  return (
    <div className="relative h-full w-full">
      {url
        ? <img src={url} alt="" className="h-full w-full object-cover" />
        : <div className="grid h-full w-full place-items-center text-xs text-faint">Kuva tallessa</div>}
      {!disabled && (
        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
          className="absolute right-1 top-1 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-sm font-bold text-white"
          aria-label="Poista kuva">✕</button>
      )}
    </div>
  );
}

export function KartoitusPhotos({ kid, saved, value, onChange, urls: initialUrls, disabled }: {
  /** Kartoituksen tunniste — uudella selaimen keksimä. */
  kid: string;
  saved: boolean;
  value: Photos;
  onChange: (update: (p: Photos) => Photos) => void;
  urls: Record<string, string>;
  disabled?: boolean;
}) {
  const [urls, setUrls] = useState(initialUrls);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const dirty = useRef(false);

  /* Tallennetulla kartoituksella muutos talteen heti. Efektissä eikä
     latauksen perässä, jotta peräkkäiset kuvat eivät kirjoita toistensa yli. */
  useEffect(() => {
    if (!saved || !dirty.current) return;
    dirty.current = false;
    saveKartoitusPhotos(kid, value)
      .then((r) => r.error && setMsg({ error: r.error }))
      .catch(() => setMsg({ error: 'Kuvien tallennus epäonnistui. Paina Tallenna.' }));
  }, [saved, kid, value]);

  async function add(files: File[], slot?: KartoitusPhotoSlot) {
    setMsg({});
    const viat: string[] = [];
    for (const file of slot ? files.slice(0, 1) : files) {
      setBusy(slot ?? 'extra');
      try {
        const path = await upload(kid, file);
        setUrls((u) => ({ ...u, [path]: URL.createObjectURL(file) }));
        dirty.current = true;
        onChange((p) => slot
          ? { photos: { ...p.photos, [slot]: path }, extraPhotos: p.extraPhotos }
          : { photos: p.photos, extraPhotos: [...p.extraPhotos, path] });
      } catch (e) {
        viat.push(`${file.name}: ${e instanceof Error ? e.message : 'lataus epäonnistui'}`);
      }
    }
    setBusy(null);
    if (viat.length) setMsg({ error: viat.join(' ') });
    else if (!saved) setMsg({ ok: 'Kuva lisätty. Se jää talteen kun tallennat kartoituksen.' });
  }

  const remove = (slot?: KartoitusPhotoSlot, path?: string) => {
    dirty.current = true;
    onChange((p) => slot
      ? { photos: Object.fromEntries(Object.entries(p.photos).filter(([k]) => k !== slot)), extraPhotos: p.extraPhotos }
      : { photos: p.photos, extraPhotos: p.extraPhotos.filter((x) => x !== path) });
  };

  const tile = 'relative block aspect-square overflow-hidden rounded-xl border-[1.5px]';
  const fileInput = (onFiles: (f: File[]) => void, multiple = false) => (
    <input
      type="file" accept="image/*" multiple={multiple}
      disabled={disabled || busy !== null} className="sr-only"
      onChange={(e) => {
        const files = [...(e.currentTarget.files ?? [])].filter((f) => f.size > 0);
        e.currentTarget.value = '';
        if (files.length) void onFiles(files);
      }}
    />
  );

  return (
    <Card className="scroll-mt-24" id="osio-6">
      <StepHeader n={6} title="Kuvat" hint="Napauta ruutua ja ota kuva. Kuvat jäävät vain meille, asiakas ei näe niitä." />
      <div className="space-y-5 px-4 py-4">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <div className="mb-2 text-sm font-bold text-text">{g.title}</div>
            <div className="grid grid-cols-3 gap-2">
              {g.slots.map((slot, i) => {
                const path = value.photos[slot];
                const [title, help] = KARTOITUS_PHOTO_SLOTS[slot];
                return (
                  <div key={slot} className="space-y-1.5">
                    <label className={cx(tile, path ? 'border-accent' : 'cursor-pointer border-dashed border-line bg-ink-800 hover:border-accent/60')}>
                      {!path && fileInput((f) => add(f, slot))}
                      {path ? (
                        <Thumb url={urls[path]} disabled={disabled} onRemove={() => remove(slot)} />
                      ) : (
                        <div className="grid h-full w-full place-items-center p-2 text-center">
                          <div>
                            <div className="mx-auto grid h-7 w-7 place-items-center rounded-full bg-accent text-sm font-bold text-white">{i + 1}</div>
                            <div className="mt-1.5 text-xs font-semibold text-muted">{busy === slot ? 'Ladataan…' : '+ Kuva'}</div>
                          </div>
                        </div>
                      )}
                    </label>
                    <div className="text-[15px] font-semibold leading-tight text-text">{title}</div>
                    <div className="text-xs leading-snug text-faint">{help}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div>
          <div className="mb-2 text-sm font-bold text-text">Muut kuvat</div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {value.extraPhotos.map((path) => (
              <div key={path} className={cx(tile, 'border-line')}>
                <Thumb url={urls[path]} disabled={disabled} onRemove={() => remove(undefined, path)} />
              </div>
            ))}
            {!disabled && (
              <label className={cx(tile, 'cursor-pointer border-dashed border-line bg-ink-800 hover:border-accent/60')}>
                {fileInput((f) => add(f), true)}
                <div className="grid h-full w-full place-items-center text-center text-xs font-semibold text-muted">
                  {busy === 'extra' ? 'Ladataan…' : '+ Lisää kuvia'}
                </div>
              </label>
            )}
          </div>
        </div>

        {msg.ok && <p className="text-xs text-accent">{msg.ok}</p>}
        {msg.error && <p className="text-xs text-danger">{msg.error}</p>}
      </div>
    </Card>
  );
}
