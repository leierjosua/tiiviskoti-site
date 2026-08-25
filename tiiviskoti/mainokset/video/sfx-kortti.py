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
TITLE_F, STEP_F, TAIL_F, CTA_F = 92, 70, 34, 104

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

if __name__ == '__main__':
    import os
    os.makedirs('sfx', exist_ok=True)
    build(4, 'sfx/kortti-koti.wav')
    build(3, 'sfx/kortti-taloyhtio.wav')
