# Loppusiivous.fi — asset-pipeline (HTML/CSS + Playwright)

Sama malli kuin AaltoAirissa: HTML/CSS-templatet → Playwright renderöi → PNG/PDF.

## Käyttö
```bash
npm i                                   # asentaa playwright@1.58.2 (selain jo cachessa)
node scripts/render.mjs logo-light      # → assets/_out/logo-light.png
node scripts/render.mjs all             # renderöi kaikki assets/_html/*.html
RENDER_DSF=3 node scripts/render.mjs og # retina 3x
node scripts/render.mjs esite --pdf     # PDF
```
- Templatet: `assets/_html/<name>.html` (jaettu `brand.css`)
- Ulostulo: `assets/_out/<name>.png` (läpinäkyvä; body-mitat määräävät leikkauksen)

## Valmiit templatet
| Template | Mitä |
|---|---|
| `logo-light` / `logo-dark` | Sanamerkki + pyyhkäisy (läpinäkyvä) |
| `stamp-navy` / `stamp-blue` / `stamp-white` | HYVÄKSYTTY-leima |
| `og` | Some-/jakokuva 1200×630 |

Uusi mainos/flyer/tarra = uusi `assets/_html/<name>.html` + `node scripts/render.mjs <name>`.

## Videomainokset (Remotion)

Animoidut mainokset tehdään Remotionilla, sama malli kuin AaltoAirin `scripts/marketing/video`.
Projekti: `scripts/video/` (React/TSX-kompositiot, 1080×1920 @ 30fps, Gabarito + Inter).

```bash
cd scripts/video
npm i
npm run studio            # esikatselu selaimessa
npm run render:all        # → assets/ads/{tarkastus,hinta,wipe}.mp4
npx remotion still src/index.ts Wipe --frame=200 out.png   # yksittäinen still
```

| Kompositio | Kesto | Idea |
|---|---|---|
| `Tarkastus` | 22 s | Vakuus-hook → tarkistuslista tikittyy + progress-rinki → HYVÄKSYTTY-leima → hinta + CTA |
| `Hinta` | 19 s | "Paljonko maksaa?" → epämääräiset harmaat tarjoukset → sininen aalto pesee → 70 €/h → CTA |
| `Wipe` | 12 s | Likakalvo koko ruudussa → jättilasta pyyhkäisee puhtaaksi → wordmark + tagline + CTA (loopattava) |

Design-systeemi: `scripts/video/src/shared.tsx` (värit, wordmark, kuplat, taustat, EndCard).
Uusi mainos = uusi `src/<Nimi>.tsx` + `<Composition>` `src/Root.tsx`:ään.
