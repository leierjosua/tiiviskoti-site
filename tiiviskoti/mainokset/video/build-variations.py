#!/usr/bin/env python3
"""
TiivisKoti — lyhyet mainosversiot hintakulmasta.

  python3 build-variations.py <lähdekansio> <kohdekansio>

Kaikki versiot ajavat SAMAA kulmaa (Josua 18.9.): "Ikkunan tiivistys alk. 75 €
/ uusi ikkuna maksaisi 1 200 €". Vaihtelu on pituudessa, kuvavalinnassa ja
tukitekstissä — ei kärjessä.

HINTAKORTTI ON AINA ENSIMMÄINEN teksti ja se häivähtää sisään heti 0,15 s
kohdalla (Josua 18.9.: "line on aina ekana"). Se kertoo myös mitä hintaan
kuuluu — ikkunan säätö ja öljyäminen.

VIHREÄ LOPPUOSA ON JÄTETTY POIS kokonaan (Josua). Käytetään vain oikeaa
kuvamateriaalia 0–24,3 s. Samalla poistuu lopputaulun väärä hintarivi, jota
pitkässä versiossa jouduttiin paikkaamaan — ks. README.

LEIKKAUSKOHDAT: lähde on leikattu kovilla leikkauksilla n. 1,8 s välein
(mitattu kuvaerotuksella): 4,0 6,1 7,6 9,4 11,4 13,2 15,0 16,9 18,8 20,7
22,5 24,3. Alla olevat pätkät pysyvät otosten sisällä, 0,1 s marginaalilla,
jottei mikään pätkä ala tai lopu kesken leikkauksen.

ÄÄNI on musiikkia (tarkistettu: vain 5 % 0,1 s ikkunoista alle 10 %
huipusta → ei puhetta), joten se otetaan yhtenäisenä lähteen alusta eikä
leikata kuvan mukana. Niin sävelkulku ei katkeile vaikka kuva hyppii.
"""
import subprocess, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')

# Otosten sisäpuolet (turvalliset pätkät), sekuntia lähdevideossa.
S = {
    1:  (0.60, 3.90),   # asentaja ikkunalla, laaja
    2:  (4.20, 6.00),   # tiivistenauhaa kädessä
    3:  (6.30, 7.50),   # puristin + lippis
    4:  (7.80, 9.30),   # punainen patruuna, makro
    5:  (9.60, 11.30),  # TiivisKoti-lippis
    6:  (11.60, 13.10), # keittiön ikkuna
    7:  (13.40, 14.90), # massan levitys
    8:  (15.20, 16.80), # asentajan kasvot
    9:  (17.10, 18.70), # käsi karmilla
    10: (19.00, 20.60), # tiivisteen painaminen uraan, makro
    11: (20.90, 22.40), # käsi karmia pitkin, makro
    12: (22.70, 24.20), # asentaja ikkunalla
}
def seg(n, dur=None):
    a, b = S[n]
    return (a, a + dur if dur else b)

# (nimi, pätkät, tekstit[(taso, sisään, ulos)])
VARIANTS = [
    ('tk-hinta-08s', [seg(2), seg(4), seg(10), seg(11), seg(5, 1.10)],
     [('t-hinta', 0.15, None)]),

    ('tk-hinta-10s', [seg(1, 2.00), seg(2), seg(4), seg(9), seg(10), seg(5, 1.50)],
     [('t-hinta', 0.15, 6.20), ('t-kaynti', 6.60, None)]),

    ('tk-hinta-12s', [seg(1, 2.00), seg(2), seg(3), seg(4), seg(9), seg(10), seg(11), seg(5, 1.30)],
     [('t-hinta', 0.15, 6.50), ('t-mekanismi', 6.90, 9.90), ('t-kaynti', 10.30, None)]),

    ('tk-hinta-15s', [seg(1), seg(2), seg(3), seg(4), seg(7), seg(9), seg(10), seg(11), seg(5, 1.00)],
     [('t-hinta', 0.15, 7.00), ('t-mekanismi', 7.40, 11.00), ('t-kaynti', 11.40, None)]),

    ('tk-hinta-20s', [seg(1), seg(2), seg(3), seg(4), seg(6), seg(7), seg(8),
                      seg(9), seg(10), seg(11), seg(12), seg(5, 1.30)],
     # Pisimmässä kärki toistetaan lopussa: katsoja näkee hinnan sekä
     # ensimmäisenä että viimeisenä.
     [('t-hinta', 0.15, 7.20), ('t-mekanismi', 7.60, 11.80),
      ('t-kaynti', 12.20, 15.80), ('t-hinta', 16.20, None)]),

    # Josua 18.9.: "pari missä toka slide kertoo tosta 10–15 % säästöistä".
    # Kärki on yhä hinta-ankkuri, säästö on toinen dia.
    ('tk-saasto-10s', [seg(1, 2.00), seg(2), seg(4), seg(9), seg(10), seg(5, 1.50)],
     [('t-hinta', 0.15, 6.20), ('t-saasto', 6.60, None)]),

    ('tk-saasto-15s', [seg(1), seg(2), seg(3), seg(4), seg(7), seg(9), seg(10), seg(11), seg(5, 1.00)],
     [('t-hinta', 0.15, 7.00), ('t-saasto', 7.40, 11.00), ('t-kaynti', 11.40, None)]),

    # Nopea vaihto + lyhyempi (Josua 19.9.). Pätkät 0,8–0,9 s, eli kuva
    # vaihtuu noin kaksi kertaa nopeammin kuin muissa versioissa. Lähteen
    # omat leikkaukset ovat n. 1,8 s välein, joten näissä otetaan otoksen
    # alusta vain alkupuolisko — silloin liike on kesken ja vaihto tuntuu
    # terävältä.
    ('tk-saasto-07s-nopea',
     [seg(2,0.80), seg(4,0.80), seg(9,0.80), seg(10,0.80), seg(11,0.80),
      seg(7,0.80), seg(3,0.80), seg(12,0.80), seg(5,0.80)],
     [('t-hinta', 0.15, 3.60), ('t-saasto', 3.90, None)]),

    ('tk-saasto-10s-nopea',
     [seg(1,0.90), seg(2,0.90), seg(3,0.90), seg(4,0.90), seg(6,0.90), seg(7,0.90),
      seg(8,0.90), seg(9,0.90), seg(10,0.90), seg(11,0.90), seg(5,0.90)],
     [('t-hinta', 0.15, 4.80), ('t-saasto', 5.10, None)]),
]

RATIOS = [('916', 'notext_9x16.mov'), ('45', 'notext_4x5.mov')]
FADE = 0.35

def build(name, segs, texts, ratio, src, dst):
    dur = round(sum(b - a for a, b in segs), 2)
    # Videon VIIMEINEN teksti jää ruutuun loppuun asti, joten CTA ladotaan
    # siihen: "Pyydä tarjous" on näkyvissä kun video päättyy (Josua 18.9.).
    layers = [(t if i < len(texts) - 1 else f'{t}-cta', a, b)
              for i, (t, a, b) in enumerate(texts)]
    args = ['ffmpeg', '-v', 'error', '-i', src]
    for t, _, _ in layers:
        # `-t dur` on JOKAISEEN kuvatuloon on pakollinen, ei koristeltu:
        # ilman sitä `-loop 1` tekee päättymättömän virran, ja yhdessä
        # split+trim+concat-ketjun kanssa ffmpeg lukkiutuu (0 % CPU, ei
        # koskaan sulje tiedostoa). Kävi 18.9. — 15 s versio jäi jumiin.
        args += ['-loop', '1', '-t', str(dur),
                 '-i', os.path.join(OUT, f'{t}-{ratio}.png')]

    f = [f'[0:v]split={len(segs)}' + ''.join(f'[s{i}]' for i in range(len(segs))) + ';']
    for i, (a, b) in enumerate(segs):
        f.append(f'[s{i}]trim=start={a}:end={b},setpts=PTS-STARTPTS[v{i}];')
    f.append(''.join(f'[v{i}]' for i in range(len(segs))) + f'concat=n={len(segs)}:v=1:a=0[vc];')

    cur = 'vc'
    for k, (t, tin, tout) in enumerate(layers):
        end = dur if tout is None else tout
        # Viimeinen teksti pidetään ruudussa loppuun asti — ei ulosháivytystä,
        # jotta hinta on näkyvissä myös viimeisessä ruudussa (Metan
        # esikatselukuva ja viimeinen muistijälki).
        fades = f'fade=t=in:st={tin}:d={FADE}:alpha=1'
        if tout is not None:
            fades += f',fade=t=out:st={round(end - FADE, 2)}:d={FADE}:alpha=1'
        f.append(f'[{k+1}:v]format=rgba,{fades}[o{k}];')
        f.append(f"[{cur}][o{k}]overlay=0:0:enable='between(t,{tin},{end})'[t{k}];")
        cur = f't{k}'

    f.append(f'[0:a]atrim=0:{dur},asetpts=PTS-STARTPTS,'
             f'afade=t=in:st=0:d=0.15,afade=t=out:st={round(dur-0.5,2)}:d=0.5[a]')

    out = os.path.join(dst, f'{name}-{"9x16" if ratio=="916" else "4x5"}.mp4')
    args += ['-filter_complex', ''.join(f), '-map', f'[{cur}]', '-map', '[a]',
             '-c:v', 'libx264', '-crf', '20', '-preset', 'fast', '-pix_fmt', 'yuv420p',
             '-profile:v', 'high', '-c:a', 'aac', '-b:a', '192k',
             '-movflags', '+faststart', '-t', str(dur), out, '-y']
    r = subprocess.run(args, capture_output=True)
    if r.returncode:
        print(f'✗ {os.path.basename(out)}\n{r.stderr.decode()[:600]}'); return None
    print(f'✓ {os.path.basename(out):28s} {dur:5.2f}s')
    return dur

if __name__ == '__main__':
    src_dir, dst = sys.argv[1], sys.argv[2]
    os.makedirs(dst, exist_ok=True)
    for name, segs, texts in VARIANTS:
        for ratio, f in RATIOS:
            build(name, segs, texts, ratio, os.path.join(src_dir, f), dst)
