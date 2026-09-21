#!/usr/bin/env python3
"""
TiivisKoti — lopputaulun hintarivin paikka.

Videon lopputauluun on poltettu rivi "Ikkuna 95 € · ulko-ovi 119 € · pienin
käynti 149 €", ja se on mukana MYÖS "ei tekstiä" -versiossa, joten sitä ei voi
vain jättää pois. Kaksi kolmesta luvusta on väärin pricing.mjs:ää vasten.

Rivi istuu tasaisella vihreällä liu'ulla, jonka alla on tyhjää. Siksi sen voi
poistaa täyttämällä kaistan pystysuoralla interpoloinnilla kaistan ylä- ja
alapuolelta otetuista puhtaista riveistä — liuku on niin loiva, että jälki ei
näy. Päälle ladotaan oikea hintarivi.

Tuottaa: out/patch-<ratio>.png (läpinäkymätön korjauskaista).
"""
import subprocess, sys, os, numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
os.makedirs(OUT, exist_ok=True)

# (video, leveys, korkeus, kaistan ylin y, kaistan alin y, puhdas ylärivi, puhdas alarivi)
FEATHER = 7  # pehmennettyjen rivien määrä kaistan kummassakin päässä

JOBS = [
    ('916', 1118, 1180, 1110, 1186, 1080, 1920),
    ('45',   852,  912,  844,  918, 1080, 1350),
]

src = sys.argv[1] if len(sys.argv) > 1 else None
if not src:
    sys.exit('usage: make-patch.py <notext_9x16.mov> <notext_4x5.mov>')

for (key, y0, y1, ytop, ybot, w, h), path in zip(JOBS, sys.argv[1:]):
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-ss', '40', '-i', path,
         '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'],
        capture_output=True).stdout
    F = np.frombuffer(raw, dtype=np.uint8)[:w * h * 3].reshape(h, w, 3).astype(np.float64)

    top, bot = F[ytop], F[ybot]
    n = y1 - y0
    # Pystysuora lineaarinen interpolointi: rivi kerrallaan puhtaasta
    # ylärivistä puhtaaseen alariviin. Vaakasuunnan vaihtelu (keskellä
    # kirkkaampi hehku) säilyy, koska molemmat lähderivit kantavat sen.
    band = np.empty((n, w, 3))
    for i in range(n):
        t = (y0 + i - ytop) / (ybot - ytop)
        band[i] = top * (1 - t) + bot * t

    # Reunojen pehmennys. Kova leikkaus jätti kaistan ylä- ja alareunaan
    # hiuksenohuen vaakaviivan, koska interpoloitu sävy ei osu viimeistä
    # bittiä myöten alkuperäiseen. Alfaramppi häivyttää sauman kokonaan.
    alpha = np.full((n, 1), 255.0)
    for i in range(FEATHER):
        a = 255.0 * (i + 1) / (FEATHER + 1)
        alpha[i] = a
        alpha[n - 1 - i] = a
    band = np.concatenate([band, np.repeat(alpha[:, :, None], w, axis=1)], axis=2)

    out = os.path.join(OUT, f'patch-{key}.png')
    p = subprocess.run(
        ['ffmpeg', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba',
         '-s', f'{w}x{n}', '-i', '-', '-frames:v', '1', out, '-y'],
        input=band.round().clip(0, 255).astype(np.uint8).tobytes(), capture_output=True)
    if p.returncode: sys.exit(p.stderr.decode())
    print(f'✓ {os.path.basename(out)}  ({w}×{n}, y={y0})')
