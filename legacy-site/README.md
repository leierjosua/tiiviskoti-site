# Loppusiivous.fi — site

Staattinen yksisivuinen verkkosivu (Vercel). Sama malli kuin unitylife/taloyhtiokumppani.

## Rakenne
- `index.html` — koko sivu (inline CSS + inline-SVG logo, Gabarito/Inter Google Fontsista)
- `api/contact.js` — tarjouspyyntölomakkeen käsittely (Vercel Serverless + Resend)
- `assets/` — logot ja faviconit
- `vercel.json` — Vercel-konfiguraatio (cleanUrls, cache-headerit)

## Paikallinen esikatselu
Avaa `index.html` suoraan selaimessa, tai:
```
cd site && python3 -m http.server 3000
```
(Lomakkeen lähetys vaatii Vercel-ympäristön / `/api/contact` reitin.)

## Julkaisu (Vercel)
1. Yhdistä repo Verceliin, **Root Directory = `site`**.
2. Aseta ympäristömuuttujat:
   - `RESEND_API_KEY` — Resend API -avain
   - `CONTACT_TO` — vastaanottaja (oletus `info@loppusiivous.fi`)
   - `CONTACT_FROM` — lähettäjä (vahvistettu Resend-domain)
3. Osoita `loppusiivous.fi` DNS Verceliin.

## TODO ennen julkaisua
Ks. `../BRANDI.md` → "Avoimet": puhelin, sähköposti, Y-tunnus, toimialue.
