/** Crônica do Dia 1: o resumo do que o personagem viveu, com as marcas que ele leva para o resto do jogo. */
import { usePhone } from '../../lib/prologue';
import { Modal } from '../../components/ui';

export function ChronicleModal() {
  const { end, set } = usePhone();
  if (!end) return null;
  const c = end.chronicle;
  const close = () => { set({ end: null }); if (!end.dead) location.reload(); };
  return (
    <div className="fixed inset-0 z-[80]">
      <Modal title={end.dead ? 'O fim do Dia 1' : 'Você sobreviveu ao Dia 1'} onClose={close} width={620} danger={end.dead}>
        <div className="space-y-4">
          <div>
            <div className="font-display font-extrabold text-[30px] leading-none text-ink-100">{c.name}</div>
            <div className={`text-[14px] mt-1 ${end.dead ? 'text-blood-400' : 'text-moss-400'}`}>{end.dead ? 'Não viu a segunda manhã.' : `Termina a noite em ${c.location || 'algum lugar do condado'}.`}</div>
          </div>
          {c.marks.length > 0 && (
            <div>
              <div className="label mb-1.5">Marcas que ficam</div>
              <div className="space-y-1.5">{c.marks.map((m) => <div key={m.id} className="border-l-4 border-tape bg-black/25 px-3 py-1.5"><b className="text-ink-100 text-[14.5px]">{m.name}</b><div className="text-[13.5px] text-ink-300 italic">{m.text}</div></div>)}</div>
            </div>
          )}
          <div>
            <div className="label mb-1.5">Crônica</div>
            <ol className="max-h-[38vh] overflow-y-auto pr-1 space-y-1.5 text-[14px] text-ink-200 leading-snug list-none">{c.lines.map((l, i) => <li key={i} className="border-l-2 border-ink-700 pl-2.5">{l}</li>)}</ol>
          </div>
          <p className="text-[13px] text-ink-400">A crônica fica guardada no diário do personagem.</p>
          <button className="btn btn-moss w-full justify-center !min-h-[48px] !text-[17px]" onClick={close}>{end.dead ? 'Fechar' : 'Começar a sobreviver'}</button>
        </div>
      </Modal>
    </div>
  );
}
