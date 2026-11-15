/**
 * Gerenciador de áudio: música por categoria com transição suave (crossfade) e efeitos.
 * Arquivos esperados em /assets/audio/music/<chave>.ogg e /assets/audio/sfx/<chave>.ogg (ver docs/AUDIO.md).
 * Se o arquivo não existir, falha silenciosamente. Respeita o bloqueio de autoplay: só toca após o primeiro gesto do usuário.
 */
type Settings = { musicVolume: number; sfxVolume: number; muted: boolean };
const KEY = 'rc_audio';
const missing = new Set<string>();

class AudioManager {
  settings: Settings = { musicVolume: 0.5, sfxVolume: 0.7, muted: false };
  private current: HTMLAudioElement | null = null;
  private currentKey = '';
  private wanted = '';
  private amb: HTMLAudioElement | null = null;
  private ambKey = '';
  private ambGain = 1;
  private wantedAmb: { key: string; gain: number } | null = null;
  private unlocked = false;
  private listeners = new Set<() => void>();

  constructor() {
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem(KEY) ?? '{}')); } catch { /* preferências locais indisponíveis */ }
    const unlock = () => { this.unlocked = true; if (this.wanted) this.music(this.wanted); if (this.wantedAmb) this.ambient(this.wantedAmb.key, this.wantedAmb.gain); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
  }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  update(p: Partial<Settings>) {
    Object.assign(this.settings, p);
    try { localStorage.setItem(KEY, JSON.stringify(this.settings)); } catch { /* ignora */ }
    if (this.current) this.current.volume = this.settings.muted ? 0 : this.settings.musicVolume;
    if (this.amb) this.amb.volume = this.ambVolume();
    this.listeners.forEach((l) => l());
  }
  music(key: string) {
    this.wanted = key;
    if (!this.unlocked || key === this.currentKey) return;
    const src = `/assets/audio/music/${key}.ogg`;
    if (missing.has(src)) { this.fadeOut(); this.currentKey = key; return; }
    const next = new Audio(src); next.loop = true; next.volume = 0;
    next.addEventListener('error', () => { missing.add(src); });
    const prev = this.current; this.current = next; this.currentKey = key;
    next.play().then(() => this.fade(next, this.settings.muted ? 0 : this.settings.musicVolume)).catch(() => undefined);
    if (prev) this.fade(prev, 0, () => prev.pause());
  }
  private ambVolume() { return this.settings.muted ? 0 : Math.min(1, this.settings.sfxVolume * this.ambGain); }
  /** Som ambiente em loop (chuva, vento…), no volume dos efeitos. null desliga com fade. */
  ambient(key: string | null, gain = 0.5) {
    this.wantedAmb = key ? { key, gain } : null;
    if (!this.unlocked) return;
    if (key && key === this.ambKey && this.amb) { this.ambGain = gain; this.fade(this.amb, this.ambVolume()); return; }
    const prev = this.amb; this.amb = null; this.ambKey = key ?? '';
    if (prev) this.fade(prev, 0, () => prev.pause());
    if (!key) return;
    const src = `/assets/audio/sfx/${key}.ogg`;
    if (missing.has(src)) return;
    const a = new Audio(src); a.loop = true; a.volume = 0;
    a.addEventListener('error', () => missing.add(src));
    this.amb = a; this.ambGain = gain;
    a.play().then(() => { if (this.amb === a) this.fade(a, this.ambVolume()); }).catch(() => undefined);
  }
  private fadeOut() { const p = this.current; if (p) this.fade(p, 0, () => p.pause()); this.current = null; }
  private fade(el: HTMLAudioElement, to: number, done?: () => void) {
    const from = el.volume; const t0 = performance.now(); const dur = 1800;
    const step = (t: number) => { const k = Math.max(0, Math.min(1, (t - t0) / dur)); el.volume = Math.max(0, Math.min(1, from + (to - from) * k)); if (k < 1) requestAnimationFrame(step); else done?.(); };
    requestAnimationFrame(step);
  }
  sfx(key: string, gain = 1) {
    if (!this.unlocked || this.settings.muted) return;
    const src = `/assets/audio/sfx/${key}.ogg`;
    if (missing.has(src)) return;
    const a = new Audio(src); a.volume = Math.min(1, this.settings.sfxVolume * gain);
    a.addEventListener('error', () => missing.add(src));
    a.play().catch(() => undefined);
  }
}
export const audio = new AudioManager();
