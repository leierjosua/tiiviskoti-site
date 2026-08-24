"""Syntetisoi widgetin äänitehosteet. Ei valmiita samplekirjastoja: nämä
tehdään numpylla, joten lisenssistä ei tarvitse huolehtia.

Sävy on hillitty — kyseessä on rakennusalan palvelu, ei peli. Tehosteet
istuvat puheen ALLE (huippu n. -18 dBFS), eivät sen päälle.
"""
import json, sys
import numpy as np
from scipy_less import write_wav   # ks. alla

SR = 48000

def env(n, attack, decay, curve=3.0):
    a = int(SR*attack); d = n - a
    e = np.concatenate([np.linspace(0, 1, max(a, 1))**0.6,
                        np.linspace(1, 0, max(d, 1))**curve])
    return e[:n]

def noise_whoosh(dur=0.34, f0=300, f1=2200):
    n = int(SR*dur)
    x = np.random.RandomState(7).normal(0, 1, n)
    # yksinkertainen liukuva alipäästö: pyyhkäisy matalasta ylös ja takaisin
    sweep = np.concatenate([np.linspace(f0, f1, n//2), np.linspace(f1, f0*1.6, n-n//2)])
    y = np.zeros(n); prev = 0.0
    for i in range(n):
        alpha = 1 - np.exp(-2*np.pi*sweep[i]/SR)
        prev += alpha*(x[i]-prev); y[i] = prev
    return y*env(n, 0.06, dur-0.06, 2.2)

def tone(freq, dur, harm=(1.0,), decay=6.0):
    n = int(SR*dur); t = np.arange(n)/SR
    y = sum(a*np.sin(2*np.pi*freq*k*t) for k, a in enumerate(harm, start=1))
    return y*env(n, 0.004, dur-0.004, decay)

def place(track, sig, at, gain):
    i = int(at*SR)
    j = min(len(track), i+len(sig))
    if i < len(track):
        track[i:j] += sig[:j-i]*gain

def build(vid, dur, cta_t, out):
    n = int(SR*dur); tr = np.zeros(n)
    span = max(0.1, dur - cta_t)

    # Kortti nousee: pyyhkäisy + pehmeä naps kun se asettuu paikalleen.
    place(tr, noise_whoosh(), cta_t - 0.05, 0.16)
    place(tr, tone(660, 0.09, (1.0, 0.35), 9), cta_t + 0.22, 0.13)

    # Askeleet: sävel nousee joka askeleella — kuulostaa etenemiseltä.
    for k, (f, off) in enumerate(zip((1650, 1850, 2100), (0.02, 0.22, 0.42))):
        place(tr, tone(f, 0.045, (1.0, 0.2), 14), cta_t + off*span + 0.10, 0.075)

    # Hintapalkki: matala tömäys + hento kimallus.
    place(tr, tone(140, 0.26, (1.0, 0.5, 0.25), 4), cta_t + 0.6*span, 0.14)
    place(tr, tone(2400, 0.16, (1.0, 0.4), 7), cta_t + 0.6*span + 0.03, 0.045)

    peak = np.abs(tr).max()
    if peak > 0:
        tr = tr/peak*0.125          # n. -18 dBFS, puheen alle
    write_wav(out, np.stack([tr, tr], 1), SR)
    print(f'✓ {out}  {dur:.2f}s  huippu {20*np.log10(0.125):.1f} dBFS')

if __name__ == '__main__':
    words = json.load(open('words-aligned.json'))
    DUR = {1: 13.354667, 2: 14.272, 3: 15.786667}
    for v in (1, 2, 3):
        ws = words[str(v)]
        cta = next((w['a'] for w in ws if w['w'].lower().startswith('varaa')), DUR[v]-4)
        build(v, DUR[v], cta, f'sfx/v{v}.wav')
