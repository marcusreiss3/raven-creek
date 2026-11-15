import { useGame } from '../lib/store';
import { action } from '../lib/socket';

/** Tutorial gradual: uma dica por vez, avançando conforme o jogador. O progresso fica salvo no servidor. */
const STEPS = [
  { title: 'Bem-vindo a Raven Creek', text: 'Esta é a sua cena. Outros sobreviventes conectados aparecem aqui em tempo real. Clique num personagem para interagir.' },
  { title: 'Converse', text: 'A conversa é local: só quem está neste lugar lê. Use /me para ações ("/me acende uma lanterna"), **negrito** para destacar e Ctrl+Enter para quebrar linha.' },
  { title: 'Vasculhe com cuidado', text: 'Vasculhar gasta energia de exploração e faz barulho, e infectados podem aparecer. Os locais se esgotam e se recuperam devagar.' },
  { title: 'Viaje de verdade', text: 'As saídas levam a outros locais. Viagens levam tempo real e continuam mesmo se você fechar o navegador. Siga alguém para viajar em grupo.' },
  { title: 'Cuide do corpo', text: 'Ferimentos sangram, infeccionam e afetam o que você consegue fazer. Abra a ficha médica para tratar cada região.' },
  { title: 'Combate tático', text: 'Confrontos acontecem num tabuleiro. Mova-se, ataque, empurre, feche portas ou corra até uma saída. Fugir é uma escolha válida.' },
];

export function Tutorial() {
  const self = useGame((s) => s.self);
  if (!self || self.tutorialStep >= STEPS.length || self.state === 'combat') return null;
  const s = STEPS[self.tutorialStep];
  const go = (step: number) => action('tutorial', { step }, { silent: true }).then(() => useGame.setState({ self: { ...useGame.getState().self!, tutorialStep: step } }));
  return (
    <aside aria-label="Dica do tutorial" className="absolute right-4 top-6 z-20 w-80 max-sm:left-3 max-sm:right-3 max-sm:top-auto max-sm:bottom-3 max-sm:w-auto paper-note !p-4 !pt-5 anim-rise rotate-[0.6deg]" key={self.tutorialStep}>
      <div className="text-[13px] text-[#5a4a2a] font-sans">Dica {self.tutorialStep + 1} de {STEPS.length}</div>
      <h2 className="font-[family-name:var(--font-hand)] font-bold text-[22px] leading-tight text-[#1d1912] mt-0.5">{s.title}</h2>
      <p className="font-sans text-[14.5px] text-[#2a251d] mt-1 leading-relaxed">{s.text}</p>
      <div className="flex justify-between items-center mt-3">
        <button className="font-sans text-[13.5px] min-h-[32px] text-[#4a4237] underline decoration-dotted underline-offset-2 hover:text-black" onClick={() => go(STEPS.length)}>Pular tutorial</button>
        <button className="btn btn-moss !py-1" onClick={() => go(self.tutorialStep + 1)}>{self.tutorialStep + 1 === STEPS.length ? 'Entendi' : 'Próxima dica'}</button>
      </div>
    </aside>
  );
}
