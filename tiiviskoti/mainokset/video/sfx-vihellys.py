#!/usr/bin/env python3
"""
Viheltävä ovi -mainoksen ääni (Kulmat.tsx → Viheltaa, 12.10.2026).

  python3 tiiviskoti/mainokset/video/sfx-vihellys.py

Tuuli + oven raosta tuleva vihellys, joka KATKEAA kun tiiviste on painettu
karmiin (VIHELTAA_HUSH). Sen jälkeen tuuli jää vaimeana pohjaksi —
pelkkä hiljaisuus kuulostaa katkenneelta tiedostolta, ei rauhalta.

Ajat ruutuina 25 fps:llä, pidettävä samoina kuin Kulmat.tsx:ssä:
  TOTAL = VIHELTAA_FRAMES, HUSH = VIHELTAA_HUSH.

Ei scipyä (ks. scipy_less.py): suodatus FFT:llä.
"""
import os, sys, wave
import numpy as np

# --b: TK63 "Kuuletko tuon?" -versio — vihellys soi heti ruudusta 0
# (koukku nojaa ääneen), muuten identtinen. Kirjoittaa vihellys-b.wav.
B = '--b' in sys.argv

FPS = 25
TOTAL = 395
HUSH = 166
SR = 48000
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   'remotion', 'public', 'ikkuna-ovi', 'vihellys-b.wav' if B else 'vihellys.wav')

rng = np.random.default_rng(7)
n = int(TOTAL / FPS * SR)
t = np.arange(n) / SR
hush = HUSH / FPS


def band(x, lo, hi):
    """Kaistanpäästö FFT:llä, pehmeät reunat ettei suodin soi."""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    g = np.clip((f - lo * 0.7) / (lo * 0.3), 0, 1) * np.clip((hi * 1.3 - f) / (hi * 0.3), 0, 1)
    return np.fft.irfft(X * g, len(x))


def smooth_noise(rate_hz, seed):
    """Hidas satunnaiskäyrä 0..1 (puuskat)."""
    r = np.random.default_rng(seed)
    k = int(TOTAL / FPS * rate_hz) + 3
    pts = r.random(k)
    return np.interp(t * rate_hz, np.arange(k), pts)


def rms(x):
    return np.sqrt(np.mean(x ** 2))


# Puuskat: yhteinen käyrä tuulelle ja vihellykselle — vihellys nousee kun
# tuuli voimistuu, niin kuin oikeassa raossa.
gust = 0.35 + 0.65 * smooth_noise(0.9, 3) ** 1.5

# Tuuli: kaksi kaistaa kohinaa.
wind = band(rng.standard_normal(n), 80, 700) * 1.0 + band(rng.standard_normal(n), 700, 2500) * 0.25
wind = wind / rms(wind)

# Vihellys: siniääni jonka korkeus seuraa puuskaa + pieni huojunta, ja
# kapea kohinakaista samalla taajuudella (pelkkä sini kuulostaa koneelta).
f0 = 1050 + 330 * gust + 18 * np.sin(2 * np.pi * 5.2 * t)
phase = 2 * np.pi * np.cumsum(f0) / SR
whistle = np.sin(phase) + 0.18 * np.sin(2 * phase)
air = band(rng.standard_normal(n), 1050, 1450)
whistle = whistle / rms(whistle) + 0.6 * air / rms(air)
# Vihellys ei ole päällä koko ajan: kynnys puuskassa.
wenv = np.clip((gust - 0.45) / 0.3, 0, 1) ** 1.3
if B:
    # Täysi vihellys 0–3,2 s, liukuu sitten puuskakäyrään.
    early = np.clip((3.8 - t) / 0.6, 0, 1)
    wenv = np.maximum(wenv, early)
    gust = np.maximum(gust, 0.75 * early)

# Katkaisu: vihellys pois 0,25 s:ssa, tuuli vaimenee −20 dB 0,6 s:ssa.
cut = np.clip(1 - (t - hush) / 0.25, 0, 1)
duck = np.where(t < hush, 1.0, 0.1 + 0.9 * np.clip(1 - (t - hush) / 0.6, 0, 1))

fade_in = np.clip(t / 0.15, 0, 1)
fade_out = np.clip((TOTAL / FPS - t) / 1.0, 0, 1)

mix = (0.30 * wind * gust * duck + 0.55 * whistle * wenv * cut) * fade_in * fade_out

# Pieni "tump" kun tiiviste painuu paikalleen — iskun paikka.
k = (t >= hush - 0.02) & (t < hush + 0.25)
tt = t[k] - (hush - 0.02)
mix[k] += 0.9 * np.sin(2 * np.pi * 85 * tt) * np.exp(-tt * 22)

# Normalisoi huippuun −3 dBFS, tarkista että vihellys on kovempi kuin pohja.
mix = mix / np.max(np.abs(mix)) * 10 ** (-3 / 20)
pre = mix[(t > 1) & (t < hush - 0.5)]
post = mix[(t > hush + 1) & (t < TOTAL / FPS - 1.5)]
print(f'ennen {20*np.log10(rms(pre)):.1f} dB, jälkeen {20*np.log10(rms(post)):.1f} dB')

pcm = (np.stack([mix, mix], axis=1) * 32767).astype('<i2')
with wave.open(OUT, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print(OUT)
