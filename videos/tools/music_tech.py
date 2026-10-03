"""Calm bed for the Segue technical film: 160 BPM grid felt in half-time, soft drums,
pad and plucks, no risers or booms. Soft tones land on the picture's cues (src/tech/cues.ts).

  uv run --with numpy --with scipy python tools/music_tech.py
"""
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt

SR, BEAT, BAR, BARS = 48000, 0.375, 1.5, 30
N = int(BARS * BAR * SR)
rng = np.random.default_rng(11)
tb = lambda bar, beat=1, frac=0.0: (bar - 1) * BAR + (beat - 1 + frac) * BEAT
mtof = lambda m: 440.0 * 2 ** ((m - 69) / 12)
tt = lambda d: np.arange(int(d * SR)) / SR
filt = lambda x, kind, f: sosfilt(butter(2, f, btype=kind, fs=SR, output="sos"), x)
saw = lambda f, t, d=0.0: 2 * ((f * (1 + d)) * t - np.floor((f * (1 + d)) * t + 0.5))


class Bus:
    def __init__(self):
        self.x = np.zeros(N + SR * 4)

    def add(self, at, sig, gain=1.0):
        i = max(0, int(round(at * SR)))
        j = min(len(self.x), i + len(sig))
        self.x[i:j] += sig[: j - i] * gain


drums, bass, pad, arp, fx = Bus(), Bus(), Bus(), Bus(), Bus()


def kick():
    t = tt(0.4)
    return np.sin(2 * np.pi * np.cumsum(45 + 70 * np.exp(-t / 0.04)) / SR) * np.exp(-t / 0.17)


def rim():
    t = tt(0.2)
    return filt(rng.standard_normal(len(t)), "bandpass", [1200, 3500]) * np.exp(-t / 0.05) * 0.4


def hat():
    t = tt(0.05)
    return filt(rng.standard_normal(len(t)), "highpass", 8000) * np.exp(-t / 0.014) * 0.25


def sub(m, dur):
    t = tt(dur)
    f = mtof(m)
    env = np.minimum(1, t / 0.03) * np.minimum(1, (dur - t) / 0.15)
    return (np.sin(2 * np.pi * f * t) + 0.3 * filt(saw(f, t), "lowpass", 500)) * env * 0.4


def pad_chord(notes, dur):
    t = tt(dur + 0.8)
    x = sum(saw(mtof(m), t, d) for m in notes for d in (-0.004, 0, 0.005))
    env = np.minimum(1, t / 0.5) * np.where(t > dur, np.exp(-(t - dur) / 0.35), 1)
    return filt(x * env, "lowpass", 1300) * 0.07


def pluck(m, gain=0.2):
    t = tt(0.5)
    f = mtof(m)
    x = np.sin(2 * np.pi * f * t) + 0.4 * saw(f, t)
    return filt(x * np.minimum(1, t / 0.003) * np.exp(-t / 0.11), "lowpass", 2400) * gain


def bell(m, dur=1.0, gain=0.2):
    t = tt(dur)
    f = mtof(m)
    return (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t / 0.1)) * np.exp(-t / 0.35) * np.minimum(1, t / 0.003) * gain


def pop(m=84, gain=0.16):
    t = tt(0.1)
    return np.sin(2 * np.pi * np.cumsum(mtof(m) * (1 + 0.4 * np.exp(-t / 0.012))) / SR) * np.exp(-t / 0.03) * gain


PROG = [(33, [57, 60, 64], [69, 72, 76, 79]), (29, [57, 60, 65], [69, 72, 77, 81]), (36, [55, 60, 64], [67, 72, 76, 79]), (31, [55, 59, 62], [67, 71, 74, 79])]
groove = lambda bar: 4 <= bar <= 23 or 27 <= bar <= 29

for bar in range(1, BARS + 1):
    root, notes, arpn = PROG[(bar - 1) % 4]
    pad.add(tb(bar), pad_chord(notes, BAR), 1.3 if bar == 30 else 1.0)
    if groove(bar):
        drums.add(tb(bar, 1), kick(), 0.8)
        drums.add(tb(bar, 3), rim(), 0.7)
        drums.add(tb(bar, 4, 0.5), kick(), 0.45)
        for s in range(8):
            drums.add(tb(bar, 1, s / 2), hat(), 0.5 if s % 2 else 0.3)
        bass.add(tb(bar), sub(root, BAR * 0.95))
    if bar >= 4 and bar < 30:
        for s in range(8):
            arp.add(tb(bar, 1, s / 2), pluck(arpn[(s * 3) % 4], 0.2 if groove(bar) else 0.14), 1.0 if s % 2 == 0 else 0.6)

# Cues (seconds): soft tones only.
for at, m in [(0.0, 72), (1.5, 76), (3.0, 67)]:
    fx.add(at, bell(m, gain=0.14))
fx.add(4.5, bell(81, gain=0.16))
for k in range(4):
    fx.add(8.1 + k * 0.15, pop(79 + k * 2))
fx.add(tb(8) + 1.9, bell(76, gain=0.15))
for i in range(5):
    fx.add(tb(12) + i * 0.75, pop(81 + i))
for i in range(5):
    fx.add(tb(15) + 0.3 + i * 0.22, pop(84 + (i % 2) * 3, 0.1))
for k, at in enumerate([0.6, 1.6, 2.6, 3.8, 4.9]):
    fx.add(tb(17) + at, pop(76 + k * 2, 0.14))
fx.add(tb(21), bell(84, gain=0.16))
for i in range(5):
    fx.add(tb(21) + 1.2 + i * 0.12, pop(88 - i, 0.1))
for bar, m in [(24, 76), (25, 79), (26, 84)]:
    fx.add(tb(bar, 2), bell(m, gain=0.16))
fx.add(tb(27), bell(69, 2.5, 0.18))
fx.add(tb(27), bell(76, 2.5, 0.14))
fx.add(tb(28, 3), bell(84, gain=0.14))


def reverb(x, seconds, mix):
    t = tt(seconds)
    ir = filt(rng.standard_normal(len(t)) * np.exp(-t / (seconds / 5)), "lowpass", 5000)
    ir /= np.sqrt(np.sum(ir**2))
    return x * (1 - mix) + fftconvolve(x, ir)[: len(x)] * mix


mono = drums.x * 0.7 + bass.x * 0.8 + reverb(pad.x, 2.2, 0.5) + reverb(arp.x, 1.5, 0.35) * 0.8 + reverb(fx.x, 1.4, 0.25) * 0.9
wide = reverb(arp.x, 1.5, 0.35) * 0.2
d = int(0.012 * SR)
shift = np.concatenate([np.zeros(d), wide[:-d]])
stereo = np.stack([mono + shift, mono - shift * 0.6], axis=1)[:N]
fade = int(1.0 * SR)
stereo[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
stereo = np.tanh(stereo)
stereo /= np.max(np.abs(stereo)) / 0.8
out = Path(__file__).resolve().parents[1] / "public/audio/segue-tech-mix.wav"
wavfile.write(out, SR, (stereo * 32767).astype(np.int16))
print(out, f"{len(stereo) / SR:.2f}s")
