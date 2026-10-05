#!/usr/bin/env python3
"""
TiivisKoti — ikkuna + ovi -mainosvideo (Josua 5.10.2026: "aluksi ikkunan
tiivistys ja sitten oven tiivistystä").

  python3 tiiviskoti/mainokset/video/build-ikkuna-ovi.py

LÄHDE: Drive-kansion CLIPS-alikansiot (IKKUNA/CLIPS, OVI/CLIPS), ladattu
~/Desktop/tiiviskoti-mainosvideot/_klipit/. Klipit ovat 1080×1920, 25 fps,
tekstittömiä. Ikkunaklipit ovat lyhyitä (1,3–1,7 s), oviklipit 2–5 s.

RAKENNE: neljä osiota, ei kymmentä leikkausta. Josua on sanonut kolmesti
että vaihdot ovat liian nopeita, ja oikea korjaus on pidemmät palat — ei
lyhyemmät häivytykset (ks. build-videot.mjs). Siksi:
  * kaksi rajausta SAMASTA työstä liitetään yhdeksi osioksi 0,45 s
    sisäisellä sulautuksella → lukee yhtenä otoksena
  * osioiden välillä 1,2 s sulautus
  * minterpolate 0,85× (laskee väliruudut, ei monista → ei nykimistä)

ENSIMMÄINEN RUUTU ON TYÖTÄ, ei kasvoja (pikkukuva).

HYLÄTTY: IK02 (käsi pitelee nauhakerää — tuotekuva, sama syy kuin
_lahteen 4,05–6,30), OV03 (sakset), OV16 (lähtee pois), IK05/IK08 (lakki
ja kasvot — ei työtä), OV13/OV14 (kuusiokoloavain saranassa: säätöä, mutta
ei lue tiivistykseksi).
"""
import subprocess, os

HOME = os.path.expanduser('~')
KLIP = os.path.join(HOME, 'Desktop', 'tiiviskoti-mainosvideot', '_klipit')
MUSA = os.path.join(HOME, 'Desktop', 'tiiviskoti-mainosvideot', '_lahde', 'notext_9x16.mov')
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
DEST = os.path.join(HOME, 'Desktop', 'tiiviskoti-mainosvideot')

FPS = 25
NOPEUS = 0.85
HV_OSIO = 1.20
HV_SISA = 0.45

def ik(n): return os.path.join(KLIP, f'IKKUNA_PortraitClip_V1-{n:04d}.mov')
def ov(n): return os.path.join(KLIP, f'OVI_PortraitClip_V1-{n:04d}.mov')

# (tiedosto, alku, loppu, 4:5-rajauksen y-siirtymä 0–570)
# y = mistä 1350 px korkea ikkuna leikataan 1920 px kuvasta. 285 = keskellä.
OSIOT = [
    # 1. Ikkunatiiviste painetaan uraan: alakarmi → pystyura.
    [(ik(10), 0.00, 1.47, 285), (ik(9), 0.00, 1.28, 200)],
    # 2. Saumaus: sivulta ikkunan edestä → takaa karmia pitkin.
    [(ik(6), 0.00, 1.64, 380), (ik(7), 0.00, 1.64, 400)],
    # 3. Ovi: tiiviste painetaan karmia pitkin → yläkarmiin.
    [(ov(2), 0.30, 2.80, 300), (ov(11), 0.20, 2.60, 0)],
    # 4. Kynnyskumi oven alareunaan. Alku epätarkka → 1,4 s eteenpäin.
    [(ov(10), 1.40, 4.30, 400)],
    # 5. Ovi suljetaan — loppukuva, jonka päällä CTA.
    [(ov(15), 0.00, 3.15, 250)],
]

# Tekstit: (taso, sisään, ulos). Ajat lasketaan osioiden rajoista alla.
def kesto(p): return (p[2] - p[1]) / NOPEUS
osio_kesto = [sum(kesto(p) for p in o) - HV_SISA * (len(o) - 1) for o in OSIOT]
alku = [0.0]
for d in osio_kesto[:-1]:
    alku.append(alku[-1] + d - HV_OSIO)
DUR = round(alku[-1] + osio_kesto[-1], 2)
ovi_alku = alku[2] + HV_OSIO / 2          # sulautuksen puoliväli
loppu_alku = alku[4] + HV_OSIO / 2
TEKSTIT = [
    ('t-hinta',    0.15,             round(ovi_alku - 0.2, 2)),
    ('t-ovi',      round(ovi_alku + 0.2, 2), round(loppu_alku - 0.2, 2)),
    ('t-molemmat', round(loppu_alku + 0.2, 2), None),
]
FADE = 0.35

def build(ratio):
    w, h = (1080, 1920) if ratio == '916' else (1080, 1350)
    args = ['ffmpeg', '-v', 'error', '-y']
    f, n = [], 0
    osio_out = []
    for oi, osio in enumerate(OSIOT):
        palat = []
        for (src, a, b, y) in osio:
            args += ['-i', src]
            crop = '' if ratio == '916' else f'crop=1080:1350:0:{y},'
            f.append(f'[{n}:v]trim=start={a}:end={b},setpts=(PTS-STARTPTS)/{NOPEUS},'
                     f'minterpolate=fps={FPS}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,'
                     f'{crop}scale={w}:{h},setsar=1,format=yuv420p[p{n}]')
            palat.append((f'p{n}', kesto((src, a, b))))
            n += 1
        cur, pit = palat[0]
        for k, (lab, d) in enumerate(palat[1:], 1):
            o = f'o{oi}_{k}'
            f.append(f'[{cur}][{lab}]xfade=transition=fade:duration={HV_SISA}:offset={pit - HV_SISA:.3f}[{o}]')
            cur, pit = o, pit + d - HV_SISA
        osio_out.append((cur, pit))
    cur, pit = osio_out[0]
    for k, (lab, d) in enumerate(osio_out[1:], 1):
        o = f'x{k}'
        f.append(f'[{cur}][{lab}]xfade=transition=fade:duration={HV_OSIO}:offset={pit - HV_OSIO:.3f}[{o}]')
        cur, pit = o, pit + d - HV_OSIO
    f.append(f'[{cur}]fade=t=in:st=0:d=0.3,fade=t=out:st={DUR - 0.5:.2f}:d=0.5[vb]')
    cur = 'vb'

    # Tekstit. Viimeinen -cta-versiona ja ruutuun loppuun asti.
    for k, (t, tin, tout) in enumerate(TEKSTIT):
        nimi = f'{t}-cta' if k == len(TEKSTIT) - 1 else t
        args += ['-loop', '1', '-t', str(DUR), '-i', os.path.join(OUT, f'{nimi}-{ratio}.png')]
        end = DUR if tout is None else tout
        fades = f'fade=t=in:st={tin}:d={FADE}:alpha=1'
        if tout is not None:
            fades += f',fade=t=out:st={end - FADE:.2f}:d={FADE}:alpha=1'
        f.append(f'[{n}:v]format=rgba,{fades}[t{k}]')
        f.append(f"[{cur}][t{k}]overlay=0:0:enable='between(t,{tin},{end})'[v{k}]")
        cur = f'v{k}'
        n += 1

    # Musiikki yhtenä palana kappaleen alusta (sama kuin muissa videoissa).
    args += ['-i', MUSA]
    f.append(f'[{n}:a]atrim=0:{DUR},asetpts=PTS-STARTPTS,volume=0.5,'
             f'afade=t=in:st=0:d=0.3,afade=t=out:st={DUR - 0.8:.2f}:d=0.8[a]')

    out = os.path.join(DEST, f'tk-ikkuna-ovi-{"9x16" if ratio == "916" else "4x5"}.mp4')
    args += ['-filter_complex', ';'.join(f), '-map', f'[{cur}]', '-map', '[a]',
             '-c:v', 'libx264', '-crf', '19', '-preset', 'medium', '-pix_fmt', 'yuv420p',
             '-profile:v', 'high', '-c:a', 'aac', '-b:a', '192k',
             '-movflags', '+faststart', '-t', str(DUR), out]
    r = subprocess.run(args, capture_output=True)
    if r.returncode:
        print(f'✗ {out}\n{r.stderr.decode()[-1500:]}'); return
    print(f'✓ {os.path.basename(out)}  {DUR:.2f} s')

if __name__ == '__main__':
    print('osiot alkavat:', [round(a, 2) for a in alku], ' tekstit:', TEKSTIT)
    for r in ('916', '45'):
        build(r)
