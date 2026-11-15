"""Biblioteca mínima de síntese para os sons do Raven Creek (tudo gerado por código, sem amostras externas)."""
import numpy as np
from scipy import signal

SR = 44100
rng = np.random.default_rng(1234)


def t_axis(dur, sr=SR):
    return np.arange(int(dur * sr)) / sr


def white(n):
    return rng.standard_normal(n)


def pink(n):
    # Filtro de Paul Kellet (aproximação de ruído rosa)
    w = white(n)
    b = [0.049922035, -0.095993537, 0.050612699, -0.004408786]
    a = [1, -2.494956002, 2.017265875, -0.522189400]
    return signal.lfilter(b, a, w) * 4


def brown(n):
    x = np.cumsum(white(n)) * 0.02
    return highpass(x, 15)


def _sos(kind, f, sr=SR, order=2):
    nyq = sr / 2
    if kind == 'band':
        lo, hi = f
        return signal.butter(order, [max(lo, 1) / nyq, min(hi, nyq * 0.98) / nyq], btype='band', output='sos')
    return signal.butter(order, min(f, nyq * 0.98) / nyq, btype=kind, output='sos')


def lowpass(x, f, order=2, sr=SR):
    return signal.sosfilt(_sos('low', f, sr, order), x, axis=0)


def highpass(x, f, order=2, sr=SR):
    return signal.sosfilt(_sos('high', f, sr, order), x, axis=0)


def bandpass(x, lo, hi, order=2, sr=SR):
    return signal.sosfilt(_sos('band', (lo, hi), sr, order), x, axis=0)


def peak(x, f, q=8, sr=SR):
    b, a = signal.iirpeak(f, q, fs=sr)
    return signal.lfilter(b, a, x, axis=0)


def sweep_filter(x, f_start, f_end, width=1.0, steps=24, sr=SR):
    """Passa-banda que se move no tempo (mistura de bandas com pesos variáveis)."""
    n = len(x)
    out = np.zeros(n)
    centers = np.geomspace(f_start, f_end, steps)
    seg = n / steps
    pos = np.arange(n)
    for i, c in enumerate(centers):
        y = bandpass(x, c / (1 + width / 2), c * (1 + width / 2), sr=sr)
        w = np.clip(1 - np.abs(pos - (i + 0.5) * seg) / seg, 0, 1)
        out += y * w
    return out


def env_exp(n, decay, sr=SR):
    return np.exp(-np.arange(n) / (decay * sr))


def env_adsr(n, a, d, s, r, sr=SR):
    A, D, R = int(a * sr), int(d * sr), int(r * sr)
    S = max(0, n - A - D - R)
    e = np.concatenate([np.linspace(0, 1, A, endpoint=False), np.linspace(1, s, D, endpoint=False), np.full(S, s), np.linspace(s, 0, R)])
    return np.pad(e, (0, max(0, n - len(e))))[:n]


def osc(freq, dur, kind='sine', phase=0.0, sr=SR):
    """freq pode ser escalar ou vetor (frequência variável)."""
    n = int(dur * sr)
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,)) if np.ndim(freq) == 0 else np.asarray(freq)[:n]
    ph = 2 * np.pi * np.cumsum(f) / sr + phase
    if kind == 'sine':
        return np.sin(ph)
    if kind == 'saw':
        return 2 * ((ph / (2 * np.pi)) % 1) - 1
    if kind == 'square':
        return np.sign(np.sin(ph))
    if kind == 'tri':
        return 2 * np.abs(2 * ((ph / (2 * np.pi)) % 1) - 1) - 1
    raise ValueError(kind)


def additive(freq, dur, harmonics=8, bright=3.0, detune=0.0, sr=SR, odd_only=False):
    """Timbre suave por soma de harmônicos; bright pode ser vetor (brilho variável no tempo)."""
    n = int(dur * sr)
    out = np.zeros(n)
    br = np.broadcast_to(np.asarray(bright, dtype=float), (n,)) if np.ndim(bright) == 0 else np.asarray(bright)[:n]
    for h in range(1, harmonics + 1):
        if odd_only and h % 2 == 0:
            continue
        f = freq * h * (1 + detune * (h - 1) * 0.001)
        if np.max(np.atleast_1d(f)) > sr / 2.2:
            break
        out += osc(f, dur, 'sine', phase=rng.uniform(0, 6.28), sr=sr) * (1 / h) * np.exp(-(h - 1) / np.maximum(br, 0.05))
    return out


def reverb_ir(dur=2.5, damp=4000, sr=SR, pre=0.01, stereo=False):
    n = int(dur * sr)
    def one():
        ir = white(n) * np.exp(-np.arange(n) / (dur / 6.9 * sr))
        ir = lowpass(ir, damp)
        ir = np.concatenate([np.zeros(int(pre * sr)), ir])
        return ir / np.sqrt(np.sum(ir ** 2))
    return np.stack([one(), one()], axis=1) if stereo else one()


def reverb(x, dur=2.5, wet=0.3, damp=4000, sr=SR, pre=0.015):
    if x.ndim == 1:
        ir = reverb_ir(dur, damp, sr, pre)
        y = signal.fftconvolve(x, ir)[:len(x)]
    else:
        ir = reverb_ir(dur, damp, sr, pre, stereo=True)
        y = np.stack([signal.fftconvolve(x[:, c], ir[:, c])[:len(x)] for c in range(x.shape[1])], axis=1)
    return x * (1 - wet) + y * wet * 1.2


def place(buf, snd, t, gain=1.0, sr=SR):
    i = int(t * sr)
    if i >= len(buf):
        return
    m = min(len(snd), len(buf) - i)
    buf[i:i + m] += snd[:m] * gain


def normalize(x, peak_db=-1.0):
    p = np.max(np.abs(x)) or 1
    return x / p * (10 ** (peak_db / 20))


def rms_normalize(x, rms_db=-20.0, peak_db=-1.0):
    r = np.sqrt(np.mean(x ** 2)) or 1
    y = x / r * (10 ** (rms_db / 20))
    p = np.max(np.abs(y))
    lim = 10 ** (peak_db / 20)
    if p > lim:  # limitador suave
        y = np.tanh(y / lim) * lim
    return y


def fade(x, fin=0.005, fout=0.01, sr=SR):
    x = x.copy()
    a, b = int(fin * sr), int(fout * sr)
    if a:
        x[:a] *= np.linspace(0, 1, a)[:, None] if x.ndim == 2 else np.linspace(0, 1, a)
    if b:
        x[-b:] *= np.linspace(1, 0, b)[:, None] if x.ndim == 2 else np.linspace(1, 0, b)
    return x


def loopify(x, loop_len, xf, sr=SR):
    """x tem loop_len + xf segundos; mistura a cauda no começo para o loop não ter emenda."""
    L, X = int(loop_len * sr), int(xf * sr)
    out = x[:L].copy()
    w = np.linspace(0, 1, X)
    if x.ndim == 2:
        w = w[:, None]
    out[:X] = x[:X] * np.sqrt(w) + x[L:L + X] * np.sqrt(1 - w)
    return out


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def stereo(l, r):
    return np.stack([l, r], axis=1)
