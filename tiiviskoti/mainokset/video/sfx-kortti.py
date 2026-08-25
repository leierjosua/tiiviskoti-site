"""Äänitehosteet korttivideoihin (kortti-koti, kortti-taloyhtio).

Ei musiikkia eikä samplekirjastoja — kaikki syntetisoidaan numpylla, jolloin
lisenssistä ei tarvitse huolehtia. AaltoAirin raitaa EI kopioida, se on heidän
lisensoimansa.

⚠ AJASTUS ON SIDOTTU Kortti.tsx:n vakioihin. Jos muutat siellä TITLE_F, STEP_F,
TAIL_F tai CTA_F, muuta ne myös tähän — muuten napsahdukset irtoavat kuvasta.
"""
import numpy as np
from scipy_less import write_wav

SR = 48000
FPS = 25
TITLE_F, STEP_F, TAIL_F, CTA_F = 92, 48, 26, 104

def env(n, attack, decay, curve=3.0):
    a = int(SR * attack); d = max(n - a, 1)
    return np.concatenate([np.linspace(0, 1, max(a, 1)) ** 0.6,
                           np.linspace(1, 0, d) ** curve])[:n]

def tone(freq, dur, harm=(1.0,), decay=6.0):
    n = int(SR * dur); t = np.arange(n) / SR
    y = sum(a * np.sin(2 * np.pi * freq * k * t) for k, a in enumerate(harm, start=1))
    return y * env(n, 0.004, dur - 0.004, decay)

def whoosh(dur=0.34, f0=300, f1=2000, seed=7):
    n = int(SR * dur)
    x = np.random.RandomState(seed).normal(0, 1, n)
    sweep = np.concatenate([np.linspace(f0, f1, n // 2), np.linspace(f1, f0 * 1.6, n - n // 2)])
    y = np.zeros(n); prev = 0.0
    for i in range(n):
        alpha = 1 - np.exp(-2 * np.pi * sweep[i] / SR)
        prev += alpha * (x[i] - prev); y[i] = prev
    return y * env(n, 0.06, dur - 0.06, 2.2)

def place(track, sig, at, gain):
    i = int(at * SR); j = min(len(track), i + len(sig))
    if 0 <= i < len(track):
        track[i:j] += sig[:j - i] * gain

def build(n_steps, out):
    cta_f = TITLE_F + n_steps * STEP_F + TAIL_F
    total_f = cta_f + CTA_F
    dur = total_f / FPS
    tr = np.zeros(int(SR * dur))
    f = lambda fr: fr / FPS

    # Otsikkorivit: kolme pehmeää napsausta, sävel nousee rivi riviltä.
    for fr, freq in ((18, 520), (25, 620), (32, 740)):
        place(tr, tone(freq, 0.07, (1.0, 0.3), 11), f(fr), 0.085)

    # Kortti nousee ruutuun.
    place(tr, whoosh(), f(TITLE_F) - 0.06, 0.15)
    place(tr, tone(660, 0.09, (1.0, 0.35), 9), f(TITLE_F) + 0.20, 0.11)

    # Askeleet: syttyminen nousevalla sävelellä, kuittaus lyhyellä napsauksella.
    base = 1600
    for i in range(n_steps):
        on = TITLE_F + i * STEP_F
        place(tr, tone(base + i * 190, 0.05, (1.0, 0.22), 14), f(on) + 0.08, 0.075)
        done = on + STEP_F if i < n_steps - 1 else cta_f - TAIL_F + 10
        place(tr, tone(2350 + i * 90, 0.045, (1.0, 0.3), 16), f(done) + 0.05, 0.055)

    # Lopetus: matala tömäys + hento kimallus.
    place(tr, whoosh(0.4, 260, 1500, seed=3), f(cta_f) - 0.08, 0.13)
    place(tr, tone(140, 0.30, (1.0, 0.5, 0.25), 4), f(cta_f) + 0.05, 0.14)
    place(tr, tone(2400, 0.18, (1.0, 0.4), 7), f(cta_f) + 0.09, 0.045)

    peak = np.abs(tr).max()
    if peak > 0:
        tr = tr / peak * 0.16          # n. -16 dBFS: kuuluu, ei hallitse
    write_wav(out, np.stack([tr, tr], 1), SR)
    print(f'✓ {out}  {dur:.2f} s  {n_steps} askelta')


def bed(dur, seed=77):
    """Jatkuva pohja: ulkona tuulen huminaa, tiivisteen jälkeen huoneen hiljaisuus.
    Ilman pohjaa isku putoaa tyhjyyteen ja koko raita kuulostaa halvalta —
    kalliissa videossa on aina jotain taustalla."""
    n = int(SR * dur)
    x = np.random.RandomState(seed).normal(0, 1, n)
    # kaksi alipäästöä peräkkäin → pehmeä humina, ei sihinää
    y = np.zeros(n); p1 = p2 = 0.0
    a = 1 - np.exp(-2 * np.pi * 420 / SR)
    for i in range(n):
        p1 += a * (x[i] - p1)
        p2 += a * (p1 - p2)
        y[i] = p2
    # Huippunormalisointi tekisi pohjasta lähes kuulumattoman: kaksi
    # alipäästöä pudottaa RMS:n murto-osaan huipusta. Normalisoidaan siksi
    # TEHOLLISARVON mukaan, jolloin pohja on oikeasti läsnä.
    y /= (np.sqrt((y ** 2).mean()) or 1)
    t = np.arange(n) / SR
    # hidas aaltoilu, ettei pohja ole kuollut
    y *= 0.75 + 0.25 * np.sin(2 * np.pi * 0.11 * t)
    # tiiviste framella 205 = 8,2 s: ulkoilma vaimenee selvästi
    seal = 205 / FPS
    duck = np.clip(np.interp(t, [seal - 0.1, seal + 0.5], [1.0, 0.38]), 0.38, 1.0)
    return y * duck

def riser(dur, f0=140, f1=3000, seed=21):
    """Nouseva kohina ennen iskua. Tämä on se temppu joka saa iskun tuntumaan
    isolta: korva ennakoi huipun, joten itse isku ei tule tyhjästä."""
    n = int(SR * dur)
    x = np.random.RandomState(seed).normal(0, 1, n)
    sweep = np.geomspace(f0, f1, n)
    y = np.zeros(n); prev = 0.0
    for i in range(n):
        alpha = 1 - np.exp(-2 * np.pi * sweep[i] / SR)
        prev += alpha * (x[i] - prev); y[i] = prev
    return y * np.linspace(0, 1, n) ** 2.2

def build_lampo(out):
    """Lämpötilavideo. Ajastus vastaa Lampotila.tsx:n L-vakioita:
    coldNum 14, warmIn 55, warmNum 68, leakStart 104, drop 148–196,
    seal 205, recover 214–252, payoff 262, brand 306. Muuta molempiin."""
    dur = 16.0
    tr = np.zeros(int(SR * dur))
    f = lambda fr: fr / FPS

    tr += bed(dur) * 0.030                                              # jatkuva pohja
    place(tr, whoosh(0.5, 180, 1200, seed=11), f(2), 0.13)              # kylmä maailma
    for k in range(7):                                                   # luku rullaa
        place(tr, tone(1950 + k * 30, 0.018, (1.0,), 22), f(16 + k * 4), 0.020)
    place(tr, whoosh(0.46, 260, 900, seed=5), f(55), 0.11)              # lämmin puoli
    for k in range(7):
        place(tr, tone(1520 + k * 30, 0.018, (1.0,), 22), f(70 + k * 4), 0.020)

    # Veto voimistuu: hiljainen humina joka kasvaa kohti iskua.
    leak = riser(f(205) - f(104), 90, 900, seed=33)
    place(tr, leak, f(104), 0.055)

    # Riser ja isku.
    place(tr, riser(1.2, 200, 3600, seed=21), f(205) - 1.2, 0.085)
    place(tr, tone(96, 0.44, (1.0, 0.55, 0.28), 3.2), f(205), 0.20)     # matala tömäys
    place(tr, tone(1750, 0.05, (1.0, 0.3), 15), f(205) + 0.01, 0.10)    # naps
    place(tr, tone(2600, 0.20, (1.0, 0.35), 7), f(205) + 0.04, 0.05)    # kimallus

    # Lämpö palaa: nouseva kolmisointu.
    for k, fr in enumerate((214, 226, 238)):
        place(tr, tone(523 * (1.26 ** k), 0.30, (1.0, 0.3), 5), f(fr), 0.055)

    place(tr, tone(660, 0.10, (1.0, 0.35), 9), f(262), 0.075)           # lupaus
    place(tr, tone(2400, 0.18, (1.0, 0.4), 7), f(306), 0.045)           # tunnus

    peak = np.abs(tr).max()
    if peak > 0:
        tr = tr / peak * 0.17
    write_wav(out, np.stack([tr, tr], 1), SR)
    print(f'\u2713 {out}  {dur:.2f} s  l\u00e4mp\u00f6tilakontrasti')

def build_saasto(out):
    """Säästöarvio, KOLME KOHTAUSTA. Ajastus vastaa Saasto.tsx:n vakioita:
    A 10–96, B 112–218 (rulla 116–158), C 236–, tunnus 270. Kesto 14 s.
    Kohtausvaihdoissa oma pyyhkäisy: kun kuva vaihtaa ajatusta, korvan pitää
    kuulla se — muuten leikkaus tuntuu virheeltä."""
    dur = 14.0
    tr = np.zeros(int(SR * dur))
    f = lambda fr: fr / FPS

    tr += bed(dur) * 0.026
    place(tr, whoosh(0.44, 200, 1200, seed=13), f(8), 0.11)             # kohtaus A
    place(tr, tone(600, 0.09, (1.0, 0.3), 10), f(12), 0.07)
    place(tr, whoosh(0.40, 260, 1400, seed=23), f(110), 0.10)           # kohtaus B
    for k in range(10):                                                  # euroluku rullaa
        place(tr, tone(1480 + k * 52, 0.02, (1.0,), 20), f(118 + k * 3.8), 0.022)
    place(tr, whoosh(0.42, 240, 1100, seed=31), f(234), 0.10)           # kohtaus C
    place(tr, tone(660, 0.11, (1.0, 0.35), 9), f(240), 0.075)
    place(tr, tone(2400, 0.18, (1.0, 0.4), 7), f(270), 0.045)           # tunnus

    peak = np.abs(tr).max()
    if peak > 0:
        tr = tr / peak * 0.17
    write_wav(out, np.stack([tr, tr], 1), SR)
    print(f'\u2713 {out}  {dur:.2f} s  s\u00e4\u00e4st\u00f6arvio')

VIDEOT = [
    ('kortti-koti', 4),
    ('kortti-veto', 4),
    ('kortti-hinta', 4),
    ('kortti-saasto', 4),
    ('kortti-taloyhtio', 3),
    ('kortti-taloyhtio-kartoitus', 4),
]

if __name__ == '__main__':
    import os
    os.makedirs('sfx', exist_ok=True)
    for name, n in VIDEOT:
        build(n, f'sfx/{name}.wav')
    build_lampo('sfx/kortti-lampotila.wav')
    build_saasto('sfx/kortti-saasto-arvio.wav')
