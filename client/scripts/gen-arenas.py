"""
Gera a arte das arenas táticas (vista de cima) a partir da geometria de server/src/game/combat/maps.ts.

  python3 client/scripts/gen-arenas.py            # todas
  python3 client/scripts/gen-arenas.py street     # só algumas

Saídas:
  client/public/assets/arenas/<chave>.png        1024×704 (16×11 casas de 64 px)
  client/public/assets/arenas/sprites/*.png      peças que mudam durante o combate (portas, entulho, chamuscado)
  client/src/game/arenaLayouts.ts                geometria original (o cliente usa para saber o que mudou)

Só depende de Pillow e numpy. Tudo é desenhado aqui (sem imagens de terceiros), então não há licença a creditar.
Cada arena tem semente fixa: rodar de novo gera exatamente a mesma imagem.
"""
import sys, math, random, json, pathlib, zlib
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageChops
from arena_layouts import load, ROOT

S = 2                     # superamostragem (desenha em 2x e reduz: bordas suaves)
T = 64 * S                # casa em pixels internos
GW, GH = 16, 11
W, H = GW * T, GH * T
OUT = ROOT / 'client/public/assets/arenas'
WALLS = set('#')
PASS = set('.~/+PZE')

# ───────────────────────── ruído e utilidades ─────────────────────────
def vnoise(rng, h, w, cell):
    gh, gw = max(2, h // cell + 2), max(2, w // cell + 2)
    g = (rng.random((gh, gw)) * 255).astype(np.uint8)
    im = Image.fromarray(g).resize((gw * cell, gh * cell), Image.BICUBIC)
    return np.asarray(im, dtype=np.float32)[:h, :w] / 255.0

def fbm(rng, h, w, cells=(256, 96, 32, 8), weights=(0.45, 0.3, 0.15, 0.1)):
    acc = np.zeros((h, w), np.float32)
    for c, wt in zip(cells, weights): acc += vnoise(rng, h, w, max(2, c * S // 2)) * wt
    return acc / sum(weights)

def rgb(c): return np.array(c, np.float32)
def shade(c, k): return tuple(int(max(0, min(255, v * k))) for v in c[:3])
def mix(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
def jitter(c, rng, amt=10): return tuple(int(max(0, min(255, v + rng.uniform(-amt, amt)))) for v in c[:3])
def tile_box(x, y, w=1, h=1, pad=0.0):
    p = pad * T
    return (x * T + p, y * T + p, (x + w) * T - p, (y + h) * T - p)

def components(rows, ch):
    """Grupos retangulares de casas iguais (para desenhar 'oo' como um carro só, 'SSSS' como uma gôndola…)."""
    seen = set(); out = []
    for y in range(GH):
        for x in range(GW):
            if rows[y][x] != ch or (x, y) in seen: continue
            stack = [(x, y)]; cells = []
            seen.add((x, y))
            while stack:
                cx, cy = stack.pop(); cells.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < GW and 0 <= ny < GH and (nx, ny) not in seen and rows[ny][nx] == ch:
                        seen.add((nx, ny)); stack.append((nx, ny))
            xs = [c[0] for c in cells]; ys = [c[1] for c in cells]
            bw, bh = max(xs) - min(xs) + 1, max(ys) - min(ys) + 1
            if bw * bh == len(cells): out.append((min(xs), min(ys), bw, bh))
            else: out += [(cx, cy, 1, 1) for cx, cy in cells]   # forma irregular: casa a casa
    return out

def split_long(comps, maxlen=2):
    """Carros e afins: grupos maiores que 2 viram vários de 2."""
    out = []
    for x, y, w, h in comps:
        if w > maxlen and h == 1: out += [(x + i, y, min(maxlen, w - i), 1) for i in range(0, w, maxlen)]
        elif h > maxlen and w == 1: out += [(x, y + i, 1, min(maxlen, h - i)) for i in range(0, h, maxlen)]
        else: out.append((x, y, w, h))
    return out

def interior_mask(rows, all_indoor):
    """Casas internas: o que não se alcança da borda sem passar por parede ou porta."""
    if all_indoor: return np.ones((GH, GW), bool)
    out = np.ones((GH, GW), bool)
    from collections import deque
    q = deque()
    for y in range(GH):
        for x in range(GW):
            if (x in (0, GW - 1) or y in (0, GH - 1)) and rows[y][x] not in '#+/':
                out[y, x] = False; q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < GW and 0 <= ny < GH and out[ny, nx] and rows[ny][nx] not in '#+/':
                out[ny, nx] = False; q.append((nx, ny))
    return out

def upmask(m):  # máscara por casa → pixels
    return np.kron(m.astype(np.float32), np.ones((T, T), np.float32))

def soft(m, r):  # borra uma máscara float
    return np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r)), np.float32) / 255

# ───────────────────────── pisos ─────────────────────────
def floor_asphalt(rng, base=(52, 54, 49)):
    n = fbm(rng, H, W); g = rng.random((H, W)).astype(np.float32)
    img = rgb(base)[None, None] * (0.82 + 0.36 * n[..., None]) + (g[..., None] - 0.5) * 14
    patch = soft((vnoise(rng, H, W, 180 * S) > 0.72).astype(np.float32), 10 * S)
    img *= (1 - 0.08 * patch)[..., None]
    return img

def floor_concrete(rng, base=(96, 95, 86), joints=2):
    n = fbm(rng, H, W); g = rng.random((H, W)).astype(np.float32)
    img = rgb(base)[None, None] * (0.85 + 0.3 * n[..., None]) + (g[..., None] - 0.5) * 10
    if joints:
        step = T * joints
        for x in range(0, W, step): img[:, max(0, x - 1):x + 2] *= 0.72
        for y in range(0, H, step): img[max(0, y - 1):y + 2, :] *= 0.72
    return img

def floor_tiles(rng, a=(126, 136, 126), b=None, size=0.5, grout=0.78):
    n = fbm(rng, H, W, (200, 60, 20, 6)); g = rng.random((H, W)).astype(np.float32)
    s = int(T * size)
    yy, xx = np.mgrid[0:H, 0:W]
    img = np.empty((H, W, 3), np.float32); img[:] = rgb(a)
    if b is not None:
        chk = ((xx // s + yy // s) % 2).astype(bool); img[chk] = rgb(b)
    # cada placa um pouco diferente
    tv = (np.asarray(Image.fromarray((rng.random((H // s + 1, W // s + 1)) * 255).astype(np.uint8)).resize((W // s + 1, H // s + 1)), np.float32) / 255)
    img *= (0.94 + 0.1 * tv[yy // s, xx // s])[..., None]
    img *= (0.84 + 0.26 * n[..., None]); img += (g[..., None] - 0.5) * 8
    gl = ((xx % s) < 2 * S) | ((yy % s) < 2 * S)
    img[gl] *= grout
    return img

def floor_wood(rng, base=(96, 70, 46), plank=0.25, vertical=False):
    h, w = (W, H) if vertical else (H, W)
    img = np.empty((h, w, 3), np.float32)
    ph = int(T * plank); grain = vnoise(rng, h, w * 1, 3 * S)
    streak = np.asarray(Image.fromarray((rng.random((h, max(2, w // (40 * S)))) * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC), np.float32) / 255
    for i, y0 in enumerate(range(0, h, ph)):
        c = rgb(base) * rng.uniform(0.78, 1.15)
        img[y0:y0 + ph] = c
        # emendas das tábuas
        off = int(rng.integers(0, 3 * T)); L = int(rng.integers(2 * T, 4 * T))
        for x in range(off % L, w, L): img[y0:y0 + ph, x:x + S * 2] *= 0.6
        img[y0:y0 + S * 2] *= 0.55
    img *= (0.8 + 0.25 * streak[..., None]) * (0.92 + 0.12 * grain[..., None])
    if vertical: img = img.transpose(1, 0, 2)
    return img

def floor_grass(rng, base=(58, 70, 40), dirt=(80, 68, 46), dirt_amt=0.42):
    n = fbm(rng, H, W, (300, 120, 40, 10)); d = fbm(rng, H, W, (220, 80, 30, 8))
    g = rng.random((H, W)).astype(np.float32)
    grass = rgb(base)[None, None] * (0.75 + 0.5 * n[..., None])
    soil = rgb(dirt)[None, None] * (0.8 + 0.35 * n[..., None])
    t = np.clip((d - (1 - dirt_amt)) * 5, 0, 1)[..., None]
    img = grass * (1 - t) + soil * t + (g[..., None] - 0.5) * 22
    return img

def floor_dirt(rng, base=(86, 74, 54)):
    n = fbm(rng, H, W); g = rng.random((H, W)).astype(np.float32)
    return rgb(base)[None, None] * (0.8 + 0.38 * n[..., None]) + (g[..., None] - 0.5) * 18

def floor_pavers(rng, base=(74, 62, 54)):
    img = floor_concrete(rng, base, joints=0)
    bw, bh = T // 2, T // 4
    for row, y in enumerate(range(0, H, bh)):
        off = (row % 2) * bw // 2
        img[y:y + S * 2] *= 0.6
        for x in range(-off, W, bw):
            if x >= 0: img[y:y + bh, x:x + S * 2] *= 0.62
            img[y:y + bh, max(0, x):max(0, x + bw)] *= rng.uniform(0.9, 1.08)
    return img

# ───────────────────────── decalques ─────────────────────────
def blob(d, cx, cy, r, color, rng, n=7):
    for _ in range(n):
        rr = r * rng.uniform(0.35, 0.8); ox, oy = rng.uniform(-r, r) * 0.6, rng.uniform(-r, r) * 0.6
        d.ellipse((cx + ox - rr, cy + oy - rr, cx + ox + rr, cy + oy + rr), fill=color)

def crack(d, x, y, rng, length, color=(20, 20, 18, 150)):
    pts = [(x, y)]; a = rng.uniform(0, math.tau)
    for _ in range(int(length / (6 * S))):
        a += rng.uniform(-0.6, 0.6); x += math.cos(a) * 6 * S; y += math.sin(a) * 6 * S; pts.append((x, y))
        if rng.random() < 0.12: crack(d, x, y, rng, length * 0.35, color)
    d.line(pts, fill=color, width=max(1, S))

def decals(img, rng, kinds, n=1.0, avoid=None, near=None):
    """Manchas, rachaduras, papéis, folhas, cápsulas… num RGBA por cima do piso."""
    lay = Image.new('RGBA', (W, H)); d = ImageDraw.Draw(lay)
    def spot():
        for _ in range(30):
            if near and rng.random() < 0.6:
                tx, ty = rng.choice(near); x, y = (tx + rng.uniform(-0.6, 1.6)) * T, (ty + rng.uniform(-0.6, 1.6)) * T
            else: x, y = rng.uniform(0, W), rng.uniform(0, H)
            if avoid is None or not avoid[min(GH - 1, max(0, int(y // T))), min(GW - 1, max(0, int(x // T)))]: return x, y
        return x, y
    for k in kinds:
        cnt = int({'crack': 22, 'oil': 6, 'blood': 7, 'paper': 26, 'leaves': 160, 'trash': 26, 'glass': 16, 'casing': 30, 'puddle': 4, 'stain': 7, 'hay': 120, 'tracks': 3, 'moss': 18}[k] * n)
        for _ in range(cnt):
            x, y = spot()
            if k == 'crack': crack(d, x, y, rng, rng.uniform(40, 140) * S)
            elif k == 'oil': blob(d, x, y, rng.uniform(14, 34) * S, (12, 12, 14, 90), rng)
            elif k == 'stain': blob(d, x, y, rng.uniform(12, 30) * S, (30, 26, 18, 60), rng)
            elif k == 'puddle': blob(d, x, y, rng.uniform(20, 46) * S, (28, 38, 44, 140), rng, 9)
            elif k == 'blood':
                blob(d, x, y, rng.uniform(8, 20) * S, (78, 14, 12, 170), rng, 6)
                for _ in range(rng.randint(3, 9)):
                    a = rng.uniform(0, math.tau); r = rng.uniform(10, 40) * S; rr = rng.uniform(1.5, 4) * S
                    d.ellipse((x + math.cos(a) * r - rr, y + math.sin(a) * r - rr, x + math.cos(a) * r + rr, y + math.sin(a) * r + rr), fill=(90, 16, 14, 170))
                if rng.random() < 0.5:  # rastro arrastado
                    a = rng.uniform(0, math.tau); L = rng.uniform(40, 110) * S
                    d.line((x, y, x + math.cos(a) * L, y + math.sin(a) * L), fill=(70, 14, 12, 110), width=int(rng.uniform(6, 12) * S))
            elif k == 'paper':
                w_, h_ = rng.uniform(8, 16) * S, rng.uniform(10, 20) * S; a = rng.uniform(0, math.pi)
                pts = [(x + math.cos(a) * dx - math.sin(a) * dy, y + math.sin(a) * dx + math.cos(a) * dy) for dx, dy in ((-w_, -h_), (w_, -h_), (w_, h_), (-w_, h_))]
                d.polygon([(px / 2 + x / 2, py / 2 + y / 2) for px, py in pts], fill=(196, 190, 170, 200))
            elif k == 'leaves':
                c = rng.choice([(96, 72, 40, 150), (110, 84, 44, 140), (78, 66, 38, 160), (66, 78, 42, 150)]); r = rng.uniform(2, 4) * S; a = rng.uniform(0, math.pi)
                d.line((x - math.cos(a) * r, y - math.sin(a) * r, x + math.cos(a) * r, y + math.sin(a) * r), fill=c, width=int(r * 0.9))
            elif k == 'hay':
                a = rng.uniform(0, math.pi); L = rng.uniform(6, 16) * S
                d.line((x, y, x + math.cos(a) * L, y + math.sin(a) * L), fill=(176, 150, 82, 180), width=S)
            elif k == 'trash':
                c = rng.choice([(150, 40, 34, 220), (60, 90, 120, 220), (180, 170, 150, 220), (40, 40, 38, 230), (170, 140, 60, 220)])
                r = rng.uniform(3, 7) * S; d.rectangle((x - r, y - r * 0.6, x + r, y + r * 0.6), fill=c)
            elif k == 'glass':
                for _ in range(6):
                    ox, oy = rng.uniform(-12, 12) * S, rng.uniform(-12, 12) * S; r = rng.uniform(1, 3) * S
                    d.polygon([(x + ox, y + oy - r), (x + ox + r, y + oy + r), (x + ox - r, y + oy + r * 0.4)], fill=(170, 200, 205, 150))
            elif k == 'casing':
                r = 1.6 * S; d.ellipse((x - r * 2, y - r, x + r * 2, y + r), fill=(176, 140, 60, 220))
            elif k == 'moss': blob(d, x, y, rng.uniform(10, 26) * S, (54, 72, 40, 120), rng)
            elif k == 'tracks':
                y0 = rng.uniform(0.2, 0.8) * H
                for off in (-26 * S, 26 * S):
                    pts = [(xx, y0 + off + math.sin(xx / (180 * S)) * 30 * S) for xx in range(0, W, 20 * S)]
                    d.line(pts, fill=(30, 28, 24, 70), width=14 * S)
    return Image.alpha_composite(img, lay)

# ───────────────────────── peças (objetos) ─────────────────────────
def rr(d, b, r, fill, outline=None, w=0):
    d.rounded_rectangle(b, radius=r, fill=fill, outline=outline, width=w)

def p_car(d, b, rng, color=None, alarm=False):
    x0, y0, x1, y1 = b; hor = (x1 - x0) > (y1 - y0)
    if (x1 - x0) == (y1 - y0):  # carro numa casa só: em pé, passando um pouco da casa
        y0 -= 0.22 * T; y1 += 0.22 * T
    col = color or rng.choice([(122, 40, 34), (52, 70, 92), (150, 146, 136), (46, 58, 44), (110, 96, 64), (36, 38, 40), (96, 104, 110)])
    if hor: x0 += 0.06 * T; x1 -= 0.06 * T; cy = (y0 + y1) / 2; hh = min(0.36 * T, (y1 - y0) * 0.42); y0, y1 = cy - hh, cy + hh
    else: y0 += 0.06 * T; y1 -= 0.06 * T; cx = (x0 + x1) / 2; ww = min(0.36 * T, (x1 - x0) * 0.42); x0, x1 = cx - ww, cx + ww
    L = (x1 - x0) if hor else (y1 - y0); Wd = (y1 - y0) if hor else (x1 - x0)
    def seg(a, b_, inset=0.0):
        if hor: return (x0 + L * a, y0 + Wd * inset, x0 + L * b_, y1 - Wd * inset)
        return (x0 + Wd * inset, y0 + L * a, x1 - Wd * inset, y0 + L * b_)
    # rodas aparecendo
    for a in (0.16, 0.74):
        if hor:
            d.rectangle((x0 + L * a, y0 - 0.05 * T, x0 + L * (a + 0.12), y1 + 0.05 * T), fill=(18, 18, 18))
        else:
            d.rectangle((x0 - 0.05 * T, y0 + L * a, x1 + 0.05 * T, y0 + L * (a + 0.12)), fill=(18, 18, 18))
    rr(d, (x0, y0, x1, y1), int(Wd * 0.28), shade(col, 0.75))
    rr(d, seg(0.02, 0.98, 0.06), int(Wd * 0.24), col)
    d.polygon(_trap(seg(0.28, 0.40, 0.12), hor, True), fill=(34, 44, 52))      # para-brisa
    rr(d, seg(0.40, 0.72, 0.14), int(Wd * 0.1), shade(col, 1.12))                # teto
    d.polygon(_trap(seg(0.72, 0.82, 0.14), hor, False), fill=(30, 38, 46))     # vidro traseiro
    for side in (0.12, 0.88):  # faróis
        if hor: d.ellipse((x1 - 0.06 * T, y0 + Wd * side - 3 * S, x1 - 0.01 * T, y0 + Wd * side + 3 * S), fill=(220, 210, 160))
        else: d.ellipse((x0 + Wd * side - 3 * S, y1 - 0.06 * T, x0 + Wd * side + 3 * S, y1 - 0.01 * T), fill=(220, 210, 160))
    # sujeira, ferrugem
    for _ in range(5):
        px, py = rng.uniform(x0, x1), rng.uniform(y0, y1); r = rng.uniform(1.5, 4) * S
        d.ellipse((px - r, py - r, px + r, py + r), fill=(*shade(col, 0.8), 70))
    if alarm:  # luz de alarme no painel
        c = seg(0.36, 0.40, 0.42); d.ellipse(c, fill=(220, 60, 40))

def _trap(b, hor, front):
    x0, y0, x1, y1 = b
    if hor:
        k = (y1 - y0) * 0.12
        return [(x0, y0 + k), (x1, y0), (x1, y1), (x0, y1 - k)] if front else [(x0, y0), (x1, y0 + k), (x1, y1 - k), (x0, y1)]
    k = (x1 - x0) * 0.12
    return [(x0 + k, y0), (x1 - k, y0), (x1, y1), (x0, y1)] if front else [(x0, y0), (x1, y0), (x1 - k, y1), (x0 + k, y1)]

def p_dumpster(d, b, rng):
    x0, y0, x1, y1 = b; x0 += 0.08 * T; y0 += 0.14 * T; x1 -= 0.08 * T; y1 -= 0.14 * T
    col = rng.choice([(46, 76, 58), (40, 60, 92), (88, 70, 40)])
    rr(d, (x0, y0, x1, y1), 4 * S, shade(col, 0.7)); rr(d, (x0 + 3 * S, y0 + 3 * S, x1 - 3 * S, y1 - 3 * S), 3 * S, col)
    mx = (x0 + x1) / 2; d.line((mx, y0 + 3 * S, mx, y1 - 3 * S), fill=shade(col, 0.55), width=2 * S)
    for i in range(1, 6): d.line((x0 + (x1 - x0) * i / 6, y0 + 6 * S, x0 + (x1 - x0) * i / 6, y1 - 6 * S), fill=shade(col, 0.85), width=S)
    for _ in range(10): r = rng.uniform(2, 5) * S; px, py = rng.uniform(x0, x1), rng.uniform(y0, y1); d.ellipse((px - r, py - r, px + r, py + r), fill=(110, 60, 30, 150))
    for _ in range(5):  # saco de lixo caindo
        px, py = rng.uniform(x0, x1), y1 + rng.uniform(-4, 10) * S; r = rng.uniform(6, 10) * S
        d.ellipse((px - r, py - r * 0.8, px + r, py + r * 0.8), fill=(26, 26, 28))

def p_gondola(d, b, rng):
    x0, y0, x1, y1 = b; hor = (x1 - x0) >= (y1 - y0)
    if hor: y0 += 0.16 * T; y1 -= 0.16 * T
    else: x0 += 0.16 * T; x1 -= 0.16 * T
    rr(d, (x0, y0, x1, y1), 3 * S, (70, 72, 70)); d.rectangle((x0 + 3 * S, y0 + 3 * S, x1 - 3 * S, y1 - 3 * S), fill=(104, 108, 106))
    mid = (y0 + y1) / 2 if hor else (x0 + x1) / 2
    if hor: d.line((x0, mid, x1, mid), fill=(60, 62, 60), width=2 * S)
    else: d.line((mid, y0, mid, y1), fill=(60, 62, 60), width=2 * S)
    pal = [(170, 50, 40), (200, 160, 50), (60, 110, 160), (220, 210, 190), (80, 140, 70), (180, 90, 40), (120, 60, 120)]
    L = (x1 - x0) if hor else (y1 - y0); pos = 4 * S
    while pos < L - 6 * S:
        w_ = rng.uniform(5, 11) * S; c = rng.choice(pal)
        if rng.random() < 0.18: pos += w_; continue  # prateleira saqueada
        for side in (0, 1):
            if hor:
                ya, yb = (y0 + 4 * S, mid - 2 * S) if side == 0 else (mid + 2 * S, y1 - 4 * S)
                d.rectangle((x0 + pos, ya, x0 + pos + w_ - S, yb), fill=jitter(c, rng, 18))
            else:
                xa, xb = (x0 + 4 * S, mid - 2 * S) if side == 0 else (mid + 2 * S, x1 - 4 * S)
                d.rectangle((xa, y0 + pos, xb, y0 + pos + w_ - S), fill=jitter(c, rng, 18))
        pos += w_

def p_cabinet(d, b, rng, col=(180, 184, 176), pad=0.14):
    x0, y0, x1, y1 = b; x0 += pad * T; y0 += pad * T; x1 -= pad * T; y1 -= pad * T
    rr(d, (x0, y0, x1, y1), 2 * S, shade(col, 0.7)); d.rectangle((x0 + 3 * S, y0 + 3 * S, x1 - 3 * S, y1 - 3 * S), fill=col)
    hor = (x1 - x0) >= (y1 - y0)
    n = max(2, int(((x1 - x0) if hor else (y1 - y0)) / (0.45 * T)))
    for i in range(1, n):
        if hor: xx = x0 + (x1 - x0) * i / n; d.line((xx, y0 + 3 * S, xx, y1 - 3 * S), fill=shade(col, 0.62), width=S)
        else: yy = y0 + (y1 - y0) * i / n; d.line((x0 + 3 * S, yy, x1 - 3 * S, yy), fill=shade(col, 0.62), width=S)
    for _ in range(3):
        px, py = rng.uniform(x0 + 6 * S, x1 - 6 * S), rng.uniform(y0 + 6 * S, y1 - 6 * S); d.rectangle((px, py, px + 6 * S, py + 4 * S), fill=(200, 196, 180))

def p_wardrobe(d, b, rng): p_cabinet(d, b, rng, col=(108, 76, 48), pad=0.12)
def p_locker(d, b, rng):
    p_cabinet(d, b, rng, col=(84, 98, 108), pad=0.12)
    x0, y0, x1, y1 = b
    for i in range(3): d.line((x0 + 0.3 * T, y0 + (0.3 + i * 0.1) * T, x1 - 0.3 * T, y0 + (0.3 + i * 0.1) * T), fill=(50, 60, 66), width=S)

def p_crates(d, b, rng):
    x0, y0, x1, y1 = b
    cells = [(x, y) for x in np.arange(x0, x1 - 1, T) for y in np.arange(y0, y1 - 1, T)]
    for cx, cy in cells:
        for (fx, fy, fs) in ((0.08, 0.08, 0.5), (0.5, 0.12, 0.42), (0.12, 0.52, 0.42), (0.48, 0.5, 0.44)):
            if rng.random() < 0.18: continue
            s_ = fs * T; ax, ay = cx + fx * T, cy + fy * T
            col = jitter((136, 102, 60), rng, 16)
            d.rectangle((ax, ay, ax + s_, ay + s_), fill=shade(col, 0.7))
            d.rectangle((ax + 2 * S, ay + 2 * S, ax + s_ - 2 * S, ay + s_ - 2 * S), fill=col)
            for k in range(1, 4): d.line((ax + 2 * S, ay + s_ * k / 4, ax + s_ - 2 * S, ay + s_ * k / 4), fill=shade(col, 0.72), width=S)
            d.line((ax + 2 * S, ay + 2 * S, ax + s_ - 2 * S, ay + s_ - 2 * S), fill=shade(col, 0.6), width=2 * S)

def p_container(d, b, rng):
    x0, y0, x1, y1 = b; x0 += 0.05 * T; y0 += 0.05 * T; x1 -= 0.05 * T; y1 -= 0.05 * T
    col = rng.choice([(140, 58, 40), (50, 84, 110), (70, 100, 60), (150, 120, 50)])
    d.rectangle((x0, y0, x1, y1), fill=shade(col, 0.62)); d.rectangle((x0 + 3 * S, y0 + 3 * S, x1 - 3 * S, y1 - 3 * S), fill=col)
    hor = (x1 - x0) >= (y1 - y0)
    for i in range(int(((x1 - x0) if hor else (y1 - y0)) / (5 * S))):
        if hor: xx = x0 + 6 * S + i * 5 * S; d.line((xx, y0 + 4 * S, xx, y1 - 4 * S), fill=shade(col, 0.8 if i % 2 else 1.1), width=S)
        else: yy = y0 + 6 * S + i * 5 * S; d.line((x0 + 4 * S, yy, x1 - 4 * S, yy), fill=shade(col, 0.8 if i % 2 else 1.1), width=S)
    for _ in range(18):
        px, py = rng.uniform(x0, x1), rng.uniform(y0, y1); r = rng.uniform(1.5, 4) * S
        d.ellipse((px - r * 1.6, py - r, px + r * 1.6, py + r), fill=(96, 54, 30, 80))

def p_hesco(d, b, rng):
    x0, y0, x1, y1 = b; x0 += 0.04 * T; y0 += 0.04 * T; x1 -= 0.04 * T; y1 -= 0.04 * T
    for cx in np.arange(x0, x1 - 1, T * 0.5):
        for cy in np.arange(y0, y1 - 1, T * 0.5):
            c = jitter((150, 132, 98), rng, 10)
            d.rectangle((cx, cy, cx + T * 0.5 - S, cy + T * 0.5 - S), fill=c, outline=(80, 80, 70), width=S)
            for k in range(1, 4):
                d.line((cx + k * T * 0.125, cy, cx + k * T * 0.125, cy + T * 0.5), fill=(110, 100, 80), width=1)
                d.line((cx, cy + k * T * 0.125, cx + T * 0.5, cy + k * T * 0.125), fill=(110, 100, 80), width=1)
            blob(d, cx + T * 0.25, cy + T * 0.25, T * 0.12, (120, 104, 76, 160), rng, 4)

def p_sandbags(d, b, rng):
    x0, y0, x1, y1 = b; hor = (x1 - x0) >= (y1 - y0)
    for row in range(2):
        n = int(((x1 - x0) if hor else (y1 - y0)) / (0.3 * T))
        for i in range(n + 1):
            off = (0.15 * T if row else 0)
            if hor: cx = x0 + off + i * 0.3 * T; cy = y0 + (0.34 + row * 0.3) * T
            else: cy = y0 + off + i * 0.3 * T; cx = x0 + (0.34 + row * 0.3) * T
            if cx > x1 - 0.1 * T or cy > y1 - 0.1 * T: continue
            c = jitter((150, 136, 100), rng, 12)
            rx, ry = (0.17 * T, 0.12 * T) if hor else (0.12 * T, 0.17 * T)
            d.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=shade(c, 0.7)); d.ellipse((cx - rx + S * 2, cy - ry + S * 2, cx + rx - S * 2, cy + ry - S * 2), fill=c)

def p_jersey(d, b, rng):
    x0, y0, x1, y1 = b; hor = (x1 - x0) >= (y1 - y0)
    if hor: y0 += 0.3 * T; y1 -= 0.3 * T
    else: x0 += 0.3 * T; x1 -= 0.3 * T
    d.rectangle((x0 + 2 * S, y0, x1 - 2 * S, y1), fill=(118, 116, 108)); d.rectangle((x0 + 4 * S, y0 + 0.08 * T, x1 - 4 * S, y1 - 0.08 * T), fill=(150, 148, 138))
    L = (x1 - x0) if hor else (y1 - y0)
    for i in range(int(L / (0.25 * T))):
        if i % 2: continue
        if hor: d.rectangle((x0 + i * 0.25 * T, y0, x0 + (i + 1) * 0.25 * T, y0 + 0.06 * T), fill=(190, 150, 40))
        else: d.rectangle((x0, y0 + i * 0.25 * T, x0 + 0.06 * T, y0 + (i + 1) * 0.25 * T), fill=(190, 150, 40))

def p_desk(d, b, rng):
    x0, y0, x1, y1 = b; x0 += 0.1 * T; y0 += 0.18 * T; x1 -= 0.1 * T; y1 -= 0.18 * T
    d.rectangle((x0, y0, x1, y1), fill=(74, 56, 38)); d.rectangle((x0 + 2 * S, y0 + 2 * S, x1 - 2 * S, y1 - 2 * S), fill=(104, 80, 54))
    mx = (x0 + x1) / 2
    d.rectangle((mx - 9 * S, y0 + 4 * S, mx + 9 * S, y0 + 8 * S), fill=(30, 30, 32))           # monitor
    for _ in range(rng.randint(2, 4)):
        px, py = rng.uniform(x0 + 4 * S, x1 - 14 * S), rng.uniform(y0 + 10 * S, y1 - 10 * S)
        d.rectangle((px, py, px + 10 * S, py + 13 * S), fill=(200, 196, 180))
    d.ellipse((mx - 8 * S, y1 + 2 * S, mx + 8 * S, y1 + 16 * S), fill=(36, 36, 40))            # cadeira

def p_table_round(d, b, rng):
    x0, y0, x1, y1 = b
    for cx in np.arange(x0, x1 - 1, T):
        for cy in np.arange(y0, y1 - 1, T):
            mx, my = cx + T / 2, cy + T / 2
            for a in (0.4, 2.0, 3.6, 5.2):
                if rng.random() < 0.3: continue
                px, py = mx + math.cos(a + rng.uniform(-.3, .3)) * 0.34 * T, my + math.sin(a) * 0.34 * T
                d.rectangle((px - 6 * S, py - 6 * S, px + 6 * S, py + 6 * S), fill=(120, 30, 30))
            r = 0.24 * T; d.ellipse((mx - r, my - r, mx + r, my + r), fill=(150, 146, 136)); d.ellipse((mx - r + 2 * S, my - r + 2 * S, mx + r - 2 * S, my + r - 2 * S), fill=(196, 190, 176))
            d.ellipse((mx - 4 * S, my - 4 * S, mx + 4 * S, my + 4 * S), fill=(140, 40, 30))

def p_counter(d, b, rng, col=(150, 60, 50)):
    x0, y0, x1, y1 = b; hor = (x1 - x0) >= (y1 - y0)
    if hor: y0 += 0.22 * T; y1 -= 0.22 * T
    else: x0 += 0.22 * T; x1 -= 0.22 * T
    d.rectangle((x0, y0, x1, y1), fill=shade(col, 0.7)); d.rectangle((x0 + 2 * S, y0 + 2 * S, x1 - 2 * S, y1 - 2 * S), fill=(180, 176, 166))
    for _ in range(int((x1 - x0) / T) * 2 + 1):
        px, py = rng.uniform(x0 + 6 * S, x1 - 10 * S), rng.uniform(y0 + 4 * S, y1 - 8 * S)
        c = rng.choice([(210, 200, 180), (60, 60, 64), (170, 60, 40)]); d.ellipse((px, py, px + 7 * S, py + 7 * S), fill=c)

def p_pew(d, b, rng):
    x0, y0, x1, y1 = b; y0 += 0.25 * T; y1 -= 0.25 * T
    d.rectangle((x0 + 3 * S, y0, x1 - 3 * S, y1), fill=(64, 44, 28)); d.rectangle((x0 + 5 * S, y0 + 2 * S, x1 - 5 * S, y0 + 0.12 * T), fill=(96, 68, 42))
    d.rectangle((x0 + 5 * S, y0 + 0.16 * T, x1 - 5 * S, y1 - 2 * S), fill=(110, 78, 48))
    for x in np.arange(x0 + 0.5 * T, x1, 0.5 * T): d.line((x, y0 + 0.16 * T, x, y1), fill=(80, 56, 34), width=S)
    if rng.random() < 0.4:  # hinário largado
        px = rng.uniform(x0 + 8 * S, x1 - 16 * S); d.rectangle((px, y0 + 0.2 * T, px + 9 * S, y0 + 0.2 * T + 7 * S), fill=(40, 30, 60))

def p_altar(d, b, rng):
    x0, y0, x1, y1 = b; x0 += 0.1 * T; y0 += 0.2 * T; x1 -= 0.1 * T; y1 -= 0.15 * T
    d.rectangle((x0, y0, x1, y1), fill=(120, 116, 104)); d.rectangle((x0 + 3 * S, y0 + 3 * S, x1 - 3 * S, y1 - 3 * S), fill=(170, 164, 148))
    d.rectangle((x0 + 0.2 * T, y0 + 3 * S, x1 - 0.2 * T, y1 - 3 * S), fill=(190, 186, 176))
    d.rectangle(((x0 + x1) / 2 - 0.25 * T, y0 + 3 * S, (x0 + x1) / 2 + 0.25 * T, y1 - 3 * S), fill=(130, 30, 34))
    for cx in (x0 + 0.15 * T, x1 - 0.15 * T):
        d.ellipse((cx - 4 * S, y0 + 0.2 * T, cx + 4 * S, y0 + 0.2 * T + 8 * S), fill=(220, 210, 180))

def p_bed(d, b, rng):
    x0, y0, x1, y1 = b; x0 += 0.12 * T; y0 += 0.2 * T; x1 -= 0.12 * T; y1 -= 0.2 * T
    d.rectangle((x0, y0, x1, y1), fill=(120, 124, 120)); d.rectangle((x0 + 2 * S, y0 + 2 * S, x1 - 2 * S, y1 - 2 * S), fill=(196, 200, 196))
    d.rectangle((x0 + 2 * S, y0 + 2 * S, x0 + 0.22 * T, y1 - 2 * S), fill=(226, 228, 224))
    d.polygon([(x0 + 0.4 * T, y0 + 2 * S), (x1 - 2 * S, y0 + 2 * S), (x1 - 2 * S, y1 - 2 * S), (x0 + 0.55 * T, y1 - 2 * S)], fill=(150, 170, 176))
    if rng.random() < 0.5: blob(d, rng.uniform(x0 + 0.3 * T, x1 - 0.2 * T), (y0 + y1) / 2, 6 * S, (110, 20, 18, 160), rng, 4)

def p_bench(d, b, rng):
    x0, y0, x1, y1 = b; hor = (x1 - x0) >= (y1 - y0)
    if hor: y0 += 0.3 * T; y1 -= 0.3 * T
    else: x0 += 0.3 * T; x1 -= 0.3 * T
    d.rectangle((x0 + 4 * S, y0, x1 - 4 * S, y1), fill=(40, 40, 38))
    for i in range(4):
        if hor: yy = y0 + 2 * S + i * (y1 - y0 - 4 * S) / 4; d.rectangle((x0 + 4 * S, yy, x1 - 4 * S, yy + (y1 - y0) / 5), fill=(112, 82, 52))
        else: xx = x0 + 2 * S + i * (x1 - x0 - 4 * S) / 4; d.rectangle((xx, y0 + 4 * S, xx + (x1 - x0) / 5, y1 - 4 * S), fill=(112, 82, 52))

def p_hay(d, b, rng):
    x0, y0, x1, y1 = b
    for cx in np.arange(x0, x1 - 1, T):
        for cy in np.arange(y0, y1 - 1, T):
            mx, my, r = cx + T / 2, cy + T / 2, 0.36 * T
            d.ellipse((mx - r, my - r, mx + r, my + r), fill=(150, 120, 60)); d.ellipse((mx - r + 3 * S, my - r + 3 * S, mx + r - 3 * S, my + r - 3 * S), fill=(196, 164, 90))
            for k in range(1, 4):
                rk = r * k / 4; d.ellipse((mx - rk, my - rk, mx + rk, my + rk), outline=(160, 128, 66), width=S)

def p_tractor(d, b, rng):
    x0, y0, x1, y1 = b; x0 += 0.1 * T; x1 -= 0.1 * T; y0 += 0.1 * T; y1 -= 0.1 * T
    w, h = x1 - x0, y1 - y0
    for (fx, fy, fw, fh) in ((0.05, 0.0, 0.3, 0.22), (0.05, 0.78, 0.3, 0.22), (0.7, 0.08, 0.2, 0.15), (0.7, 0.77, 0.2, 0.15)):
        rr(d, (x0 + w * fx, y0 + h * fy, x0 + w * (fx + fw), y0 + h * (fy + fh)), 4 * S, (24, 24, 22))
    rr(d, (x0 + w * 0.1, y0 + h * 0.22, x0 + w * 0.95, y0 + h * 0.78), 6 * S, (54, 96, 50))
    rr(d, (x0 + w * 0.12, y0 + h * 0.28, x0 + w * 0.42, y0 + h * 0.72), 4 * S, (40, 46, 40))
    d.rectangle((x0 + w * 0.5, y0 + h * 0.36, x0 + w * 0.93, y0 + h * 0.64), fill=(70, 120, 64))
    d.ellipse((x0 + w * 0.7, y0 + h * 0.42, x0 + w * 0.76, y0 + h * 0.5), fill=(30, 30, 30))

def p_tent(d, b, rng):
    x0, y0, x1, y1 = b; x0 += 0.08 * T; y0 += 0.08 * T; x1 -= 0.08 * T; y1 -= 0.08 * T
    col = rng.choice([(150, 90, 40), (60, 90, 110), (90, 110, 60)])
    my = (y0 + y1) / 2
    d.polygon([(x0, y0 + 6 * S), (x1, y0 + 6 * S), (x1, my), (x0, my)], fill=col)
    d.polygon([(x0, my), (x1, my), (x1, y1 - 6 * S), (x0, y1 - 6 * S)], fill=shade(col, 0.72))
    d.line((x0, my, x1, my), fill=shade(col, 0.5), width=2 * S)
    for px, py in ((x0, y0), (x1, y0), (x0, y1), (x1, y1)):
        d.line(((x0 + x1) / 2 + (px - (x0 + x1) / 2) * 0.9, my + (py - my) * 0.7, px, py), fill=(200, 196, 180), width=S)
    d.polygon([(x1 - 4 * S, my - 0.2 * T), (x1 + 0.05 * T, my), (x1 - 4 * S, my + 0.2 * T)], fill=(30, 26, 22))

def p_log(d, b, rng):
    x0, y0, x1, y1 = b; hor = (x1 - x0) >= (y1 - y0)
    if hor:
        y0 += 0.3 * T; y1 -= 0.3 * T; rr(d, (x0 + 4 * S, y0, x1 - 4 * S, y1), int((y1 - y0) / 2), (90, 64, 40))
        for _ in range(6): yy = rng.uniform(y0 + 3 * S, y1 - 3 * S); d.line((x0 + 10 * S, yy, x1 - 10 * S, yy), fill=(70, 50, 32), width=S)
        d.ellipse((x1 - 4 * S - (y1 - y0) * 0.6, y0, x1 - 4 * S, y1), fill=(170, 130, 84))
    else:
        x0 += 0.3 * T; x1 -= 0.3 * T; rr(d, (x0, y0 + 4 * S, x1, y1 - 4 * S), int((x1 - x0) / 2), (90, 64, 40))
        d.ellipse((x0, y1 - 4 * S - (x1 - x0) * 0.6, x1, y1 - 4 * S), fill=(170, 130, 84))

def p_pump_island(d, b, rng):
    x0, y0, x1, y1 = b; y0 += 0.18 * T; y1 -= 0.18 * T; x0 += 0.05 * T; x1 -= 0.05 * T
    rr(d, (x0, y0, x1, y1), 6 * S, (150, 148, 138)); rr(d, (x0 + 3 * S, y0 + 3 * S, x1 - 3 * S, y1 - 3 * S), 5 * S, (176, 172, 160))
    d.rectangle((x0, y0, x0 + 0.1 * T, y1), fill=(190, 150, 40)); d.rectangle((x1 - 0.1 * T, y0, x1, y1), fill=(190, 150, 40))
    for px in (x0 + (x1 - x0) * 0.3, x0 + (x1 - x0) * 0.7):
        d.rectangle((px - 0.13 * T, y0 + 0.08 * T, px + 0.13 * T, y1 - 0.08 * T), fill=(160, 40, 34))
        d.rectangle((px - 0.08 * T, y0 + 0.14 * T, px + 0.08 * T, y0 + 0.24 * T), fill=(30, 40, 44))
        d.line((px + 0.13 * T, (y0 + y1) / 2, px + 0.26 * T, y1 + 0.1 * T), fill=(20, 20, 20), width=2 * S)

def p_pillar(d, b, rng):
    x0, y0, x1, y1 = b
    for cx in np.arange(x0, x1 - 1, T):
        for cy in np.arange(y0, y1 - 1, T):
            p = 0.18 * T; d.rectangle((cx + p, cy + p, cx + T - p, cy + T - p), fill=(110, 108, 100))
            d.rectangle((cx + p + 3 * S, cy + p + 3 * S, cx + T - p - 3 * S, cy + T - p - 3 * S), fill=(140, 138, 128))
            d.rectangle((cx + p, cy + T / 2 - 4 * S, cx + T - p, cy + T / 2 + 4 * S), fill=(190, 150, 40))

def p_rock(d, b, rng):
    x0, y0, x1, y1 = b; cx, cy = (x0 + x1) / 2, (y0 + y1) / 2; r = min(x1 - x0, y1 - y0) * 0.4
    pts = [(cx + math.cos(a) * r * rng.uniform(0.7, 1.05), cy + math.sin(a) * r * rng.uniform(0.7, 1.05)) for a in np.linspace(0, math.tau, 9)[:-1]]
    d.polygon(pts, fill=(92, 92, 86)); d.polygon([(cx + (x - cx) * 0.7 - 3 * S, cy + (y - cy) * 0.7 - 3 * S) for x, y in pts], fill=(124, 122, 114))
    blob(d, cx - r * 0.2, cy - r * 0.3, r * 0.3, (80, 100, 60, 120), rng, 3)

def p_tires(d, b, rng):
    x0, y0, x1, y1 = b
    for _ in range(int((x1 - x0) * (y1 - y0) / T / T * 3)):
        cx, cy = rng.uniform(x0 + 0.25 * T, x1 - 0.25 * T), rng.uniform(y0 + 0.25 * T, y1 - 0.25 * T); r = 0.2 * T
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(26, 26, 26)); d.ellipse((cx - r * 0.5, cy - r * 0.5, cx + r * 0.5, cy + r * 0.5), fill=(54, 54, 52))

def p_couch(d, b, rng):
    x0, y0, x1, y1 = b; x0 += 0.08 * T; x1 -= 0.08 * T; y0 += 0.2 * T; y1 -= 0.2 * T
    col = rng.choice([(110, 60, 50), (70, 80, 60), (80, 76, 100)])
    rr(d, (x0, y0, x1, y1), 5 * S, shade(col, 0.7)); rr(d, (x0 + 6 * S, y0 + 0.12 * T, x1 - 6 * S, y1 - 2 * S), 4 * S, col)
    n = max(2, int((x1 - x0) / (0.4 * T)))
    for i in range(1, n): xx = x0 + (x1 - x0) * i / n; d.line((xx, y0 + 0.12 * T, xx, y1 - 2 * S), fill=shade(col, 0.6), width=S)

def p_barrel(d, b, rng, col=(150, 36, 28)):
    x0, y0, x1, y1 = b; cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    for (ox, oy, r) in ((-0.12, -0.08, 0.26), (0.18, 0.16, 0.18)):
        px, py, rr_ = cx + ox * T, cy + oy * T, r * T
        d.ellipse((px - rr_, py - rr_, px + rr_, py + rr_), fill=shade(col, 0.6)); d.ellipse((px - rr_ + 3 * S, py - rr_ + 3 * S, px + rr_ - 3 * S, py + rr_ - 3 * S), fill=col)
        d.ellipse((px - rr_ * 0.65, py - rr_ * 0.65, px + rr_ * 0.65, py + rr_ * 0.65), outline=shade(col, 0.7), width=S)
        d.ellipse((px + rr_ * 0.2, py - rr_ * 0.45, px + rr_ * 0.45, py - rr_ * 0.2), fill=(40, 40, 40))
    # aviso
    d.polygon([(cx - 0.1 * T, cy - 0.02 * T), (cx - 0.02 * T, cy - 0.16 * T), (cx + 0.06 * T, cy - 0.02 * T)], fill=(230, 190, 40))

def p_tree(d, b, rng):
    x0, y0, x1, y1 = b; cx, cy = (x0 + x1) / 2 + rng.uniform(-5, 5) * S, (y0 + y1) / 2 + rng.uniform(-5, 5) * S
    base = rng.choice([(36, 58, 32), (30, 52, 34), (46, 60, 30)])
    R = 0.58 * T
    for i in range(14):
        a = rng.uniform(0, math.tau); dd = rng.uniform(0, R * 0.55); r = R * rng.uniform(0.38, 0.6)
        px, py = cx + math.cos(a) * dd, cy + math.sin(a) * dd
        d.ellipse((px - r, py - r, px + r, py + r), fill=shade(base, rng.uniform(0.75, 1.0)))
    for i in range(10):  # luz de cima-esquerda
        a = rng.uniform(math.pi, 1.6 * math.pi); dd = rng.uniform(0, R * 0.5); r = R * rng.uniform(0.15, 0.3)
        px, py = cx + math.cos(a) * dd, cy + math.sin(a) * dd
        d.ellipse((px - r, py - r, px + r, py + r), fill=shade(base, rng.uniform(1.25, 1.5)))

def p_debris(d, b, rng, col=(96, 92, 84), n=12):
    x0, y0, x1, y1 = b
    for _ in range(n):
        cx, cy = rng.uniform(x0 + 6 * S, x1 - 6 * S), rng.uniform(y0 + 6 * S, y1 - 6 * S); r = rng.uniform(3, 9) * S
        pts = [(cx + math.cos(a) * r * rng.uniform(.6, 1.2), cy + math.sin(a) * r * rng.uniform(.6, 1.2)) for a in np.linspace(0, math.tau, 6)[:-1]]
        c = jitter(col, rng, 18); d.polygon(pts, fill=c)
        d.line(pts[:2], fill=shade(c, 1.3), width=S)
    for _ in range(3):
        a = rng.uniform(0, math.pi); cx, cy = rng.uniform(x0, x1), rng.uniform(y0, y1); L = rng.uniform(14, 30) * S
        d.line((cx, cy, cx + math.cos(a) * L, cy + math.sin(a) * L), fill=(100, 74, 46), width=4 * S)

def p_brush(d, b, rng):
    x0, y0, x1, y1 = b
    for _ in range(9):
        cx, cy = rng.uniform(x0 + 6 * S, x1 - 6 * S), rng.uniform(y0 + 6 * S, y1 - 6 * S); r = rng.uniform(6, 13) * S
        c = rng.choice([(54, 74, 38), (64, 84, 42), (48, 66, 36), (72, 80, 44)])
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(*c, 220))
        d.ellipse((cx - r * 0.5 - 2 * S, cy - r * 0.5 - 2 * S, cx + r * 0.2, cy + r * 0.2), fill=(*shade(c, 1.3), 200))

def p_mud(d, b, rng):
    x0, y0, x1, y1 = b
    blob(d, (x0 + x1) / 2, (y0 + y1) / 2, 0.42 * T, (66, 52, 36, 220), rng, 10)
    blob(d, (x0 + x1) / 2 + rng.uniform(-8, 8) * S, (y0 + y1) / 2, 0.2 * T, (48, 42, 34, 220), rng, 4)
    blob(d, (x0 + x1) / 2 - 6 * S, (y0 + y1) / 2 - 6 * S, 0.08 * T, (90, 96, 96, 120), rng, 3)

def p_crops(d, b, rng):
    x0, y0, x1, y1 = b
    for yy in np.arange(y0 + 0.12 * T, y1, 0.25 * T):
        d.line((x0, yy + 4 * S, x1, yy + 4 * S), fill=(60, 48, 32), width=5 * S)
        for xx in np.arange(x0 + rng.uniform(0, 8) * S, x1, 9 * S):
            r = rng.uniform(3, 6) * S; c = rng.choice([(110, 120, 50), (140, 130, 60), (90, 104, 44)])
            d.ellipse((xx - r, yy - r, xx + r, yy + r), fill=c)

def p_puddle(d, b, rng):
    x0, y0, x1, y1 = b; blob(d, (x0 + x1) / 2, (y0 + y1) / 2, 0.38 * T, (26, 32, 36, 120), rng, 8)
    blob(d, (x0 + x1) / 2 - 4 * S, (y0 + y1) / 2 - 4 * S, 0.16 * T, (70, 84, 94, 120), rng, 4)

PROPS = {
    'car': p_car, 'dumpster': p_dumpster, 'gondola': p_gondola, 'cabinet': p_cabinet, 'wardrobe': p_wardrobe, 'locker': p_locker,
    'crates': p_crates, 'container': p_container, 'hesco': p_hesco, 'sandbags': p_sandbags, 'jersey': p_jersey, 'desk': p_desk,
    'table': p_table_round, 'counter': p_counter, 'pew': p_pew, 'altar': p_altar, 'bed': p_bed, 'bench': p_bench, 'hay': p_hay,
    'tractor': p_tractor, 'tent': p_tent, 'log': p_log, 'pump': p_pump_island, 'pillar': p_pillar, 'rock': p_rock, 'tires': p_tires,
    'couch': p_couch, 'barrel': p_barrel, 'tree': p_tree, 'debris': p_debris, 'brush': p_brush, 'mud': p_mud, 'crops': p_crops, 'puddle': p_puddle,
}

# ───────────────────────── temas ─────────────────────────
# floor/infloor: piso de fora / de dentro dos cômodos. wall: cor do topo e da face. props: o que cada letra vira.
THEMES = {
    'hospital_corridor': dict(indoor=True, infloor=('tiles', dict(a=(120, 134, 124), size=0.5)), wall=((70, 74, 68), (168, 172, 160)),
                              props={'c': ['bed'], 'o': ['cabinet'], 'S': ['cabinet'], '~': ['debris'], 'B': ['barrel']}, decals=['blood', 'paper', 'glass', 'stain'],
                              stripes=[(5, (150, 40, 34)), (6, (50, 90, 130))], light=[(2, 1), (8, 5), (13, 8), (3, 8)], tint=(0.95, 1.0, 1.0)),
    'street': dict(indoor=False, floor=('asphalt', {}), infloor=('wood', dict(base=(88, 66, 44))), wall=((52, 46, 42), (112, 70, 54)),
                   props={'c': ['bench', 'jersey'], 'o': ['dumpster', 'car'], '~': ['debris', 'puddle'], 'A': ['car'], 'B': ['barrel']},
                   decals=['crack', 'oil', 'blood', 'trash', 'paper', 'glass'], lanes='h', light=[(3, 2), (12, 3), (8, 9)], tint=(0.96, 0.98, 1.04)),
    'house': dict(indoor=True, infloor=('wood', dict(base=(98, 72, 46))), wall=((60, 54, 48), (150, 140, 118)),
                  props={'c': ['couch'], 'o': ['wardrobe'], 'S': ['wardrobe'], '~': ['debris'], 'B': ['barrel']}, decals=['blood', 'paper', 'stain', 'glass'],
                  rugs=True, light=[(3, 2), (11, 5), (6, 9)], tint=(1.04, 1.0, 0.94)),
    'prison_yard': dict(indoor=False, floor=('concrete', dict(base=(98, 96, 86))), wall=((70, 70, 66), (128, 126, 116)),
                        props={'c': ['jersey', 'bench'], 'o': ['pillar'], '~': ['debris'], 'B': ['barrel']}, decals=['crack', 'stain', 'blood', 'trash', 'casing'],
                        court=True, light=[(5, 3), (11, 7)], tint=(0.98, 1.0, 1.0)),
    'forest': dict(indoor=False, floor=('grass', {}), props={'c': ['log', 'rock'], 'o': ['rock'], 'T': ['tree'], '~': ['brush', 'mud'], 'B': ['barrel']},
                   decals=['leaves', 'leaves', 'moss'], light=[(7, 4)], tint=(0.95, 1.02, 0.95)),
    'parking': dict(indoor=False, floor=('asphalt', dict(base=(56, 57, 52))), props={'c': ['jersey', 'tires'], 'o': ['car'], 'A': ['car'], '~': ['debris'], 'B': ['barrel']},
                    decals=['oil', 'crack', 'trash', 'blood', 'glass'], stalls=True, light=[(4, 3), (11, 6), (6, 9)], tint=(0.96, 0.98, 1.04)),
    'road': dict(indoor=False, floor=('asphalt', {}), props={'c': ['jersey'], 'o': ['car'], 'A': ['car'], 'T': ['tree'], '~': ['brush'], 'B': ['barrel']},
                 decals=['crack', 'oil', 'tracks', 'blood', 'trash'], lanes='road', verge=True, light=[(7, 5)], tint=(1.0, 1.0, 1.0)),
    'supermarket': dict(indoor=True, infloor=('tiles', dict(a=(138, 134, 120), b=(126, 122, 108), size=0.5)), wall=((66, 66, 60), (150, 146, 132)),
                        props={'c': ['counter'], 'o': ['gondola'], 'S': ['gondola'], '~': ['debris'], 'B': ['barrel']}, decals=['trash', 'paper', 'blood', 'glass', 'stain'],
                        light=[(3, 3), (9, 3), (5, 7), (12, 7)], tint=(1.0, 1.0, 0.97)),
    'base': dict(indoor=True, infloor=('concrete', dict(base=(90, 88, 78))), wall=((60, 56, 48), (110, 88, 62)),
                 props={'c': ['sandbags'], 'o': ['crates'], 'S': ['locker'], '~': ['debris'], 'B': ['barrel']}, decals=['stain', 'casing', 'trash', 'blood'],
                 light=[(4, 3), (11, 3), (8, 7)], tint=(1.03, 1.0, 0.95)),
    'gas_station': dict(indoor=False, floor=('concrete', dict(base=(100, 98, 90), joints=2)), infloor=('tiles', dict(a=(140, 136, 124), size=0.5)), wall=((60, 58, 54), (180, 176, 164)),
                        props={'c': ['tires', 'crates'], 'o': ['pump'], 'A': ['car'], 'S': ['gondola'], '~': ['debris'], 'B': ['barrel']},
                        decals=['oil', 'oil', 'crack', 'trash', 'blood'], canopy=(0, 1, 16, 5), light=[(3, 2), (11, 2), (6, 8)], tint=(1.0, 1.0, 1.0)),
    'alley': dict(indoor=False, floor=('pavers', {}), infloor=('wood', dict(base=(84, 62, 42))), wall=((48, 42, 40), (108, 64, 50)),
                  props={'c': ['crates'], 'o': ['dumpster'], 'S': ['wardrobe'], '~': ['debris', 'puddle'], 'B': ['barrel']},
                  decals=['trash', 'trash', 'puddle', 'blood', 'paper', 'stain'], light=[(7, 1), (2, 5), (12, 5)], tint=(0.94, 0.98, 1.05)),
    'warehouse': dict(indoor=True, infloor=('concrete', dict(base=(92, 92, 86))), wall=((58, 58, 56), (120, 118, 108)),
                      props={'c': ['crates'], 'o': ['container', 'crates', 'container'], 'S': ['gondola'], '~': ['debris'], 'B': ['barrel']}, decals=['oil', 'stain', 'crack', 'trash'],
                      safety=True, light=[(4, 2), (11, 2), (4, 7), (11, 7)], tint=(1.0, 1.0, 0.98)),
    'farm': dict(indoor=False, floor=('grass', dict(base=(70, 74, 40), dirt=(92, 76, 50), dirt_amt=0.55)), infloor=('wood', dict(base=(90, 66, 42))), wall=((70, 40, 30), (128, 52, 38)),
                 props={'c': ['hay'], 'o': ['tractor'], 'S': ['wardrobe'], '~': ['crops'], 'B': ['barrel']}, decals=['hay', 'leaves', 'tracks', 'stain'],
                 light=[(10, 3), (6, 7)], tint=(1.05, 1.0, 0.92)),
    'pharmacy': dict(indoor=True, infloor=('tiles', dict(a=(150, 152, 146), size=0.5)), wall=((64, 68, 64), (160, 168, 160)),
                     props={'c': ['counter'], 'o': ['cabinet'], 'S': ['gondola'], '~': ['debris'], 'B': ['barrel']}, decals=['paper', 'trash', 'glass', 'blood'],
                     cross=(12, 1), light=[(5, 2), (11, 2), (5, 7)], tint=(0.97, 1.02, 1.0)),
    'police': dict(indoor=True, infloor=('tiles', dict(a=(108, 116, 122), size=0.5)), wall=((56, 60, 66), (130, 138, 146)),
                   props={'c': ['desk'], 'o': ['cabinet'], 'S': ['locker'], '~': ['debris'], 'B': ['barrel']}, decals=['paper', 'paper', 'casing', 'blood', 'glass'],
                   light=[(4, 2), (12, 2), (8, 5), (6, 8)], tint=(0.95, 0.99, 1.05)),
    'church': dict(indoor=True, infloor=('tiles', dict(a=(104, 98, 88), b=(92, 86, 76), size=1.0, grout=0.8)), wall=((62, 56, 50), (140, 128, 110)),
                   props={'c': ['pew'], 'o': ['altar'], 'S': ['wardrobe'], '~': ['debris'], 'B': ['barrel']}, decals=['paper', 'stain', 'blood', 'glass'],
                   carpet=(7, 2, 2, 9), light=[(7, 1), (4, 5), (11, 5)], tint=(1.05, 1.0, 0.94)),
    'camp': dict(indoor=False, floor=('grass', dict(dirt_amt=0.5)), props={'c': ['log'], 'o': ['tent'], 'T': ['tree'], '~': ['brush', 'mud'], 'B': ['barrel']},
                 decals=['leaves', 'leaves', 'trash', 'moss'], campfire=(5, 4), light=[(5, 4)], tint=(1.03, 1.0, 0.94)),
    'bridge': dict(indoor=False, floor=('asphalt', dict(base=(58, 58, 54))), wall=((90, 90, 84), (140, 138, 130)),
                   props={'c': ['jersey'], 'o': ['car'], 'A': ['car'], '~': ['debris'], 'B': ['barrel']}, decals=['crack', 'oil', 'blood', 'trash', 'glass'],
                   lanes='bridge', light=[(4, 4), (12, 6)], tint=(0.95, 0.99, 1.05)),
    'sewer': dict(indoor=True, infloor=('concrete', dict(base=(66, 70, 62), joints=1)), wall=((44, 46, 42), (92, 92, 84)),
                  props={'c': ['crates'], 'o': ['pillar'], 'S': ['cabinet'], '~': ['puddle'], 'B': ['barrel']}, decals=['moss', 'moss', 'stain', 'trash', 'puddle'],
                  light=[(4, 1), (12, 8)], tint=(0.92, 1.02, 0.96), dark=0.82),
    'military': dict(indoor=False, floor=('dirt', dict(base=(92, 84, 64))), props={'c': ['sandbags'], 'o': ['hesco'], 'A': ['car'], '~': ['mud'], 'B': ['barrel']},
                     decals=['tracks', 'casing', 'casing', 'stain', 'trash'], light=[(4, 5), (12, 5)], tint=(1.02, 1.0, 0.94)),
    'restaurant': dict(indoor=True, infloor=('tiles', dict(a=(40, 40, 38), b=(156, 150, 134), size=0.5)), wall=((62, 54, 50), (150, 80, 66)),
                       props={'c': ['table'], 'o': ['cabinet'], 'S': ['cabinet'], '~': ['debris'], 'B': ['barrel']}, decals=['trash', 'paper', 'blood', 'glass', 'stain'],
                       counter_row=5, light=[(4, 2), (13, 2), (6, 7)], tint=(1.04, 1.0, 0.96)),
}
CAR_SKIN = {'military': (78, 84, 54)}

def paint_floor(rng, spec):
    kind, kw = spec
    return {'asphalt': floor_asphalt, 'concrete': floor_concrete, 'tiles': floor_tiles, 'wood': floor_wood, 'grass': floor_grass, 'dirt': floor_dirt, 'pavers': floor_pavers}[kind](rng, **kw)

def to_img(arr): return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).convert('RGBA')

def render(key, arena):
    th = THEMES.get(key, THEMES['street'])
    rows = arena['rows']
    base = [r.replace('P', '.').replace('Z', '.') for r in rows]
    seed = zlib.crc32(key.encode())
    rng = random.Random(seed); nrng = np.random.default_rng(seed)
    wallm = np.array([[c == '#' for c in r] for r in base])
    waterm = np.array([[c == 'w' for c in r] for r in base])
    inside = interior_mask(base, th['indoor']) & ~wallm

    # ── piso
    out_f = paint_floor(nrng, th['floor']) if 'floor' in th else None
    in_f = paint_floor(nrng, th['infloor']) if 'infloor' in th else out_f
    if out_f is None: out_f = in_f
    m = upmask(inside)[..., None]
    floor = out_f * (1 - m) + in_f * m
    img = to_img(floor)
    d = ImageDraw.Draw(img, 'RGBA')

    # ── marcações de chão
    if th.get('lanes') in ('h', 'road', 'bridge'):
        if th['lanes'] == 'h':
            road_rows = [y for y in range(GH) if not wallm[y].any() and not inside[y].any()]
            if road_rows:
                cy = (min(road_rows[:5]) + max(road_rows[:5]) + 1) / 2 * T
                for x in range(0, W, int(0.9 * T)): d.rectangle((x, cy - 3 * S, x + 0.5 * T, cy + 3 * S), fill=(200, 196, 170, 150))
                d.rectangle((0, 0, W, 0.18 * T), fill=(120, 116, 106, 255))  # meio-fio/calçada no topo
        else:
            y0, y1 = (3, 8) if th['lanes'] == 'bridge' else (1.5, 9.5)
            for yy in (y0 * T + 0.08 * T, y1 * T - 0.08 * T): d.rectangle((0, yy - 3 * S, W, yy + 3 * S), fill=(210, 206, 186, 170))
            cy = (y0 + y1) / 2 * T
            for off in (-5 * S, 5 * S): d.rectangle((0, cy + off - 2 * S, W, cy + off + 2 * S), fill=(200, 160, 50, 170))
    if th.get('stalls'):
        for (x, y, w, h) in components(base, 'o') + components(base, 'A'):
            for ys in (y - 0.4, y + h + 0.4):
                pass
            for xx in range(x, x + w + 1, 2 if w >= 2 else 1):
                d.rectangle((xx * T - 2 * S, (y - 0.45) * T, xx * T + 2 * S, (y + h + 0.45) * T), fill=(210, 206, 190, 140))
    if th.get('court'):
        d.rectangle((3 * T, 1.5 * T, 13 * T, 9.5 * T), outline=(200, 190, 160, 110), width=3 * S)
        d.line((8 * T, 1.5 * T, 8 * T, 9.5 * T), fill=(200, 190, 160, 110), width=3 * S)
        d.ellipse((7 * T, 4.5 * T, 9 * T, 6.5 * T), outline=(200, 190, 160, 110), width=3 * S)
    if th.get('stripes'):
        for i, (ry, col) in enumerate(th['stripes']):
            d.rectangle((T, (ry + 0.3 + i * 0.2) * T, W - T, (ry + 0.36 + i * 0.2) * T), fill=(*col, 150))
    if th.get('safety'):
        for y in (2.5, 6.5):
            d.rectangle((T, y * T, W - T, y * T + 4 * S), fill=(200, 160, 40, 150))
    if th.get('carpet'):
        cx, cy, cw, ch = th['carpet']
        d.rectangle((cx * T + 0.1 * T, cy * T, (cx + cw) * T - 0.1 * T, (cy + ch) * T), fill=(110, 26, 30, 230))
        d.rectangle((cx * T + 0.18 * T, cy * T, (cx + cw) * T - 0.18 * T, (cy + ch) * T), outline=(170, 130, 60, 200), width=2 * S)
    if th.get('helipad'):
        cx, cy = th['helipad']; r = 1.3 * T
        d.ellipse((cx * T - r + T / 2, cy * T - r + T / 2, cx * T + r + T / 2, cy * T + r + T / 2), outline=(200, 190, 150, 120), width=5 * S)
    if th.get('cross'):
        cx, cy = th['cross']
        d.rectangle((cx * T + 0.4 * T, cy * T + 0.15 * T, cx * T + 0.6 * T, cy * T + 0.85 * T), fill=(60, 150, 80, 200))
        d.rectangle((cx * T + 0.15 * T, cy * T + 0.4 * T, cx * T + 0.85 * T, cy * T + 0.6 * T), fill=(60, 150, 80, 200))
    if th.get('rugs'):
        for _ in range(3):
            for _ in range(40):
                x, y = rng.randrange(1, GW - 3), rng.randrange(1, GH - 2)
                if all(base[y + j][x + i] in '.~' for i in range(3) for j in range(2)): break
            col = rng.choice([(110, 40, 36), (50, 70, 90), (120, 96, 50)])
            d.rectangle((x * T + 0.2 * T, y * T + 0.2 * T, (x + 3) * T - 0.2 * T, (y + 2) * T - 0.2 * T), fill=(*col, 210))
            d.rectangle((x * T + 0.3 * T, y * T + 0.3 * T, (x + 3) * T - 0.3 * T, (y + 2) * T - 0.3 * T), outline=(*shade(col, 1.5), 200), width=3 * S)

    # ── decalques (sangue mais perto de onde os infectados surgem)
    zs = [(x, y) for y, r in enumerate(rows) for x, c in enumerate(r) if c == 'Z']
    img = decals(img, rng, th.get('decals', []), avoid=wallm | waterm, near=zs)

    # ── água
    if waterm.any():
        n = fbm(nrng, H, W, (200, 60, 16, 6))
        wm = soft(upmask(waterm), 16 * S); wm = np.clip((wm + (n - 0.5) * 0.5 - 0.5) * 6 + 0.5, 0, 1); ws = soft(wm, 3 * S)
        deep = soft(upmask(waterm), 40 * S)
        water = rgb((44, 66, 72))[None, None] * (0.75 + 0.4 * n[..., None]) * (1.05 - 0.35 * deep[..., None])
        hl = vnoise(nrng, H, W, 6 * S); water += np.clip((hl - 0.9) * 10, 0, 1)[..., None] * 14 * ws[..., None]
        arr = np.asarray(img, np.float32)[..., :3]
        shore = np.clip(soft(wm, 14 * S) - ws, 0, 1)[..., None]
        arr = arr * (1 - shore * 0.35)
        arr = arr * (1 - ws[..., None]) + water * ws[..., None]
        img = to_img(arr); d = ImageDraw.Draw(img, 'RGBA')
        if not th['indoor']:  # juncos na margem
            for y in range(GH):
                for x in range(GW):
                    if waterm[y, x] and any(0 <= x + dx < GW and 0 <= y + dy < GH and not waterm[y + dy, x + dx] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                        for _ in range(6):
                            px, py = (x + rng.random()) * T, (y + rng.random()) * T
                            d.line((px, py, px + rng.uniform(-4, 4) * S, py - rng.uniform(8, 16) * S), fill=(80, 96, 50, 220), width=S)

    # ── paredes (topo + face voltada para baixo + sombra no chão)
    if wallm.any():
        top_c, face_c = th.get('wall', ((60, 58, 54), (130, 126, 116)))
        wm = upmask(wallm)
        n = fbm(nrng, H, W, (120, 40, 12, 4))
        arr = np.asarray(img, np.float32)[..., :3]
        # oclusão no chão encostado na parede
        ao = np.clip(soft(wm, 12 * S) - wm, 0, 1)[..., None]
        arr = arr * (1 - ao * 0.75)
        top = rgb(top_c)[None, None] * (0.85 + 0.3 * n[..., None])
        arr = arr * (1 - wm[..., None]) + top * wm[..., None]
        img = to_img(arr); d = ImageDraw.Draw(img, 'RGBA')
        fh = int(0.3 * T)
        for y in range(GH):
            for x in range(GW):
                if not wallm[y, x]: continue
                x0, y0 = x * T, y * T
                below_open = y + 1 < GH and not wallm[y + 1, x]
                if below_open:  # face da parede
                    fc = face_c
                    d.rectangle((x0, y0 + T - fh, x0 + T, y0 + T), fill=shade(fc, 0.9))
                    if key in ('street', 'alley', 'farm'):  # tijolo / tábua
                        for row_, yy in enumerate(range(y0 + T - fh, y0 + T, 7 * S)):
                            d.line((x0, yy, x0 + T, yy), fill=shade(fc, 0.62), width=S)
                            for xx in range(x0 + (row_ % 2) * 8 * S, x0 + T, 16 * S if key != 'farm' else 999):
                                d.line((xx, yy, xx, yy + 7 * S), fill=shade(fc, 0.62), width=S)
                    d.rectangle((x0, y0 + T - fh, x0 + T, y0 + T - fh + 2 * S), fill=shade(fc, 1.25))
                    d.rectangle((x0, y0 + T - 3 * S, x0 + T, y0 + T), fill=shade(fc, 0.5))
                # bordas iluminadas do topo
                for (dx, dy, edge) in ((0, -1, (x0, y0, x0 + T, y0 + 2 * S)), (-1, 0, (x0, y0, x0 + 2 * S, y0 + T)), (1, 0, (x0 + T - 2 * S, y0, x0 + T, y0 + T))):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < GW and 0 <= ny < GH and not wallm[ny, nx]: d.rectangle(edge, fill=shade(top_c, 1.6))
        # telhado com detalhes nas áreas externas (prédios vistos de cima)
        if not th['indoor']:
            for _ in range(int(wallm.sum() * 0.25)):
                ys, xs = np.nonzero(wallm); i = rng.randrange(len(xs))
                px, py = (xs[i] + rng.uniform(0.2, 0.6)) * T, (ys[i] + rng.uniform(0.1, 0.4)) * T
                d.rectangle((px, py, px + 0.24 * T, py + 0.2 * T), fill=shade(top_c, 1.25))

    # ── portas: só o batente e a soleira (a folha da porta é desenhada pelo jogo, porque abre e fecha)
    for y, r in enumerate(base):
        for x, c in enumerate(r):
            if c in '+/':
                horiz = (x > 0 and base[y][x - 1] == '#') or (x < GW - 1 and base[y][x + 1] == '#')
                x0, y0 = x * T, y * T
                if horiz: d.rectangle((x0, y0 + 0.38 * T, x0 + T, y0 + 0.62 * T), fill=(46, 40, 34, 255))
                else: d.rectangle((x0 + 0.38 * T, y0, x0 + 0.62 * T, y0 + T), fill=(46, 40, 34, 255))

    # ── saídas
    for y, r in enumerate(base):
        for x, c in enumerate(r):
            if c != 'E': continue
            x0, y0 = x * T, y * T
            glow = Image.new('RGBA', (W, H)); gd = ImageDraw.Draw(glow)
            gd.ellipse((x0 - 0.4 * T, y0 - 0.4 * T, x0 + 1.4 * T, y0 + 1.4 * T), fill=(220, 200, 140, 70))
            img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(18 * S))); d = ImageDraw.Draw(img, 'RGBA')
            dx = 1 if x == GW - 1 else -1 if x == 0 else 0; dy = 0 if dx else (1 if y == GH - 1 else -1 if y == 0 else 0)
            if not dx and not dy: dx = 1
            cx, cy = x0 + T / 2, y0 + T / 2
            pts = [(cx + dx * 0.3 * T, cy + dy * 0.3 * T), (cx - dx * 0.1 * T + dy * 0.22 * T, cy - dy * 0.1 * T + dx * 0.22 * T), (cx - dx * 0.1 * T - dy * 0.22 * T, cy - dy * 0.1 * T - dx * 0.22 * T)]
            d.polygon(pts, fill=(210, 180, 70, 150))
            d.line((cx - dx * 0.35 * T, cy - dy * 0.35 * T, cx - dx * 0.05 * T, cy - dy * 0.05 * T), fill=(210, 180, 70, 150), width=6 * S)

    # ── objetos (com sombra)
    props = Image.new('RGBA', (W, H)); pd = ImageDraw.Draw(props, 'RGBA')
    trees = Image.new('RGBA', (W, H)); td = ImageDraw.Draw(trees, 'RGBA')
    mapping = th['props']
    for ch in 'c~oSABT':
        if ch not in mapping: continue
        comps = components(base, ch)
        if ch in 'A': comps = split_long(comps, 2)
        if ch == 'o' and 'car' in mapping['o']: comps = split_long(comps, 2)
        if ch == '~': comps = [(x, y, 1, 1) for (cx, cy, w, h) in comps for x in range(cx, cx + w) for y in range(cy, cy + h)]
        for (x, y, w, h) in comps:
            kinds = mapping[ch]; kind = kinds[zlib.crc32(f'{key}{x},{y}'.encode()) % len(kinds)]
            if th.get('counter_row') is not None and ch == 'c' and w >= 3: kind = 'counter'
            if ch == 'o' and kind == 'car' and w == 1 and h == 1 and len(kinds) > 1: kind = kinds[0] if kinds[0] != 'car' else kinds[1]
            box = tile_box(x, y, w, h)
            if kind == 'tree':
                for i in range(w):
                    for j in range(h): p_tree(td, tile_box(x + i, y + j), rng)
                continue
            if kind == 'car': p_car(pd, box, rng, color=CAR_SKIN.get(key), alarm=(ch == 'A'))
            elif ch == '~' and kind in ('debris', 'brush', 'mud', 'crops', 'puddle'): PROPS[kind](pd if kind in ('debris', 'brush') else d, box, rng)
            else: PROPS[kind](pd, box, rng)
    if th.get('campfire'):
        cx, cy = th['campfire']; cx, cy = (cx + 0.5) * T, (cy + 0.5) * T
        for a in np.linspace(0, math.tau, 9)[:-1]:
            pd.ellipse((cx + math.cos(a) * 0.3 * T - 6 * S, cy + math.sin(a) * 0.3 * T - 6 * S, cx + math.cos(a) * 0.3 * T + 6 * S, cy + math.sin(a) * 0.3 * T + 6 * S), fill=(100, 98, 92))
        d.ellipse((cx - 0.22 * T, cy - 0.22 * T, cx + 0.22 * T, cy + 0.22 * T), fill=(30, 22, 18, 255))
        for _ in range(5): pd.line((cx + rng.uniform(-12, 12) * S, cy + rng.uniform(-12, 12) * S, cx + rng.uniform(-12, 12) * S, cy + rng.uniform(-12, 12) * S), fill=(60, 40, 26), width=4 * S)
    def with_shadow(base_img, layer, off=(0.08, 0.12), blur=7, alpha=0.6):
        a = layer.split()[3]
        sh = Image.new('RGBA', (W, H), (0, 0, 0, 0)); sh.putalpha(a.point(lambda v: int(v * alpha)))
        sh = ImageChops.offset(sh, int(off[0] * T), int(off[1] * T)).filter(ImageFilter.GaussianBlur(blur * S))
        return Image.alpha_composite(Image.alpha_composite(base_img, sh), layer)
    img = with_shadow(img, props)
    if th.get('canopy'):  # cobertura do posto: sombra grande e pilares
        x, y, w, h = th['canopy']
        sh = Image.new('RGBA', (W, H)); sd = ImageDraw.Draw(sh)
        sd.rectangle((x * T + 0.3 * T, y * T + 0.5 * T, (x + w) * T - 0.3 * T, (y + h) * T + 0.2 * T), fill=(0, 0, 0, 70))
        img = Image.alpha_composite(img, sh.filter(ImageFilter.GaussianBlur(30 * S)))
    img = with_shadow(img, trees, off=(0.18, 0.24), blur=12, alpha=0.7)

    # ── luz: poças de luz, vinheta, tom do tema
    arr = np.asarray(img, np.float32)[..., :3]
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    light = np.zeros((H, W), np.float32)
    for (lx, ly) in th.get('light', []):
        cx, cy = (lx + 0.5) * T, (ly + 0.5) * T
        light += np.exp(-(((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * (2.2 * T) ** 2)))
    if th.get('campfire'):
        cx, cy = (th['campfire'][0] + 0.5) * T, (th['campfire'][1] + 0.5) * T
        fire = np.exp(-(((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * (1.6 * T) ** 2)))
        arr += fire[..., None] * np.array([60, 30, 0], np.float32)
    vig = 1 - 0.42 * (((xx / W - 0.5) * 1.5) ** 2 + ((yy / H - 0.5) * 1.6) ** 2)
    dark = th.get('dark', 0.9 if th['indoor'] else 1.0)
    arr = arr * (dark * vig * (0.82 + 0.3 * np.clip(light, 0, 1.2)))[..., None]
    arr *= np.array(th.get('tint', (1, 1, 1)), np.float32)[None, None]
    # leve dessaturação para combinar com a interface
    gray = arr.mean(axis=2, keepdims=True); arr = gray + (arr - gray) * 0.82
    out = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).resize((GW * 64, GH * 64), Image.LANCZOS)
    out.save(OUT / f'{key}.png', optimize=True)
    return out

# ───────────────────────── peças dinâmicas ─────────────────────────
def sprites():
    SD = OUT / 'sprites'; SD.mkdir(parents=True, exist_ok=True)
    TT = 128
    def save(im, name): im.save(SD / f'{name}.png', optimize=True)
    rng = random.Random(7)
    # porta fechada (horizontal): folha de madeira atravessando o batente
    im = Image.new('RGBA', (TT, TT)); d = ImageDraw.Draw(im)
    d.rectangle((0, 50, TT, 78), fill=(30, 22, 16, 255)); d.rectangle((6, 53, TT - 6, 75), fill=(112, 78, 46, 255))
    for x in range(14, TT - 8, 18): d.line((x, 55, x, 73), fill=(86, 58, 34, 255), width=2)
    d.ellipse((TT - 26, 60, TT - 18, 68), fill=(196, 170, 90, 255))
    save(im, 'door_closed')
    # porta aberta: folha girada encostada num lado
    im = Image.new('RGBA', (TT, TT)); d = ImageDraw.Draw(im)
    d.rectangle((0, 56, 10, 72), fill=(30, 22, 16, 255)); d.rectangle((TT - 10, 56, TT, 72), fill=(30, 22, 16, 255))
    d.rectangle((6, 64, 26, TT), fill=(30, 22, 16, 255)); d.rectangle((9, 66, 23, TT - 4), fill=(112, 78, 46, 255))
    d.arc((6 - 110, 64 - 110, 6 + 110, 64 + 110), 0, 90, fill=(200, 190, 160, 70), width=2)
    save(im, 'door_open')
    # porta arrombada
    im = Image.new('RGBA', (TT, TT)); d = ImageDraw.Draw(im)
    for _ in range(9):
        x = rng.uniform(10, TT - 30); y = rng.uniform(40, 86); a = rng.uniform(-0.6, 0.6); L = rng.uniform(18, 40)
        d.line((x, y, x + math.cos(a) * L, y + math.sin(a) * L), fill=(112, 78, 46, 255), width=6)
    save(im, 'door_broken')
    # entulho (estante derrubada / escombros)
    im = Image.new('RGBA', (TT, TT)); d = ImageDraw.Draw(im)
    blob(d, 64, 64, 46, (40, 36, 30, 200), rng, 9)
    d.polygon([(14, 40), (110, 56), (104, 84), (10, 68)], fill=(84, 60, 38, 255)); d.polygon([(18, 44), (104, 58), (100, 78), (16, 64)], fill=(110, 80, 50, 255))
    p_debris(d, (8, 8, 120, 120), rng, col=(120, 110, 96), n=14)
    for _ in range(10):
        x, y = rng.uniform(16, 112), rng.uniform(16, 112); c = rng.choice([(170, 50, 40), (200, 170, 60), (60, 110, 160), (220, 210, 190)])
        d.rectangle((x, y, x + 8, y + 6), fill=c)
    save(im, 'rubble')
    # chamuscado (galão que explodiu)
    im = Image.new('RGBA', (TT, TT)); d = ImageDraw.Draw(im)
    for r, a in ((60, 120), (46, 170), (30, 220)): d.ellipse((64 - r, 64 - r, 64 + r, 64 + r), fill=(14, 12, 10, a))
    im = im.filter(ImageFilter.GaussianBlur(6)); d = ImageDraw.Draw(im)
    for _ in range(14):
        a = rng.uniform(0, math.tau); r1, r2 = 20, rng.uniform(40, 62)
        d.line((64 + math.cos(a) * r1, 64 + math.sin(a) * r1, 64 + math.cos(a) * r2, 64 + math.sin(a) * r2), fill=(20, 16, 12, 200), width=3)
    p_debris(d, (24, 24, 104, 104), rng, col=(60, 50, 44), n=8)
    d.ellipse((50, 50, 78, 78), outline=(90, 30, 20, 255), width=5)
    save(im, 'scorch')
    # escombros leves (casa vizinha à explosão / estante)
    im = Image.new('RGBA', (TT, TT)); d = ImageDraw.Draw(im)
    p_debris(d, (14, 14, 114, 114), rng, col=(110, 104, 92), n=9)
    save(im, 'debris')

def write_layouts(arenas):
    data = {k: [r.replace('P', '.').replace('Z', '.') for r in v['rows']] for k, v in arenas.items()}
    ts = '// Gerado por client/scripts/gen-arenas.py a partir de server/src/game/combat/maps.ts. Não editar à mão.\n'
    ts += '// Geometria original de cada arena: o tabuleiro compara com ela para desenhar o que mudou (portas, escombros).\n'
    ts += 'export const ARENA_LAYOUTS: Record<string, string[]> = ' + json.dumps(data, ensure_ascii=False, indent=0).replace('\n', '') + ';\n'
    (ROOT / 'client/src/game/arenaLayouts.ts').write_text(ts, encoding='utf-8')

if __name__ == '__main__':
    arenas = load()
    only = sys.argv[1:]
    OUT.mkdir(parents=True, exist_ok=True)
    for k, a in arenas.items():
        if only and k not in only: continue
        render(k, a); print('arena', k)
    sprites(); write_layouts(arenas); print('ok')
