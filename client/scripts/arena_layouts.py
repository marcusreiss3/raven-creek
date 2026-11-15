"""Lê as arenas de server/src/game/combat/maps.ts (fonte única da geometria)."""
import re, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[2]
def load():
    src = (ROOT / 'server/src/game/combat/maps.ts').read_text(encoding='utf-8')
    out = {}
    for m in re.finditer(r"(\w+): \{ name: '([^']*)', rows: \[(.*?)\] \}", src, re.S):
        rows = re.findall(r"'([^']*)'", m.group(3))
        out[m.group(1)] = {'name': m.group(2), 'rows': [r.ljust(16, '#') for r in rows]}
    return out
