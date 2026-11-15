"""Sons do celular do Dia 1 (notificação, toque de ligação, vibração e alerta extremo da Defesa Civil)."""
import sys, os
import numpy as np
from synth import *
OUT = sys.argv[1] if len(sys.argv) > 1 else 'out/sfx'
os.makedirs(OUT, exist_ok=True)
import sfx
sfx.OUT = OUT
save = sfx.save

def phone_notify():
    buf = np.zeros(int(0.45 * SR))
    for tt, f in ((0.0, midi(84)), (0.09, midi(88))):
        d = int(0.3 * SR)
        place(buf, additive(f, 0.3, 3, 0.8) * env_exp(d, 0.05), tt, 0.5)
    save('phone_notify', normalize(fade(reverb(buf, 0.4, 0.12), 0.001, 0.05), -10))

def phone_vibrate():
    dur = 0.9; n = int(dur * SR); t = t_axis(dur)
    buzz = lowpass(osc(165, dur, 'saw'), 600) * (0.6 + 0.4 * np.sin(2 * np.pi * 31 * t))
    gate = ((t < 0.35) | ((t > 0.5) & (t < 0.85))).astype(float)
    gate = lowpass(gate, 60)
    save('phone_vibrate', normalize(fade(buzz * gate, 0.005, 0.03), -9))

def phone_ring():
    # toque clássico de celular: dois trinados, pausa (≈3 s)
    dur = 3.0; buf = np.zeros(int(dur * SR))
    for start in (0.0, 0.55):
        for k in range(10):
            f = midi(83) if k % 2 == 0 else midi(79)
            d = int(0.045 * SR)
            place(buf, additive(f, 0.045, 4, 1.5) * env_adsr(d, 0.002, 0.01, 0.8, 0.01), start + k * 0.04, 0.5)
    save('phone_ring', normalize(fade(reverb(buf, 0.3, 0.1), 0.001, 0.05), -8))

def emergency_alert():
    # alerta extremo: tom duplo 853 + 960 Hz pulsado, áspero e insistente
    dur = 4.5; n = int(dur * SR); t = t_axis(dur)
    tone = 0.5 * np.sin(2 * np.pi * 853 * t) + 0.5 * np.sin(2 * np.pi * 960 * t)
    gate = (np.floor(t / 0.5) % 2 == 0).astype(float)
    gate = lowpass(gate, 120)
    x = tone * gate
    save('emergency_alert', normalize(fade(x, 0.01, 0.2), -6))

if __name__ == '__main__':
    phone_notify(); phone_vibrate(); phone_ring(); emergency_alert()
