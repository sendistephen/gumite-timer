"""Synthesizes the flip clack and alarm tones used by both apps.
Run: python3 make_sounds.py  (needs numpy)"""
import numpy as np, wave, os
SR = 44100
OUT = os.path.join(os.path.dirname(__file__), 'sounds')

def t(d): return np.arange(int(SR * d)) / SR
def env(n, a=0.004, r=0.03):
    e = np.ones(n); na = max(1, int(SR*a)); nr = max(1, int(SR*r))
    e[:na] = np.linspace(0, 1, na); e[-nr:] *= np.linspace(1, 0, nr); return e
def place(buf, x, at):
    i = int(SR*at); end = min(len(buf), i+len(x)); buf[i:end] += x[:end-i]
def save(name, x, peak=0.85):
    x = x / (np.max(np.abs(x)) + 1e-9) * peak
    pcm = (x * 32767).astype('<i2')
    with wave.open(os.path.join(OUT, name), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())

rng = np.random.default_rng(7)
def bandnoise(d, lo, hi):
    n = int(SR*d); spec = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1/SR); spec[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(spec, n)

# ---- flip sounds: deliberately soft — gentle attack (no click), low-passed,
# quiet. They play every time a card flips, so they must never be harsh.
def smooth_env(n, attack, tau):
    tt = np.arange(n) / SR
    a = np.clip(tt / attack, 0, 1)
    a = 0.5 - 0.5 * np.cos(np.pi * a)          # raised-cosine attack: no click
    e = a * np.exp(-np.maximum(tt - attack, 0) / tau)
    e[-int(SR*0.004):] *= np.linspace(1, 0, int(SR*0.004))  # fade tail
    return e

def flip_soft():
    """Muted plastic leaf settling: a soft 'tup … tup'."""
    out = np.zeros(int(SR*0.12))
    n = int(SR*0.05)
    leaf = bandnoise(0.05, 250, 1800) * smooth_env(n, 0.0015, 0.007)
    body = np.sin(2*np.pi*140*t(0.05)) * smooth_env(n, 0.002, 0.012) * 0.6
    place(out, leaf + body, 0)
    n2 = int(SR*0.04)
    land = bandnoise(0.04, 250, 1400) * smooth_env(n2, 0.0015, 0.006) * 0.4
    land += np.sin(2*np.pi*120*t(0.04)) * smooth_env(n2, 0.002, 0.01) * 0.25
    place(out, land, 0.045)
    return out

def flip_tick():
    """A quiet wooden clock tick."""
    n = int(SR*0.06); tt = t(0.06)
    x = (np.sin(2*np.pi*1050*tt) + 0.25*np.sin(2*np.pi*2100*tt)) * smooth_env(n, 0.001, 0.006)
    x += bandnoise(0.06, 600, 2500) * smooth_env(n, 0.001, 0.002) * 0.25
    return x

def flip_paper():
    """A soft card-flick swish, like a page turning."""
    out = np.zeros(int(SR*0.12))
    n = int(SR*0.08)
    swish = bandnoise(0.08, 500, 2500) * smooth_env(n, 0.012, 0.022)
    place(out, swish, 0)
    n2 = int(SR*0.04)
    place(out, np.sin(2*np.pi*180*t(0.04)) * smooth_env(n2, 0.002, 0.008) * 0.35, 0.05)
    return out

save('flip-soft.wav', flip_soft(), peak=0.5)
save('flip-tick.wav', flip_tick(), peak=0.45)
save('flip-paper.wav', flip_paper(), peak=0.5)

# ---- alarms
def tone(f, d, shape='sine', decay=None, partials=((1,1),)):
    tt = t(d); x = np.zeros_like(tt)
    for mult, amp in partials:
        ph = 2*np.pi*f*mult*tt
        x += amp * (np.sign(np.sin(ph)) if shape == 'square' else np.sin(ph))
    if decay: x *= np.exp(-tt/decay)
    return x * env(len(tt))

def classic():
    out = np.zeros(int(SR*1.0))
    b = tone(880, 0.22, partials=((1,1),(3,1/3),(5,1/5)))
    for i in range(3): place(out, b, i*0.35)
    return out

def digital():
    out = np.zeros(int(SR*1.35))
    b = tone(4000, 0.06, 'square') * 0.6
    for g in range(2):
        for i in range(4): place(out, b, g*0.7 + i*0.1)
    return out

def chime():
    bell = ((1,1),(2.76,0.45),(5.4,0.2),(8.9,0.08))
    out = np.zeros(int(SR*2.6))
    place(out, tone(659.25, 1.6, decay=0.55, partials=bell), 0)
    place(out, tone(523.25, 1.9, decay=0.7, partials=bell), 0.55)
    return out

def marimba():
    out = np.zeros(int(SR*1.6))
    notes = [523.25, 659.25, 783.99, 1046.5]
    for i, f in enumerate(notes):
        place(out, tone(f, 0.7, decay=0.16, partials=((1,1),(4,0.25),(10,0.05))), i*0.14)
    place(out, tone(1046.5, 0.9, decay=0.25, partials=((1,1),(4,0.2))), 0.7)
    return out

def arcade():
    out = np.zeros(int(SR*1.1))
    notes = [523.25, 659.25, 783.99, 1046.5, 1318.5]
    for r in range(2):
        for i, f in enumerate(notes):
            place(out, tone(f, 0.07, 'square') * 0.5, r*0.48 + i*0.075)
    return out

def bowl():
    d = 3.2; tt = t(d)
    x = (np.sin(2*np.pi*220*tt) + 0.6*np.sin(2*np.pi*221.6*tt)
         + 0.5*np.sin(2*np.pi*602*tt) + 0.25*np.sin(2*np.pi*1148*tt)*np.exp(-tt/0.6))
    x *= np.exp(-tt/1.2) * env(len(tt), a=0.01, r=0.3)
    strike = bandnoise(0.03, 800, 5000) * np.exp(-t(0.03)/0.004) * 0.6
    out = np.zeros(len(tt)); place(out, x, 0); place(out, strike, 0)
    return out

for name, fn in [('classic', classic), ('digital', digital), ('chime', chime),
                 ('marimba', marimba), ('arcade', arcade), ('bowl', bowl)]:
    save(f'alarm-{name}.wav', fn())
print(sorted(os.listdir(OUT)))
