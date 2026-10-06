# Säästölaskuri — 10 varianttia (brief)

Tehtävä: 10 erilaista, hienompaa versiota tiiviskoti.fi:n etusivun "Paljonko tiivistys säästää" -säästölaskurista.
Jokainen variantti on oma itsenäinen tiedosto `slXX-nimi.html` tässä kansiossa (`konseptit/saasto/`).
Tiedosto näyttää VAIN tämän yhden osion (otsikko + laskuri + lyhyt selitys), ei koko sivua.

## Nykyinen laskuri (lähtökohta)
Livenä: https://tiiviskoti.fi/#saasto — lähde `~/projects/loppusiivous-main-new/tiiviskoti/index.html`
(etsi `id="saastolaskuri"` ja `/* SÄÄSTÖLASKURI` -CSS ja `<script>` jossa "Säästölaskuri"). LUE, älä muokkaa.
Logiikka: lämmitystapa (Sähkö 0,20 €/kWh × 18 000 kWh · Kaukolämpö 0,12 × 20 000 · Maalämpö 0,20 × 7 000 kWh sähköä ·
Öljy 1,45 €/l × 2 000 l) → lämmityskulut = hinta × kulutus → **säästöarvio 10–15 % haarukkana**.
Pyöristys: alle 1000 € → lähimpään 10 €, muuten lähimpään 50 €. Pilkku desimaalina ("0,15") pitää toimia
(käytä `type="text" inputmode="decimal"`, ei type=number).

## PAKOLLISET säännöt
- Tulos AINA haarukkana ja arviona ("noin 360–540 € vuodessa"), ei koskaan "säästät X €". Lause
  "Osuus on arvio, ei lupaus." tai vastaava näkyvissä. Ei takuuta. Ei keksittyjä lukuja.
- 10–15 % on ONGELMAN kuvaus: "Vetävä ovi tai ikkuna nostaa lämmityskuluja tyypillisesti 10–15 %".
- **EI kiiltäviä animaatioita**: ei valoviiruja (glint/shine/shimmer), ei pulssirenkaita, ei pomppimista,
  ei sykkiviä nappeja. Omistaja inhoaa niitä. Sallittua: rauhallinen numerorulla, palkkien/kaavioiden
  kasvu, häivytys + pieni liike. Easing `cubic-bezier(0.16,1,0.3,1)`, 0,5–0,9 s. `prefers-reduced-motion` → ei liikettä.
- Brändi: Manrope (Google Fonts), värit `--ink:#183A28 --text:#4A544D --mute:#5F6A62 --bg:#F6F7F3 --alt:#ECF0E9
  --card:#FFF --green:#217A4E --green-l:#2E9E63 --green-soft:#E4F0E9 --deep:#163A28 --line:#E4E8E0 --line2:#D2D9CE`.
  Lämmin "nyt"-sävy esim. #E59A7E, "jälkeen"-sävy #4CC085 (saa vaihtaa harmonisesti).
- CTA-nappi "Laske tiivistyksen hinta" → `https://tiiviskoti.fi/#laskuri`.
- Toimii 390 px puhelimessa ilman vaakavieritystä, kosketuskohteet ≥ 44 px. `<meta name="robots" content="noindex">`.
- Ei ulkoisia kirjastoja (paitsi Google Fonts). Kaikki inline.
- Clean ja premium: paljon tilaa, selkeä hierarkia, yksi pääluku.

## Varmistus ennen valmista
Palvelin `python3 -m http.server <portti>` kansiossa `konseptit/saasto`. Playwright (kirjasto on
`~/projects/loppusiivous-main-new`:ssä, skripti sinne, `chromium.launch({channel:'chrome'})`, poista lopuksi):
kuvakaappaukset `shots/slXX-desk.jpg` (1280×900) ja `shots/slXX-mob.jpg` (390×844, laskuri näkyvissä).
Testaa jokaisesta: oletus → 360–540 € (sähkö 0,20 × 18 000), öljy-oletus → 290–440 €, pilkkusyöte "0,1" toimii.
Katso kuvat itse ja korjaa ongelmat. Ei JS-virheitä.
