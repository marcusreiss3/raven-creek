import { useState } from 'react';
import { api } from '../lib/api';
import { useGame } from '../lib/store';
import { Img } from '../components/ui';
import { GameIcon } from '../components/GameIcon';

export function AuthScreen({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const r = await api(`/auth/${mode}`, { body: { username, password } });
      useGame.getState().set({ user: r.user });
      onDone();
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };
  return (
    <main className="relative h-full w-full overflow-hidden noise">
      <Img src="/assets/scenes/main_menu.webp" fallback="/assets/scenes/street_city_01.webp" className="absolute inset-0 w-full h-full object-cover opacity-50 scale-105" />
      <div className="absolute inset-0 vignette" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0b0c07]/95 via-[#0b0c07]/55 to-transparent" />
      <div className="relative h-full flex items-center px-[8vw]">
        <div className="w-full max-w-[440px]">
          <span className="tape !text-[16px]">Condado de Raven Creek, dia 1 depois da queda</span>
          {/* O título é o momento da tela: letreiro em estêncil que "pinta" da esquerda para a direita. */}
          <h1 className="anim-stencil mt-4 font-display font-extrabold text-[118px] leading-[0.8] text-ink-100 drop-shadow-[0_4px_0_rgba(0,0,0,.55)]">Raven<br /><span className="text-amber-450">Creek</span></h1>
          <p className="mt-5 text-ink-200 text-[16px] leading-relaxed max-w-[38ch]">Sobreviva com outras pessoas de verdade. Cada ferimento, cada lata de comida e cada escolha fica no mundo.</p>
          <form onSubmit={submit} className="panel panel-plate mt-7 p-5 pl-7 space-y-3" aria-label={mode === 'login' ? 'Entrar' : 'Criar conta'}>
            <div className="flex gap-1 mb-2" role="tablist" aria-label="Escolha">
              {(['login', 'register'] as const).map((m) => (
                <button type="button" role="tab" aria-selected={mode === m} key={m} onClick={() => { setMode(m); setError(''); }}
                  className={`flex-1 min-h-[36px] font-[family-name:var(--font-plate)] font-bold text-[17px] border-b-[3px] ${mode === m ? 'border-amber-450 text-ink-100' : 'border-transparent text-ink-400 hover:text-ink-200'}`}>{m === 'login' ? 'Entrar' : 'Criar conta'}</button>
              ))}
            </div>
            <label className="block"><span className="label">Usuário</span><input className="input mt-1" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required /></label>
            <label className="block"><span className="label">Senha</span><input className="input mt-1" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required /></label>
            {error && <div role="alert" className="text-[14px] text-blood-400 border-l-4 border-blood-500 bg-blood-500/10 px-3 py-2 flex gap-2"><GameIcon name="danger" size={17} className="shrink-0" />{error}</div>}
            <button className="btn btn-moss w-full !min-h-[46px] !text-[18px]" disabled={busy || !username || !password} aria-busy={busy}>{busy ? 'Aguarde…' : mode === 'login' ? 'Entrar no condado' : 'Criar conta'}</button>
            {mode === 'register' && <p className="text-[13px] text-ink-300">Usuário com 3 a 20 caracteres (letras, números e _). Senha com pelo menos 8 caracteres.</p>}
          </form>
          <a href="#/memorial" className="inline-flex items-center gap-1.5 mt-5 min-h-[32px] text-[14px] text-ink-300 hover:text-ink-100 underline decoration-dotted underline-offset-4"><GameIcon name="memorial" size={17} />Memorial dos que se foram</a>
        </div>
      </div>
    </main>
  );
}
