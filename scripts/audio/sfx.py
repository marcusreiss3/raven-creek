"""Efeitos sonoros do Raven Creek, sintetizados."""
import sys, os, subprocess
import numpy as np
from synth import *

OUT = sys.argv[1] if len(sys.argv) > 1 else 'out/sfx'
os.makedirs(OUT, exist_ok=True)


def save(name, x, sr=SR, q=4):
    x = np.asarray(x, dtype=np.float64)
    x = np.clip(x, -1, 1)
    raw = (x * 32767).astype('<i2').tobytes()
    ch = 1 if x.ndim == 1 else x.shape[1]
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', str(sr), '-ac', str(ch), '-i', '-',
                    '-c:a', 'libvorbis', '-q:a', str(q), f'{OUT}/{name}.ogg'], input=raw, check=True)
    print(name, f'{len(x)/sr:.2f}s')


# ───────────────────────── ambientes em loop
def rain(dur=24, xf=3):
    n = int((dur + xf) * SR)
    bed = bandpass(pink(n), 400, 9000) * 0.5 + lowpass(brown(n), 600) * 0.6
    mod = 1 + 0.15 * np.sin(2 * np.pi * 0.07 * t_axis(dur + xf))
    bed *= mod
    drops = np.zeros(n)
    for _ in range(int((dur + xf) * 90)):
        d = int(rng.uniform(0.002, 0.012) * SR)
        f = rng.uniform(1500, 6000)
        s = bandpass(white(d + 400), f * 0.7, f * 1.3) * env_exp(d + 400, rng.uniform(0.002, 0.008))
        place(drops, s, rng.uniform(0, dur + xf - 0.05), rng.uniform(0.05, 0.4))
    # gotas pesadas batendo em calha/telhado
    for _ in range(int((dur + xf) * 3)):
        d = int(0.08 * SR)
        s = osc(rng.uniform(300, 900), 0.08) * env_exp(d, 0.015) + bandpass(white(d), 800, 3000) * env_exp(d, 0.01)
        place(drops, s, rng.uniform(0, dur + xf - 0.1), rng.uniform(0.05, 0.15))
    x = bed + drops * 0.6
    x = lowpass(reverb(x, 1.2, 0.25, 5000), 6500, order=2) + lowpass(brown(n), 300) * 0.25
    save('rain', rms_normalize(loopify(x, dur, xf), -20))


def wind(dur=28, xf=4):
    T = dur + xf
    n = int(T * SR)
    t = t_axis(T)
    x = np.zeros(n)
    for lo, hi, rate, g in [(80, 300, 0.05, 0.9), (250, 900, 0.09, 0.5), (700, 2200, 0.13, 0.25)]:
        band = bandpass(pink(n), lo, hi, order=2)
        lfo = 0.55 + 0.45 * np.sin(2 * np.pi * rate * t + rng.uniform(0, 6)) * (0.6 + 0.4 * np.sin(2 * np.pi * rate * 0.37 * t + rng.uniform(0, 6)))
        x += band * lfo * g
    # assobio em frestas
    whistle_f = 650 + 120 * np.sin(2 * np.pi * 0.05 * t) + 60 * np.sin(2 * np.pi * 0.31 * t)
    wh = peak(white(n), 700, q=40) * 0.6 * np.clip(np.sin(2 * np.pi * 0.04 * t + 1), 0, 1) ** 2
    x += wh * 0.4 + osc(whistle_f, T) * 0.01 * np.clip(np.sin(2 * np.pi * 0.04 * t + 1), 0, 1) ** 3
    save('wind', rms_normalize(loopify(x, dur, xf), -21))


# ───────────────────────── passos, portas
def step(surface='floor'):
    d = int(0.18 * SR)
    thump = lowpass(white(d), 250) * env_exp(d, 0.025) * 2.5 + osc(np.linspace(110, 55, d), 0.18) * env_exp(d, 0.03) * 0.5
    grit = bandpass(white(d), 1500, 6000) * env_exp(d, 0.02) * (0.5 if surface == 'gravel' else 0.12)
    crunch = np.zeros(d)
    if surface == 'gravel':
        for _ in range(14):
            place(crunch, bandpass(white(200), 2000, 7000) * env_exp(200, 0.0015), rng.uniform(0, 0.09), rng.uniform(0.1, 0.5))
    return thump + grit + crunch


def footsteps():
    buf = np.zeros(int(2.0 * SR))
    for i, tt in enumerate([0.05, 0.55, 1.03, 1.52]):
        place(buf, step('gravel'), tt + rng.uniform(-0.02, 0.02), 0.9 if i % 2 else 0.75)
    save('footsteps', normalize(fade(reverb(buf, 0.6, 0.15), 0.002, 0.05), -4))


def door_open():
    dur = 1.4
    n = int(dur * SR)
    t = t_axis(dur)
    # rangido: atrito "gruda-escorrega" = trem de pulsos com taxa variável
    rate = 90 + 70 * np.sin(2 * np.pi * 0.9 * t) + 40 * np.sin(2 * np.pi * 2.3 * t) + rng.normal(0, 6, n).cumsum() * 0.002
    ph = np.cumsum(rate) / SR
    pulses = (np.diff(np.floor(ph), prepend=0) > 0).astype(float)
    src = signal.lfilter([1], [1, -0.97], pulses)
    creak = peak(src, 900, 6) + peak(src, 1800, 8) * 0.6 + peak(src, 2700, 10) * 0.3
    creak *= env_adsr(n, 0.08, 0.2, 0.8, 0.35)
    latch = np.zeros(n)
    place(latch, bandpass(white(800), 2000, 8000) * env_exp(800, 0.003), 0.0, 1.5)
    x = creak / (np.max(np.abs(creak)) or 1) * 0.8 + latch
    save('door_open', normalize(reverb(x, 0.9, 0.25, 6000), -3))


def door_close():
    n = int(1.0 * SR)
    x = np.zeros(n)
    d = int(0.4 * SR)
    thud = lowpass(white(d), 180) * env_exp(d, 0.05) * 3 + osc(np.linspace(90, 50, d), 0.4) * env_exp(d, 0.08)
    wood = bandpass(white(d), 300, 1200) * env_exp(d, 0.03)
    place(x, thud + wood * 0.8, 0.0)
    place(x, bandpass(white(1500), 2500, 9000) * env_exp(1500, 0.004), 0.12, 0.6)  # trinco
    save('door_close', normalize(reverb(x, 1.0, 0.3, 4000), -2))


# ───────────────────────── interface
def ui_click():
    d = int(0.05 * SR)
    x = osc(2200, 0.05) * env_exp(d, 0.006) + bandpass(white(d), 3000, 8000) * env_exp(d, 0.002) * 0.4
    save('ui_click', normalize(fade(x, 0.0005, 0.01), -8))


def ui_open():
    d = int(0.22 * SR)
    sw = sweep_filter(white(d), 600, 3500, 0.6, 12) * env_adsr(d, 0.04, 0.05, 0.6, 0.12)
    tone = osc(np.linspace(520, 780, d), 0.22, 'tri') * env_adsr(d, 0.01, 0.08, 0.3, 0.12) * 0.25
    save('ui_open', normalize(fade(sw * 0.6 + tone, 0.002, 0.03), -10))


def ui_error():
    buf = np.zeros(int(0.32 * SR))
    for tt in (0.0, 0.14):
        d = int(0.11 * SR)
        place(buf, lowpass(osc(140, 0.11, 'square'), 1200) * env_adsr(d, 0.003, 0.02, 0.7, 0.03), tt, 0.5)
    save('ui_error', normalize(buf, -9))


def chat_message():
    buf = np.zeros(int(0.35 * SR))
    for tt, f in ((0.0, midi(76)), (0.07, midi(81))):
        d = int(0.25 * SR)
        place(buf, additive(f, 0.25, 4, 1.2) * env_exp(d, 0.06), tt, 0.5)
    save('chat_message', normalize(fade(reverb(buf, 0.6, 0.2), 0.001, 0.05), -12))


def notification():
    buf = np.zeros(int(0.7 * SR))
    for tt, f in ((0.0, midi(69)), (0.16, midi(64))):
        d = int(0.4 * SR)
        place(buf, additive(f, 0.4, 6, 2) * env_adsr(d, 0.005, 0.1, 0.4, 0.25), tt, 0.6)
    save('notification', normalize(fade(reverb(buf, 0.8, 0.25), 0.001, 0.08), -7))


# ───────────────────────── voz de infectado e dor (síntese por formantes)
def voice(f0, dur, formants, breath=0.3, fry=0.0, jitter=0.03, sr=SR):
    n = int(dur * sr)
    t = t_axis(dur)
    f = f0 * (1 + jitter * np.cumsum(rng.standard_normal(n)) / np.sqrt(n) * 4)
    src = osc(f, dur, 'saw')
    if fry:
        src *= 1 - fry + fry * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * rng.uniform(25, 40) * t)))
    src += white(n) * breath
    out = np.zeros(n)
    for fc, bw, g in formants:
        out += bandpass(src, fc - bw / 2, fc + bw / 2, order=2) * g
    return out


def zombie_groan():
    dur = 2.4
    n = int(dur * SR)
    t = t_axis(dur)
    f0 = 85 + 25 * np.sin(2 * np.pi * 0.45 * t) - 20 * t / dur
    v = voice(f0, dur, [(520, 220, 1.0), (880, 260, 0.6), (2400, 400, 0.2)], breath=0.5, fry=0.6, jitter=0.08)
    rasp = bandpass(white(n), 600, 3000) * (0.5 + 0.5 * np.sin(2 * np.pi * 33 * t)) * 0.15
    x = (v + rasp) * env_adsr(n, 0.25, 0.4, 0.75, 0.8) * (0.8 + 0.2 * np.sin(2 * np.pi * 3.1 * t))
    x = np.tanh(x / (np.max(np.abs(x)) or 1) * 2.2)
    save('zombie_groan', normalize(reverb(x, 1.2, 0.3, 3500), -3))


def zombie_attack():
    dur = 0.9
    n = int(dur * SR)
    t = t_axis(dur)
    f0 = np.interp(t, [0, 0.15, 0.6, 0.9], [140, 230, 180, 120])
    v = voice(f0, dur, [(700, 300, 1.0), (1200, 350, 0.8), (2600, 500, 0.35)], breath=0.9, fry=0.4, jitter=0.12)
    x = np.tanh(v / (np.max(np.abs(v)) or 1) * 3.5) * env_adsr(n, 0.02, 0.1, 0.8, 0.35)
    # estalo de dentes
    snap = np.zeros(n)
    place(snap, bandpass(white(600), 2500, 9000) * env_exp(600, 0.002), 0.5, 1.2)
    save('zombie_attack', normalize(reverb(x + snap, 0.7, 0.2, 5000), -2))


def pain():
    dur = 0.55
    n = int(dur * SR)
    t = t_axis(dur)
    f0 = np.interp(t, [0, 0.08, 0.55], [150, 175, 105])
    v = voice(f0, dur, [(600, 150, 1.0), (1050, 200, 0.6), (2500, 300, 0.25)], breath=0.35, fry=0.25, jitter=0.03)
    x = np.tanh(v / (np.max(np.abs(v)) or 1) * 1.8) * env_adsr(n, 0.015, 0.1, 0.7, 0.3)
    save('pain', normalize(reverb(x, 0.5, 0.15, 5000), -3))


# ───────────────────────── armas e combate
def gunshot(kind='pistol', distant=False):
    p = {'pistol': dict(crack=0.006, body=0.09, boom=70, tail=1.4, lp=6000, g_boom=0.8),
         'rifle': dict(crack=0.009, body=0.13, boom=55, tail=2.4, lp=8000, g_boom=1.0),
         'shotgun': dict(crack=0.012, body=0.22, boom=45, tail=2.0, lp=4500, g_boom=1.4)}[kind]
    dur = 3.0
    n = int(dur * SR)
    x = np.zeros(n)
    c = int(p['crack'] * SR) + 1
    x[:c] += white(c) * 1.0
    b = int(0.5 * SR)
    body = lowpass(white(b), p['lp']) * env_exp(b, p['body'] / 3) * 0.9
    boom = osc(np.geomspace(p['boom'] * 2.2, p['boom'] * 0.7, b), 0.5) * env_exp(b, p['body'] / 1.5) * p['g_boom']
    place(x, body + boom, 0.0)
    x = np.tanh(x * 1.6)
    # eco ao ar livre: reflexões espaçadas + cauda
    y = reverb(x, p['tail'], 0.35, 3500, pre=0.03)
    for dly, g in ((0.18, 0.25), (0.41, 0.15), (0.77, 0.08)):
        place(y, lowpass(x, 2500), dly, g)
    if distant:
        y = lowpass(reverb(y, 3.0, 0.6, 1500, pre=0.08), 900, order=4)
        y = np.concatenate([np.zeros(int(0.05 * SR)), y])[:n]
    y = fade(y, 0.0005, 0.4)
    trim = int((p['tail'] * 0.9 + (0.8 if distant else 0)) * SR)
    save(f'gunshot_{kind}' if not distant else 'gunshot_distant', normalize(y[:min(n, trim)] if not distant else y, -1 if not distant else -6))


def melee_hit():
    d = int(0.35 * SR)
    thud = lowpass(white(d), 300) * env_exp(d, 0.04) * 2 + osc(np.geomspace(140, 50, d), 0.35) * env_exp(d, 0.06)
    crunch = bandpass(white(d), 900, 3500) * env_exp(d, 0.012) * 0.8
    squish = bandpass(white(d), 200, 900) * env_exp(d, 0.05) * 0.5 * (1 + np.sin(2 * np.pi * 40 * t_axis(0.35)))
    x = np.tanh((thud + crunch + squish) * 1.5)
    save('melee_hit', normalize(fade(reverb(x, 0.4, 0.12), 0.0005, 0.05), -2))


def melee_miss():
    d = int(0.32 * SR)
    sw = sweep_filter(white(d), 400, 2500, 0.8, 16) * env_adsr(d, 0.06, 0.05, 0.7, 0.15)
    save('melee_miss', normalize(fade(sw, 0.002, 0.03), -5))


def heartbeat():
    buf = np.zeros(int(1.9 * SR))
    for beat in (0.0, 0.95):
        for off, f, g in ((0.0, 55, 1.0), (0.23, 68, 0.7)):
            d = int(0.22 * SR)
            s = osc(np.geomspace(f * 1.6, f, d), 0.22) * env_adsr(d, 0.008, 0.04, 0.3, 0.12) + lowpass(white(d), 150) * env_exp(d, 0.02) * 0.6
            place(buf, s, beat + off + 0.02, g)
    save('heartbeat', normalize(fade(buf, 0.002, 0.1), -3))


# ───────────────────────── sobrevivência
def bandage():
    n = int(1.1 * SR)
    x = np.zeros(n)
    t = 0.05
    while t < 0.95:
        d = int(rng.uniform(0.01, 0.04) * SR)
        place(x, highpass(white(d), 1500) * env_adsr(d, 0.002, 0.005, 0.6, 0.005), t, rng.uniform(0.3, 1.0))
        t += rng.uniform(0.008, 0.03)
    x *= env_adsr(n, 0.05, 0.1, 0.9, 0.2)
    x = bandpass(x, 1200, 9000) + bandpass(x, 300, 1200) * 0.4
    save('bandage', normalize(fade(x, 0.002, 0.05), -6))


def eat():
    buf = np.zeros(int(1.6 * SR))
    for tt in (0.05, 0.5, 0.95):
        c = np.zeros(int(0.3 * SR))
        for _ in range(25):
            place(c, bandpass(white(300), 1500, 6000) * env_exp(300, 0.002), rng.uniform(0, 0.15), rng.uniform(0.2, 1))
        c += lowpass(white(len(c)), 400) * env_exp(len(c), 0.04) * 0.6
        place(buf, c, tt + rng.uniform(-0.03, 0.03))
    save('eat', normalize(fade(buf, 0.002, 0.05), -6))


def drink():
    buf = np.zeros(int(1.6 * SR))
    for tt in (0.08, 0.55, 1.0):
        d = int(0.28 * SR)
        f = np.interp(np.arange(d), [0, d * 0.4, d], [180, 340, 260])
        g = osc(f, 0.28) * env_adsr(d, 0.02, 0.08, 0.4, 0.12) + bandpass(white(d), 300, 1200) * env_exp(d, 0.05) * 0.3
        place(buf, g, tt + rng.uniform(-0.02, 0.02))
    slosh = bandpass(pink(len(buf)), 400, 2500) * 0.05
    save('drink', normalize(fade(lowpass(buf + slosh, 2500), 0.005, 0.08), -6))


def engine(start=True):
    dur = 3.4 if start else 2.6
    n = int(dur * SR)
    t = t_axis(dur)
    crank_len = 1.1 if start else 2.0
    # motor de partida: ciclos de compressão ~7 Hz
    crank_rate = 7 - (0 if start else 2.5 * t / dur)
    ph = np.cumsum(np.broadcast_to(crank_rate, (n,))) / SR
    pulse = (0.5 + 0.5 * np.sin(2 * np.pi * ph)) ** 3
    starter = (lowpass(osc(np.broadcast_to(crank_rate * 7, (n,)), dur, 'saw'), 800) * 0.4 + bandpass(white(n), 300, 2500) * 0.3) * pulse
    starter *= (t < crank_len)
    if not start:
        starter *= np.clip(1 - (t / crank_len) ** 3, 0, 1)
    x = starter
    if start:
        rpm = np.where(t < crank_len, 0, np.interp(t, [crank_len, crank_len + 0.4, crank_len + 0.9, dur], [12, 45, 22, 20]))
        fire_ph = np.cumsum(rpm) / SR
        fire = (np.diff(np.floor(fire_ph * 2), prepend=0) > 0).astype(float)
        eng = signal.lfilter([1], [1, -0.985], fire)
        eng = lowpass(eng, 400) + bandpass(eng, 400, 2000) * 0.3
        eng *= (t >= crank_len) * env_adsr(n, 0, 0, 1, 0.3)
        x = x + eng / (np.max(np.abs(eng)) or 1) * 0.9
    else:
        place(x, bandpass(white(1200), 2000, 7000) * env_exp(1200, 0.004), crank_len + 0.15, 0.4)  # clique do relé
    save('engine_start' if start else 'engine_fail', normalize(fade(reverb(x, 0.6, 0.12), 0.01, 0.15), -2))


if __name__ == '__main__':
    rain(); wind(); footsteps(); door_open(); door_close()
    ui_click(); ui_open(); ui_error(); chat_message(); notification()
    zombie_groan(); zombie_attack(); pain()
    gunshot('pistol'); gunshot('rifle'); gunshot('shotgun'); gunshot('rifle', distant=True)
    melee_hit(); melee_miss(); heartbeat(); bandage(); eat(); drink(); engine(True); engine(False)
