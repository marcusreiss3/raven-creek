import { useEffect, useState } from 'react';
import { api, portraitUrl } from '../lib/api';
import { Img } from '../components/ui';
import { GameIcon } from '../components/GameIcon';

export function Memorial() {
  const [dead, setDead] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/memorial').then((r) => setDead(r.dead)).catch((e) => setError(e.message)); }, []);
  return (
    <main className="h-full overflow-y-auto noise relative">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <a href="#/" className="inline-flex items-center gap-1.5 min-h-[32px] text-[14px] text-ink-300 hover:text-ink-100"><GameIcon name="exit" size={16} />Voltar à entrada</a>
        <h1 className="anim-stencil font-display font-extrabold text-[64px] leading-none mt-4 flex items-center gap-4"><GameIcon name="memorial" size={52} className="text-ink-400" />Memorial</h1>
        <p className="text-ink-300 text-[16px] mt-2">Os que não sobreviveram ao condado de Raven Creek.</p>
        {!dead && !error && <p role="status" className="mt-8 text-ink-400">Lendo os nomes…</p>}
        {error && <p role="alert" className="mt-8 text-blood-400">Não deu para carregar o memorial: {error}</p>}
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-5 mt-8">
          {dead?.map((d) => (
            <li key={d.id} className="panel p-4 flex gap-3">
              <div className="w-20 h-28 bg-[#101109] border border-black overflow-hidden shrink-0 flex items-end justify-center"><Img src={portraitUrl(d.portrait)} fallback="/assets/portraits/default.png" alt="" className="max-h-full object-contain grayscale opacity-80" /></div>
              <div className="min-w-0">
                <h2 className="font-display font-extrabold text-[24px] leading-none">{d.firstName} {d.lastName}</h2>
                <div className="text-[13px] text-ink-300 mt-1">{d.profession}</div>
                <div className="text-[13.5px] text-blood-400 mt-1">{d.cause}</div>
                <div className="text-[12.5px] text-ink-400 mt-1">Sobreviveu {d.survivedHours} h{d.diedAt ? `, morreu em ${new Date(d.diedAt).toLocaleDateString('pt-BR')}` : ''}</div>
                {d.epitaph && <p className="font-[family-name:var(--font-hand)] text-[16px] text-tape mt-2 leading-snug">“{d.epitaph}”</p>}
              </div>
            </li>
          ))}
          {dead && !dead.length && <li className="col-span-full text-ink-400 text-[15px]">Ninguém morreu. Ainda.</li>}
        </ul>
      </div>
    </main>
  );
}
