import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CLIENT_PUBLIC_DIR } from '../http/paths.js';
import { ARENA_KEYS, SCENE_KEYS } from '../game/content/world.js';
import { ARENAS } from '../game/combat/maps.js';

/**
 * Gera placeholders visualmente consistentes e claramente identificados.
 * NÃO sobrescreve arquivos existentes (suas artes definitivas ficam preservadas), exceto com --force.
 */
const palette: [RegExp, string, string][] = [
  [/hospital|clinic|morgue|surgery|ward|medical/, '#1d2a2a', '#3a5450'],
  [/prison|cell|solitary|guard|armory/, '#222024', '#45404a'],
  [/forest|woods|grove|trail|campsite|lake|creek|cabin|ranger/, '#18221a', '#34492f'],
  [/farm|barn|field|silo|orchard/, '#2a2416', '#5a4a26'],
  [/military|barracks|motor|command|checkpoint/, '#1e2318', '#3f4a2c'],
  [/road|highway|bridge|tunnel|crossroads|dirt/, '#1f1f22', '#40403f'],
  [/house|apartment|basement|garage|shed|backyard|motel/, '#241d1a', '#4d3b30'],
];
const colorsFor = (key: string) => palette.find(([re]) => re.test(key))?.slice(1) as [string, string] ?? ['#1e1d20', '#3d3a3f'];
const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!));

function sceneSvg(key: string, w: number, h: number, subtitle: string) {
  const [a, b] = colorsFor(key);
  const lines = Array.from({ length: 14 }, (_, i) => `<line x1="0" y1="${(i + 1) * h / 15}" x2="${w}" y2="${(i + 1) * h / 15 + (i % 2 ? 40 : -40)}" stroke="#ffffff" stroke-opacity="0.025" stroke-width="2"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${b}"/><stop offset="1" stop-color="${a}"/></linearGradient>
  <radialGradient id="v" cx="50%" cy="45%" r="75%"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.75"/></radialGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>${lines}
  <rect x="0" y="${h * 0.62}" width="${w}" height="${h * 0.38}" fill="#000" fill-opacity="0.22"/>
  <rect width="100%" height="100%" fill="url(#v)"/>
  <rect x="${w / 2 - 330}" y="${h * 0.16 - 110}" width="660" height="200" rx="6" fill="#000" fill-opacity="0.35" stroke="#d97706" stroke-opacity="0.5" stroke-dasharray="10 8"/>
  <text x="50%" y="${h * 0.16 - 50}" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" letter-spacing="8" fill="#d97706" fill-opacity="0.8">PLACEHOLDER</text>
  <text x="50%" y="${h * 0.16 + 8}" text-anchor="middle" font-family="DejaVu Sans Mono, monospace" font-size="38" fill="#e7e5e4" fill-opacity="0.85">${esc(key)}</text>
  <text x="50%" y="${h * 0.16 + 52}" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="18" fill="#a8a29e">${esc(subtitle)}</text>
</svg>`;
}

function arenaSvg(key: string) {
  const rows = ARENAS[key].rows; const T = 64; const w = rows[0].length * T; const h = rows.length * T;
  const fill: Record<string, string> = { '#': '#2b2a2e', '+': '#6b4423', '/': '#4a3218', 'c': '#4b463e', 'o': '#3a3a3a', 'T': '#20341f', '~': '#2f3324', 'w': '#1d2c3a', 'E': '#1f3a2a' };
  let rects = '';
  rows.forEach((r, y) => [...r].forEach((ch, x) => { rects += `<rect x="${x * T}" y="${y * T}" width="${T}" height="${T}" fill="${fill[ch] ?? '#19181b'}" stroke="#000" stroke-opacity="0.35"/>`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${rects}
  <text x="${w / 2}" y="${h - 14}" text-anchor="middle" font-family="DejaVu Sans Mono, monospace" font-size="16" fill="#a8a29e" fill-opacity="0.6">PLACEHOLDER /assets/arenas/${key}.png — ${w}×${h} (tile 64px)</text></svg>`;
}

function portraitSvg(label: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900">
  <path d="M300 120c80 0 130 62 130 140s-50 150-130 150-130-72-130-150 50-140 130-140zM60 900c0-190 100-330 240-330s240 140 240 330z" fill="#0c0a09" fill-opacity="0.85" stroke="#78716c" stroke-width="4" stroke-dasharray="12 10"/>
  <text x="300" y="760" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="26" fill="#a8a29e">${esc(label)}</text></svg>`;
}

async function writeIfMissing(file: string, svg: string, force: boolean) {
  const full = path.join(CLIENT_PUBLIC_DIR, file);
  if (!force) { try { await fs.access(full); return false; } catch { /* gerar */ } }
  await fs.mkdir(path.dirname(full), { recursive: true });
  const img = sharp(Buffer.from(svg));
  await fs.writeFile(full, await (file.endsWith('.webp') ? img.webp({ quality: 84 }) : img.png({ compressionLevel: 9 })).toBuffer());
  return true;
}

export async function generatePlaceholders(force = false) {
  let n = 0;
  for (const key of SCENE_KEYS) if (await writeIfMissing(`assets/scenes/${key}.webp`, sceneSvg(key, 1920, 1080, `/assets/scenes/${key}.webp · 1920×1080 (16:9)`), force)) n++;
  for (const key of ARENA_KEYS) if (await writeIfMissing(`assets/arenas/${key}.png`, arenaSvg(key), force)) n++;
  if (await writeIfMissing('assets/portraits/default.png', portraitSvg('retrato não enviado'), force)) n++;
  if (await writeIfMissing('assets/portraits/npc_survivor.png', portraitSvg('NPC — placeholder'), force)) n++;
  return n;
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('placeholders.ts')) {
  generatePlaceholders(process.argv.includes('--force')).then((n) => console.log(`${n} placeholder(s) gerado(s) em ${CLIENT_PUBLIC_DIR}/assets`));
}
