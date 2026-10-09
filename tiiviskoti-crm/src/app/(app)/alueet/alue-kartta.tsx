'use client';

import { useEffect, useRef } from 'react';
import type * as Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { RadiusResult } from '@/lib/postinumerot';

const ACCENT = '#217A4E';
const DANGER = '#B03A2E';

/* Säteen kartta. Klikkaus postinumeropisteeseen sulkee sen pois alueesta tai
   palauttaa sen. Leaflet ladataan vasta selaimessa, koska se koskee
   `window`-olioon heti tuotaessa.

   Kartta piirretään uudelleen kokonaan joka muutoksella: pisteitä on
   enimmillään muutamia satoja, eikä erillinen päivityslogiikka maksa vaivaa. */
export function AlueKartta({ result, radiusKm, onToggle }: {
  result: RadiusResult;
  radiusKm: number;
  onToggle: (code: string) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const layer = useRef<Leaflet.LayerGroup | null>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const lastFit = useRef('');
  // Klikkauskäsittelijä lukee aina tuoreimman onTogglen.
  const toggle = useRef(onToggle);
  toggle.current = onToggle;

  useEffect(() => {
    let cancelled = false;
    import('leaflet').then((mod) => {
      if (cancelled || !el.current || map.current) return;
      L.current = mod;
      map.current = mod.map(el.current, { scrollWheelZoom: false, zoomSnap: 0.5 });
      mod.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; OpenStreetMap',
      }).addTo(map.current);
      layer.current = mod.layerGroup().addTo(map.current);
      draw();
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(draw);

  function draw() {
    const Lf = L.current;
    const m = map.current;
    const g = layer.current;
    if (!Lf || !m || !g) return;
    g.clearLayers();

    const c: [number, number] = [result.center.lat, result.center.lon];
    Lf.circle(c, {
      radius: radiusKm * 1000, color: ACCENT, weight: 2, fillOpacity: 0.06,
    }).addTo(g);

    const excluded = new Set(result.excluded);
    for (const p of result.within) {
      if (p.code === result.center.code) continue;
      const off = excluded.has(p.code);
      Lf.circleMarker([p.lat, p.lon], off
        ? { radius: 6, color: DANGER, weight: 2, fillOpacity: 0 }
        : { radius: 6, color: ACCENT, weight: 1, fillColor: ACCENT, fillOpacity: 0.75 })
        .bindTooltip(
          `<b>${p.code}</b> ${p.name}<br>${p.kunta} · ${p.km.toFixed(1).replace('.', ',')} km`
            + `${p.asukkaat ? ` · ${p.asukkaat.toLocaleString('fi-FI')} as.` : ''}`
            + `<br><i>${off ? 'Poissuljettu — klikkaa palauttaaksesi' : 'Klikkaa sulkeaksesi pois'}</i>`,
          { direction: 'top' })
        .on('click', () => toggle.current(p.code))
        .addTo(g);
    }
    Lf.circleMarker(c, { radius: 7, color: '#fff', weight: 2, fillColor: DANGER, fillOpacity: 1 })
      .bindTooltip(`<b>${result.center.code}</b> ${result.center.name} · keskipiste`, { direction: 'top' })
      .addTo(g);

    // Rajataan uudelleen vain kun keskipiste tai säde muuttuu — ei poissulkujen takia.
    const fitKey = `${result.center.code}:${radiusKm}`;
    if (fitKey !== lastFit.current) {
      lastFit.current = fitKey;
      // latLng.toBounds ei tarvitse kartan näkymää; circle.getBounds tarvitsisi.
      m.fitBounds(Lf.latLng(c).toBounds(radiusKm * 2000), { padding: [16, 16] });
    }
  }

  return <div ref={el} className="relative z-0 h-[380px] w-full rounded-lg border border-line" />;
}
