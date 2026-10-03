"""Segue beat bed: synthesized, license-free, cut to the film's grid.

160 BPM, 30 bars (45 s), A minor / C major (Am-F-C-G).
Map (bars): 1-2 hook (drone, ticks, riser, gate-closed hit) | 3-20 full groove
(arp from 9) | 21-23 breakdown (pad + arp, riser) | 24-29 drop | 30 ring-out.
SFX land on the same cues as the picture (src/film/cues.ts and the acts).

  uv run --with numpy --with scipy python tools/music.py
"""
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt

SR = 48000
BPM = 160
BEAT = 60 / BPM
BAR = 4 * BEAT
BARS = 30
DUR = BARS * BAR
N = int(DUR * SR)
rng = np.random.default_rng(7)


def b(bar, beat=1, frac=0.0):
    """Story bars: the hook owns real bars 1-3, so story bar 3+ sits one real bar later (src/film/cues.ts)."""
    return (bar - 1 + (1 if bar >= 3 else 0)) * BAR + (beat - 1 + frac) * BEAT


STORY_BARS = 29


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tt(dur):
    return np.arange(int(dur * SR)) / SR


def filt(x, kind, freq, order=2):
    sos = butter(order, freq, btype=kind, fs=SR, output="sos")
    return sosfilt(sos, x)


def saw(f, t, detune=0.0):
    ph = (f * (1 + detune)) * t
    return 2 * (ph - np.floor(ph + 0.5))


class Bus:
    def __init__(self):
        self.x = np.zeros(N + SR * 3)

    def add(self, at, sig, gain=1.0):
        i = int(round(at * SR))
        if i < 0:
            sig = sig[-i:]
            i = 0
        j = min(len(self.x), i + len(sig))
        self.x[i:j] += sig[: j - i] * gain


drums, bass, pad, arp, fx, hook = Bus(), Bus(), Bus(), Bus(), Bus(), Bus()

# ---------- instruments ----------

def kick():
    t = tt(0.42)
    f = 45 + 110 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / 0.16)
    click = filt(rng.standard_normal(len(t)), "highpass", 2500) * np.exp(-t / 0.004) * 0.3
    return np.tanh((body + click) * 1.6)


def clap():
    t = tt(0.3)
    n = filt(rng.standard_normal(len(t)), "bandpass", [900, 3200])
    env = np.zeros_like(t)
    for d in (0, 0.011, 0.022):
        env += (t >= d) * np.exp(-np.maximum(t - d, 0) / (0.012 if d < 0.02 else 0.12))
    return n * env * 0.7


def hat(open_=False):
    t = tt(0.25 if open_ else 0.06)
    n = filt(rng.standard_normal(len(t)), "highpass", 7500)
    return n * np.exp(-t / (0.09 if open_ else 0.018)) * 0.35


def crash():
    t = tt(2.2)
    n = filt(rng.standard_normal(len(t)), "highpass", 4500)
    return n * np.exp(-t / 0.7) * 0.35


def bass_note(m, dur=0.2):
    t = tt(dur)
    f = mtof(m)
    x = saw(f, t) + saw(f, t, 0.006) * 0.7 + np.sin(2 * np.pi * f * t) * 0.9
    env = np.minimum(1, t / 0.004) * np.exp(-t / 0.16)
    return filt(x * env, "lowpass", 700) * 0.55


def pad_chord(notes, dur):
    t = tt(dur + 0.6)
    x = np.zeros_like(t)
    for m in notes:
        f = mtof(m)
        for d in (-0.004, 0.0, 0.005):
            x += saw(f, t, d)
    env = np.minimum(1, t / 0.25) * np.where(t > dur, np.exp(-(t - dur) / 0.25), 1)
    return filt(x * env, "lowpass", 1600) * 0.07


def pluck(m, dur=0.22, bright=3200):
    t = tt(dur)
    f = mtof(m)
    x = saw(f, t) * 0.6 + np.sign(np.sin(2 * np.pi * f * t)) * 0.25 + np.sin(2 * np.pi * f * t) * 0.5
    env = np.minimum(1, t / 0.002) * np.exp(-t / 0.075)
    return filt(x * env, "lowpass", bright) * 0.22


def bell(m, dur=0.9, gain=0.3):
    t = tt(dur)
    f = mtof(m)
    x = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t / 0.12) + 0.2 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t / 0.05)
    return x * np.exp(-t / 0.35) * np.minimum(1, t / 0.002) * gain


def pop(m=84, gain=0.25):
    t = tt(0.09)
    f = mtof(m) * (1 + 0.6 * np.exp(-t / 0.01))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.025) * gain


def whoosh(length=0.55, low=300, high=4000, gain=0.32):
    """Peak at the middle of `length`: place with at = cue - length/2."""
    t = tt(length)
    n = rng.standard_normal(len(t))
    out = np.zeros_like(t)
    seg = 8
    for k in range(seg):
        a, c = k * len(t) // seg, (k + 1) * len(t) // seg
        u = (k + 0.5) / seg
        fc = low * (high / low) ** np.sin(np.pi * u)
        out[a:c] = filt(n, "bandpass", [fc * 0.6, min(fc * 1.6, 20000)])[a:c]
    env = np.sin(np.pi * t / length) ** 2
    return out * env * gain


def riser(length, gain=0.3):
    t = tt(length)
    n = rng.standard_normal(len(t))
    out = np.zeros_like(t)
    seg = 16
    for k in range(seg):
        a, c = k * len(t) // seg, (k + 1) * len(t) // seg
        fc = 400 * (12000 / 400) ** (k / seg)
        out[a:c] = filt(n, "bandpass", [fc * 0.7, min(fc * 1.4, 22000)])[a:c]
    sweep = np.sin(2 * np.pi * np.cumsum(220 * 4 ** (t / length)) / SR) * 0.25
    return (out + sweep) * (t / length) ** 2 * gain


def boom(gain=0.8):
    t = tt(1.4)
    f = 32 + 60 * np.exp(-t / 0.08)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.5)
    n = filt(rng.standard_normal(len(t)), "lowpass", 900) * np.exp(-t / 0.18) * 0.5
    return np.tanh((x + n) * 1.4) * gain


def buzzer(gain=0.18):
    t = tt(0.42)
    x = np.zeros_like(t)
    for f, a, d in ((330, 0, 0.18), (247, 0.2, 0.22)):
        m = (t >= a) & (t < a + d)
        x += m * saw(f, t) * 0.6
    return filt(x, "lowpass", 2400) * gain


def tick(gain=0.12):
    t = tt(0.03)
    return np.sin(2 * np.pi * 3200 * t) * np.exp(-t / 0.006) * gain


# ---------- arrangement ----------
PROG = [
    (33, [57, 60, 64], [69, 72, 76, 81]),  # Am
    (29, [57, 60, 65], [65, 69, 72, 77]),  # F
    (36, [55, 60, 64], [67, 72, 76, 79]),  # C
    (31, [55, 59, 62], [67, 71, 74, 79]),  # G
]


def chord(bar):
    return PROG[(bar - 3) % 4]


groove = lambda bar: 3 <= bar <= 20 or 24 <= bar <= 28

for bar in range(1, STORY_BARS + 1):
    root, notes, arpn = chord(bar)
    if groove(bar):
        for beat in range(1, 5):
            drums.add(b(bar, beat), kick(), 0.9)
            if beat in (2, 4):
                drums.add(b(bar, beat), clap(), 0.8)
            for s in range(4):
                drums.add(b(bar, beat, s / 4), hat(open_=(s == 2)), 0.55 if s == 2 else 0.3)
            # Offbeat bass, a pickup on the last 16th.
            bass.add(b(bar, beat, 0.5), bass_note(root + 12 * (beat == 4 and bar % 2 == 0)), 1.0)
            bass.add(b(bar, beat, 0.75), bass_note(root, 0.12), 0.5)
        if bar >= 9 or bar >= 24:
            for s in range(16):
                m = arpn[(s * 3) % 4] + (12 if (bar >= 24 and s % 4 == 3) else 0)
                arp.add(b(bar, 1 + s // 4, (s % 4) / 4), pluck(m, bright=2600 if bar < 24 else 4200), 0.9 if s % 4 == 0 else 0.6)
    if bar >= 3:
        pad.add(b(bar), pad_chord(notes, BAR), 1.0 if bar < STORY_BARS else 1.4)
    if 21 <= bar <= 23:
        for s in range(8):
            arp.add(b(bar, 1 + s // 2, (s % 2) / 2), pluck(arpn[s % 4] + 12, 0.4, 1800), 0.5)

# Hook (0-4.5 s): soft drone and a gentle clock under three statements, the miss at 3.0 s, a riser into Meet.
t_h = tt(b(3))
drone = (saw(mtof(45), t_h) + saw(mtof(52), t_h, 0.004) * 0.7) * np.minimum(1, t_h / 0.6)
hook.add(0, filt(drone, "lowpass", 600) * 0.09)
for s_ in range(24):
    hook.add(s_ * BEAT / 2, tick(0.05 + 0.05 * s_ / 24))
hook.add(0.0, bell(72, gain=0.12))   # Priya lands late
hook.add(1.5, bell(76, gain=0.12))   # her next flight
fx.add(3.0, boom(0.5))               # she misses it
fx.add(3.0, buzzer(0.12))
fx.add(3.4, riser(b(3) - 3.4, 0.22))
fx.add(b(3), crash(), 0.6)

# Meet: a bright bell on "Segue."
fx.add(b(3, 3), bell(81, gain=0.22))
fx.add(b(3, 3), bell(88, gain=0.12))

# Camera whips: whoosh peaks land on the moves.
for cue in [b(4) + 0.1, b(7, 3) + 0.2, b(9) - 0.1, b(11) - 0.2, b(13) - 0.1, b(15), b(15, 3) + 0.1, b(17) - 0.1, b(19) + 0.1]:
    fx.add(cue - 0.45, whoosh(0.9, gain=0.2))

# Product events.
fx.add(b(5, 1), bell(84, gain=0.16))  # scanned
fx.add(b(5, 1) + 0.09, bell(88, gain=0.13))
fx.add(b(6, 1), bell(76, gain=0.16))  # delay toast
fx.add(b(6, 3), pop(72, 0.2))  # Tight
fx.add(b(6, 4), buzzer(0.1))  # At Risk
for i in range(4):
    fx.add(b(8, 1, 0.1 + i * 0.5), pop(79 + i * 2, 0.14))  # crew rows
for at in (b(9, 1, 0.6), b(9, 3, 0.2), b(10, 4)):
    fx.add(at, pop(86, 0.2))  # messages
fx.add(b(10, 1), bell(79, gain=0.12))  # route card
fx.add(b(12, 2), pop(96, 0.3))  # click
fx.add(b(12, 2) + 0.3, bell(84, gain=0.16))  # approved
fx.add(b(12, 2) + 0.39, bell(91, gain=0.12))
fx.add(b(13, 1, 0.5), pop(81, 0.12))
fx.add(b(13, 3), pop(83, 0.12))
fx.add(b(14, 1), bell(86, gain=0.14))  # fast-track granted
fx.add(b(14, 2), bell(84, gain=0.15))  # bag on board
# Snare roll into the payoff.
for s in range(8):
    drums.add(b(14, 3, s / 4), clap(), 0.25 + 0.06 * s)
fx.add(b(15), crash(), 0.8)
fx.add(b(16, 1, 0.3), bell(84, gain=0.2))  # boarded
fx.add(b(16, 1, 0.3) + 0.1, bell(88, gain=0.16))
fx.add(b(16, 1, 0.3) + 0.2, bell(91, gain=0.14))
# Breakdown riser and roll into the drop.
fx.add(b(22, 3), riser(b(24) - b(22, 3), 0.32))
for s in range(16):
    drums.add(b(23, 1, s / 4), clap(), 0.12 + 0.03 * s)
fx.add(b(24), crash(), 1.0)
fx.add(b(24), boom(0.75))
fx.add(b(24, 2), bell(81, gain=0.14))
for i in range(12):
    fx.add(b(25, 1) + i * BEAT / 2, pop([81, 84, 88, 86, 84, 88, 91, 89, 88, 91, 93, 96][i], 0.12))  # mascot crew
fx.add(b(25, 3), bell(84, gain=0.18))  # URL
fx.add(b(28), crash(), 0.6)
fx.add(b(29), bell(69, 2.5, 0.2))
fx.add(b(29), bell(76, 2.5, 0.15))

# ---------- mix ----------
# Sidechain the bass and pad under every kick.
sc = np.ones(len(drums.x))
for bar in range(1, STORY_BARS + 1):
    if groove(bar):
        for beat in range(1, 5):
            i = int(b(bar, beat) * SR)
            k = tt(BEAT)
            sc[i : i + len(k)] = np.minimum(sc[i : i + len(k)], 1 - 0.65 * np.exp(-k / 0.07))


def reverb(x, seconds=1.6, mix=0.25):
    t = tt(seconds)
    ir = rng.standard_normal(len(t)) * np.exp(-t / (seconds / 5))
    ir = filt(ir, "lowpass", 5000)
    ir /= np.sqrt(np.sum(ir**2))
    wet = fftconvolve(x, ir)[: len(x)]
    return x * (1 - mix) + wet * mix


music = drums.x * 0.9 + bass.x * sc * 0.9 + reverb(pad.x * sc, 2.0, 0.45) + reverb(arp.x, 1.2, 0.3) * 0.8 + reverb(hook.x, 1.0, 0.2)
effects = reverb(fx.x, 1.3, 0.22)
mono = music * 0.8 + effects * 0.9
# Stereo: widen the pad/arp a touch with a short Haas delay on one side.
wide = reverb(pad.x * sc, 2.0, 0.45) * 0.25 + arp.x * 0.15
d = int(0.012 * SR)
left = mono + np.concatenate([np.zeros(d), wide[:-d]])
right = mono - np.concatenate([np.zeros(d), wide[:-d]]) * 0.6

stereo = np.stack([left, right], axis=1)[:N]
# Ring-out fade over the last half bar.
fade = int(0.6 * SR)
stereo[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
stereo = np.tanh(stereo * 1.1)
stereo /= np.max(np.abs(stereo)) / 0.89

out = Path(__file__).resolve().parents[1] / "public/audio/segue-mix.wav"
out.parent.mkdir(parents=True, exist_ok=True)
wavfile.write(out, SR, (stereo * 32767).astype(np.int16))
print(out, f"{len(stereo) / SR:.2f}s")
