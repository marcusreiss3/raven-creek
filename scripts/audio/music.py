"""Trilhas do Raven Creek: ambientes sombrios em loop, sintetizados."""
import sys, os, subprocess
import numpy as np
from synth import *

OUT = sys.argv[1] if len(sys.argv) > 1 else 'out/music'
ONLY = sys.argv[2:]  # nomes opcionais para gerar só algumas
os.makedirs(OUT, exist_ok=True)


def save(name, x, q=3):
    x = np.clip(x, -1, 1)
    raw = (x * 32767).astype('<i2').tobytes()
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', str(SR), '-ac', '2', '-i', '-',
                    '-c:a', 'libvorbis', '-q:a', str(q), f'{OUT}/{name}.ogg'], input=raw, check=True)
    print(name, f'{len(x)/SR:.1f}s')


class Track:
    def __init__(self, loop, xf=4.0, seed=0):
        self.L, self.xf = loop, xf
        self.T = loop + xf
        self.n = int(self.T * SR)
        self.buf = np.zeros((self.n, 2))
        self.t = t_axis(self.T)
        global rng
        import synth
        synth.rng = np.random.default_rng(seed)
        self.rng = synth.rng

    def add(self, snd, at=0.0, gain=1.0, pan=0.0):
        if snd.ndim == 1:
            l, r = np.sqrt((1 - pan) / 2), np.sqrt((1 + pan) / 2)
            snd = np.stack([snd * l * 1.414, snd * r * 1.414], axis=1)
        i = int(at * SR)
        if i >= self.n:
            return
        m = min(len(snd), self.n - i)
        self.buf[i:i + m] += snd[:m] * gain

    # ── camadas
    def pad(self, progression, octave_shift=0, gain=0.25, bright=(1.2, 3.0), attack=3.0, release=4.0, harmonics=7, detune=4.0):
        cd = self.L / len(progression)
        for k, chord in enumerate(progression):
            dur = cd + release
            n = int(dur * SR)
            tt = t_axis(dur)
            br = bright[0] + (bright[1] - bright[0]) * (0.5 - 0.5 * np.cos(2 * np.pi * tt / dur))
            env = env_adsr(n, attack, 1.0, 0.85, release)
            for note in chord:
                f = midi(note + 12 * octave_shift)
                l = additive(f * (1 - detune / 10000), dur, harmonics, br)
                r = additive(f * (1 + detune / 10000), dur, harmonics, br)
                self.add(stereo(l, r) * env[:, None] / len(chord), k * cd, gain)
            # cauda do último acorde volta para o começo pelo loop
        return self

    def drone(self, note, gain=0.2, bright=1.5, wobble=0.08):
        f = midi(note) * (1 + 0.002 * np.sin(2 * np.pi * wobble * self.t))
        l = additive(f, self.T, 6, bright) + additive(f * 1.5, self.T, 3, 0.8) * 0.3
        r = additive(f * 1.001, self.T, 6, bright) + additive(f * 1.5 * 1.001, self.T, 3, 0.8) * 0.3
        amp = 0.8 + 0.2 * np.sin(2 * np.pi * 0.03 * self.t)
        self.add(stereo(l, r) * amp[:, None], 0, gain)
        return self

    def air(self, lo=200, hi=1500, gain=0.05, rate=0.06):
        for c in range(2):
            x = bandpass(pink(self.n), lo, hi) * (0.6 + 0.4 * np.sin(2 * np.pi * rate * self.t + c * 1.7 + self.rng.uniform(0, 6)))
            s = np.zeros((self.n, 2)); s[:, c] = x
            self.add(s, 0, gain)
        return self

    def bell(self, note, decay=4.0, gain=0.1):
        f = midi(note)
        dur = decay * 1.5
        n = int(dur * SR)
        x = np.zeros(n)
        for ratio, g, dk in ((1, 1, 1), (2.76, 0.5, 0.6), (5.4, 0.25, 0.4), (8.93, 0.12, 0.25)):
            x += osc(f * ratio, dur) * g * env_exp(n, decay * dk)
        return x * env_adsr(n, 0.004, 0.0, 1, 0.05) * gain

    def piano(self, note, dur=4.0, gain=0.15):
        f = midi(note)
        n = int(dur * SR)
        x = np.zeros(n)
        for h in range(1, 9):
            x += osc(f * h * (1 + 0.0004 * h * h), dur, phase=self.rng.uniform(0, 6)) * (0.7 ** (h - 1)) * env_exp(n, dur / (1 + h * 0.7))
        x += lowpass(white(n), 3000) * env_exp(n, 0.004) * 0.05
        return x * env_adsr(n, 0.003, 0, 1, 0.3) * gain

    def sprinkle(self, maker, notes, count, gain=1.0, spread=0.7, seed_off=0, quant=None, avoid_tail=3.0):
        for i in range(count):
            at = self.rng.uniform(0.5, self.L - avoid_tail)
            if quant:
                at = round(at / quant) * quant
            self.add(maker(self.rng.choice(notes)), at, gain, pan=self.rng.uniform(-spread, spread))
        return self

    def melody(self, maker, seq, step, start=0.0, gain=1.0, pan=0.0):
        for i, nt in enumerate(seq):
            if nt is not None:
                self.add(maker(nt), start + i * step, gain, pan)
        return self

    def kick(self, gain=0.6):
        d = int(0.5 * SR)
        return (osc(np.geomspace(120, 42, d), 0.5) * env_exp(d, 0.12) + lowpass(white(d), 200) * env_exp(d, 0.01) * 0.5) * gain

    def tom(self, f=90, gain=0.5, decay=0.25):
        d = int(0.8 * SR)
        return (osc(np.geomspace(f * 1.5, f, d), 0.8) * env_exp(d, decay) + bandpass(white(d), 100, 900) * env_exp(d, 0.03) * 0.4) * gain

    def hat(self, gain=0.08):
        d = int(0.08 * SR)
        return highpass(white(d), 7000) * env_exp(d, 0.012) * gain

    def snare(self, gain=0.3):
        d = int(0.4 * SR)
        return (bandpass(white(d), 1500, 7000) * env_exp(d, 0.07) + osc(190, 0.4) * env_exp(d, 0.04) * 0.6) * gain

    def heartbeat(self, bpm=60, gain=0.4, start=0.0):
        beat = 60 / bpm
        tt = start
        while tt < self.L:
            for off, f, g in ((0, 52, 1), (0.22, 64, 0.65)):
                d = int(0.25 * SR)
                s = osc(np.geomspace(f * 1.6, f, d), 0.25) * env_adsr(d, 0.008, 0.05, 0.3, 0.12)
                self.add(s, tt + off, gain * g)
            tt += beat
        return self

    def bass_ostinato(self, notes, step, gain=0.25, cutoff=500):
        tt, i = 0.0, 0
        while tt < self.L:
            d = step * 0.9
            n = int(d * SR)
            x = lowpass(osc(midi(notes[i % len(notes)]), d, 'saw'), cutoff, order=2) * env_adsr(n, 0.005, 0.08, 0.6, 0.05)
            self.add(x, tt, gain)
            tt += step; i += 1
        return self

    def tremolo_strings(self, chord, gain=0.12, rate=9.0, bright=2.0):
        tr = 0.55 + 0.45 * np.sin(2 * np.pi * rate * self.t)
        for note in chord:
            f = midi(note)
            l = additive(f * 0.9997, self.T, 8, bright)
            r = additive(f * 1.0003, self.T, 8, bright)
            self.add(stereo(l, r) * tr[:, None] / len(chord), 0, gain)
        return self

    def render(self, name, rev=(4.0, 0.35, 3500), rms=-21, lp=None):
        x = self.buf
        if rev:
            x = reverb(x, rev[0], rev[1], rev[2])
        if lp:
            x = lowpass(x, lp, order=2)
        x = highpass(x, 28)
        x = loopify(x, self.L, self.xf)
        x = rms_normalize(x, rms + 3, -1.0)
        save(name, x)


def build(name):
    # Notas MIDI: 57=A3, 50=D3, 52=E3, 45=A2, 38=D2, 40=E2, 43=G2, 48=C3
    if name == 'main_menu':  # lá menor, melancólico, piano esparso sobre pad
        T = Track(72, 5, seed=1)
        T.pad([[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]], -1, 0.3, (1.0, 2.5), 4, 5)
        T.drone(33, 0.12, 1.0)
        mel = [69, None, 72, None, 71, None, 67, None, None, None, 64, None, 65, None, 64, None, None, None, None, None,
               69, None, 72, None, 76, None, 74, None, 72, None, 71, None, None, None, None, None]
        T.melody(lambda nt: T.piano(nt, 5, 0.22), mel, 2.0, start=0.5, pan=0.1)
        T.air(300, 2000, 0.025)
        T.render(name, (5.0, 0.45, 3000), -21)
    elif name == 'dia_normal':  # Dia 1, antes da queda: dó maior, manhã tranquila de segunda-feira
        beat = 60 / 75
        T = Track(64 * beat, 4, seed=11)  # 4 acordes de 16 tempos
        T.pad([[48, 52, 55, 60], [43, 47, 50, 55], [45, 48, 52, 57], [41, 45, 48, 53]], 0, 0.16, (1.2, 2.6), 2, 4)
        bass = []
        for r in (36, 31, 33, 29):
            bass += [r, r, r + 7, r] * 2
        T.bass_ostinato(bass, beat * 2, 0.10, 400)
        for i in range(64):
            T.add(T.hat(0.016), i * beat + beat / 2, pan=0.25)
        mel = [72, None, 76, 79, None, 76, 72, None, 74, None, 76, None, 72, None, None, None,
               71, None, 74, 79, None, 74, 71, None, 72, None, 74, None, 71, None, None, None,
               72, None, 76, 81, None, 79, 76, None, 74, None, 72, None, 69, None, None, None,
               72, None, 77, 81, None, 79, 77, None, 76, None, 74, None, 72, None, None, None]
        T.melody(lambda nt: T.piano(nt, 3, 0.16), mel, beat, start=0.0, pan=-0.1)
        T.air(300, 2500, 0.012)
        T.render(name, (3.0, 0.3, 4500), -22)
    elif name == 'explore_calm':  # ré menor, calmo e vazio
        T = Track(80, 5, seed=2)
        T.pad([[50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 48, 52, 57]], 0, 0.25, (0.8, 2.2), 5, 6)
        T.drone(38, 0.1, 0.9)
        T.sprinkle(lambda nt: T.piano(nt, 5, 0.12), [62, 65, 69, 72, 74], 9)
        T.air(150, 1200, 0.04, 0.04)
        T.render(name, (5.0, 0.45, 3000), -22)
    elif name == 'city_abandoned':  # mi frígio, metais distantes, vento
        T = Track(80, 5, seed=3)
        T.drone(28, 0.25, 1.4, 0.05)
        T.pad([[52, 55, 59], [53, 57, 60], [52, 55, 59], [50, 53, 57, 60]], 0, 0.16, (0.6, 1.6), 6, 6)
        T.sprinkle(lambda nt: T.bell(nt, 5, 0.06), [64, 65, 71, 76, 77], 10)
        T.air(100, 900, 0.07, 0.05)
        T.air(1200, 4000, 0.012, 0.11)
        T.render(name, (6.0, 0.5, 2500), -22)
    elif name == 'hospital':  # agudo e estranho, zumbido elétrico, cluster dissonante
        T = Track(64, 5, seed=4)
        hum = additive(60, T.T, 12, 6.0) * (0.9 + 0.1 * np.sin(2 * np.pi * 0.3 * T.t))
        T.add(stereo(hum, hum), 0, 0.03)
        T.tremolo_strings([76, 77, 83], 0.05, 0.4, 1.0)
        T.pad([[64, 65, 71], [62, 63, 69]], 0, 0.12, (0.5, 1.2), 8, 8)
        T.sprinkle(lambda nt: T.bell(nt, 3, 0.05), [88, 89, 95], 6)
        # bipe distante de monitor cardíaco, lento e irregular
        for k in range(10):
            at = 3 + k * 6 + T.rng.uniform(-1, 1)
            if at < T.L - 2:
                d = int(0.12 * SR)
                T.add(lowpass(osc(1000, 0.12), 2000) * env_adsr(d, 0.005, 0, 1, 0.03), at, 0.02, pan=0.6)
        T.render(name, (6.0, 0.55, 2500), -23)
    elif name == 'forest':  # sol menor dórico, folhas, mais orgânico
        T = Track(80, 5, seed=5)
        T.pad([[55, 58, 62], [53, 57, 60], [52, 55, 60], [55, 58, 62, 65]], 0, 0.2, (0.8, 2.0), 5, 6)
        T.drone(31, 0.1, 0.8)
        T.air(1500, 6000, 0.03, 0.08)
        T.air(200, 800, 0.03, 0.03)
        T.sprinkle(lambda nt: T.piano(nt, 4, 0.08), [67, 70, 72, 74, 77], 8)
        # pios curtos ao longe
        for k in range(6):
            d = int(0.18 * SR)
            f = np.interp(np.arange(d), [0, d], [3200, 2400]) * T.rng.uniform(0.9, 1.1)
            chirp = osc(f, 0.18) * env_adsr(d, 0.01, 0.05, 0.5, 0.08)
            T.add(chirp, T.rng.uniform(2, T.L - 4), 0.012, pan=T.rng.uniform(-0.8, 0.8))
        T.render(name, (4.5, 0.4, 4000), -22)
    elif name == 'road':  # dó menor, pulso de caminhada
        T = Track(64, 4, seed=6)
        T.pad([[48, 51, 55], [44, 48, 51], [46, 50, 53], [43, 47, 50]], 0, 0.22, (1.0, 2.2), 3, 4)
        T.bass_ostinato([36, 36, 43, 36, 32, 32, 39, 32, 34, 34, 41, 34, 31, 31, 38, 31], 60 / 84, 0.18, 300)
        for i in range(int(T.L / (60 / 84))):
            T.add(T.hat(0.03), i * 60 / 84 + 30 / 84, pan=0.3)
        T.sprinkle(lambda nt: T.piano(nt, 3, 0.08), [60, 63, 67, 70], 6, quant=60 / 84)
        T.air(200, 1500, 0.03)
        T.render(name, (3.0, 0.35, 3500), -21)
    elif name == 'danger':  # tensão: drone grave, segunda menor, batida cardíaca
        T = Track(48, 4, seed=7)
        T.drone(29, 0.3, 2.0, 0.2)
        T.tremolo_strings([65, 66], 0.08, 6.0, 1.5)
        rise = np.clip(T.t / T.L, 0, 1)
        sw = additive(midi(77) * (1 + 0.06 * rise), T.T, 5, 1.0) * (0.3 + 0.7 * rise)
        T.add(stereo(sw, sw * 0.9), 0, 0.03)
        T.heartbeat(66, 0.35)
        T.air(80, 500, 0.06, 0.1)
        T.render(name, (3.5, 0.4, 2500), -20)
    elif name == 'combat':  # 120 bpm, percussão e ostinato
        beat = 0.5
        T = Track(32, 2, seed=8)
        for b in range(int(T.L / beat)):
            at = b * beat
            if b % 4 in (0, 3) or (b % 8 == 6):
                T.add(T.kick(0.7), at)
            if b % 4 == 2:
                T.add(T.snare(0.25), at, pan=0.1)
            T.add(T.hat(0.05), at + beat / 2, pan=-0.3)
            if b % 16 == 15:
                T.add(T.tom(110, 0.35), at + 0.25, pan=0.4); T.add(T.tom(80, 0.35), at + 0.375, pan=-0.4)
        T.bass_ostinato([28, 28, 40, 28, 29, 28, 40, 31] * 2 + [26, 26, 38, 26, 27, 26, 38, 29] * 2, beat / 2, 0.22, 700)
        T.tremolo_strings([52, 55, 58], 0.09, 12, 2.5)
        T.render(name, (1.8, 0.2, 5000), -17)
    elif name == 'horde':  # pesado e lento, tambores e metais graves
        beat = 60 / 88
        T = Track(beat * 48, 2.5, seed=9)
        for b in range(48):
            at = b * beat
            if b % 2 == 0:
                T.add(T.tom(55, 0.7, 0.4), at)
            if b % 4 == 3:
                T.add(T.tom(75, 0.4), at, pan=0.3)
            if b % 8 == 7:
                T.add(T.snare(0.2), at + beat / 2)
        brass = lambda f: additive(midi(f), T.T, 14, np.full(T.n, 6.0) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.08 * T.t)))
        T.add(stereo(brass(28), brass(28.05)), 0, 0.1)
        T.add(stereo(brass(35), brass(34.95)), 0, 0.05)
        T.tremolo_strings([64, 65], 0.04, 5, 1.2)
        T.air(60, 400, 0.08, 0.2)
        T.render(name, (3.0, 0.3, 2000), -18)
    elif name == 'wounded':  # abafado, zumbido no ouvido, coração
        T = Track(48, 4, seed=10)
        T.pad([[45, 48, 52], [44, 47, 52], [43, 47, 50], [41, 45, 48]], 0, 0.28, (0.6, 1.4), 4, 5)
        T.heartbeat(54, 0.45)
        ring = osc(4100, T.T) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.05 * T.t))
        T.add(stereo(ring, ring * 0.7), 0, 0.006)
        T.render(name, (4.0, 0.5, 1500), -22, lp=2200)
    elif name == 'death':  # lento e fúnebre, acordes descendentes
        T = Track(60, 5, seed=11)
        T.pad([[57, 60, 64], [55, 59, 62], [53, 57, 60], [52, 56, 59]], -1, 0.32, (0.8, 2.0), 3, 6)
        T.melody(lambda nt: T.piano(nt, 6, 0.2), [76, None, 74, None, 72, None, 71, None, None, None, 69, None, 68, None, None, None, 64, None, None, None], 3.0, start=0.5)
        T.drone(33, 0.08, 0.7)
        T.render(name, (6.0, 0.5, 2500), -22)
    elif name == 'base':  # mais quente: fá maior com sus, sensação de abrigo
        T = Track(80, 5, seed=12)
        T.pad([[53, 57, 60, 64], [50, 53, 57, 62], [46, 50, 53, 57], [48, 53, 55, 60]], 0, 0.24, (1.0, 2.4), 4, 5)
        T.drone(29, 0.08, 0.8)
        T.sprinkle(lambda nt: T.piano(nt, 5, 0.11), [65, 69, 72, 74, 76, 77], 12)
        # crepitar de fogueira
        crackle = np.zeros(T.n)
        for _ in range(int(T.T * 6)):
            place(crackle, bandpass(white(300), 1500, 6000) * env_exp(300, 0.0015), T.rng.uniform(0, T.T - 0.01), T.rng.uniform(0.05, 0.5))
        crackle += lowpass(brown(T.n), 300) * 0.2
        T.add(stereo(crackle, crackle * 0.8), 0, 0.05)
        T.render(name, (4.0, 0.4, 3500), -22)


ALL = ['main_menu', 'explore_calm', 'city_abandoned', 'hospital', 'forest', 'road', 'danger', 'combat', 'horde', 'wounded', 'death', 'base']
for nm in (ONLY or ALL):
    build(nm)
