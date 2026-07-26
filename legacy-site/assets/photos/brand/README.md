# Brändikuvat (AI-generoidut, 2K)

Generoitu Gemini "nano banana" pro (`gemini-3-pro-image`, 2K) — AaltoAirin GEMINI_API_KEY.
Fotorealistisia (DSLR-tyyli, oikeat ihmiset/tekstuurit, EI clay/CGI), brändin raikas sinivalkoinen ilme.

- `woman-logo.jpg` — nuori nainen siivoaa, valkoinen polo + **vaaka-lockup rinnassa**
- `team-action.jpg` — tiimi-duo (mies + nainen), logot molempien rinnassa
- `bright-empty.jpg` — säkenöivän puhdas tyhjä asunto (muuttovalmis)
- `detail-wipe.jpg` — lähikuva: käsineet + pyyhintä, raitaton kiilto

## Luotettava logon lisäys (tärkeä workflow)
1. Generoi henkilökuva PUHTAALLA pololla (NO logo).
2. Syötä `IMAGE 1 = kuva` + `IMAGE 2 = brand-assets/logos/loppusiivous-lockup.png`.
3. Pyydä EDITOINTINA: "lisää logo vasempaan rintaan, toista TÄSMÄLLEEN, vaakana, älä piirrä uudelleen".
→ AI toistaa oikean vaaka-lockupin uskollisesti. (Älä syötä kahta erillistä logoa ja oleta yhdistämistä.)

Generaattori: `python3 /tmp/gen2.py gemini-3-pro-image out.png "<prompt>" [kuva] [logo]`
Realismi-ohje promptiin: "real DSLR documentary photograph, natural skin texture, NOT 3D render/CGI/clay/illustration".

Vanhat matalaresoluutiot (flash-malli) poistettu. **EI** firman valokuvia oikeista kohteista — markkinointi-/kuvituskäyttö. Oikeat kuvat: `../own/`.
