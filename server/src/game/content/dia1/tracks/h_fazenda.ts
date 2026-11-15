/** Ponto de encontro: FAZENDA MILLER (ato 3). Caçadores e agricultores, o Velho Miller e a caminhonete. */
import type { Track } from '../types.js';

export const H_FAZENDA: Track = {
  id: 'h_fazenda', name: 'Fazenda Miller', professions: [], hub: true, opensAt: 44, location: 'fm_miller_farm', start: 'hz0',
  beats: [
    { id: 'hz0', act: 3, at: 'fm_miller_farm', say: [
      { thread: 'cena', from: 'sistema', text: 'Sede da Fazenda Miller. A varanda, o cachorro velho latindo, a caminhonete com o capô ainda quente. No horizonte, fumaça sobre a cidade.', wait: 3 },
    ], next: 'hz1', wait: 90 },
    { id: 'hz1', act: 3, closeHub: true, say: [
      { thread: 'cena', from: 'sistema', text: 'Quem veio da mata chega com o rifle no ombro. Quem é da fazenda aponta a espingarda. Um segundo longo demais.', wait: 5 },
      { thread: 'cena', from: 'sistema', text: 'O Velho Miller sai da casa: "Abaixa isso, os dois. O Pike me falou de vocês pelo rádio. Hoje ninguém atira em gente viva."', wait: 6 },
    ], ask: { kind: 'poll', text: 'O Miller oferece a casa para passar a noite. Mas a rodovia ainda tem evacuação.', options: [
      { id: 'ficar', label: '🏚️ Ficar e fortificar a fazenda até amanhã', effects: [{ flag: 'ficar_fazenda' }], next: 'hz1b' },
      { id: 'rodovia', label: '🚗 Ir até a rodovia antes que feche', effects: [{ flag: 'ir_rodovia' }], next: 'hz1b' },
    ], timeout: 50 } },
    { id: 'hz1b', act: 3, say: [
      { thread: 'cena', from: 'sistema', text: 'A Martha, mulher do Miller, traz café num bule de alumínio e não pergunta nada. O rádio de ondas curtas chia na cozinha: "…Rodovia 9… triagem… não tragam feridos…"', wait: 6 },
    ], ask: { kind: 'each', text: 'Antes de escurecer, você:', options: [
      { id: 'janelas', label: '🔨 Pregar tábuas nas janelas', check: { stat: 'strength', base: 40, label: 'Pregar firme' }, effects: [{ flag: 'janelas_ok' }], next: 'hz2' },
      { id: 'silo', label: '🔭 Subir no silo para vigiar', check: { stat: 'perception', base: 45, label: 'Ver o que se mexe no pasto' }, effects: [{ flag: 'vigia_silo' }], next: 'hz2' },
      { id: 'radio', label: '📻 Ficar no rádio ouvindo', effects: [{ flag: 'ouviu_radio', to: 'chooser' }, { stress: 4, to: 'chooser' }], next: 'hz2' },
    ], timeout: 35, default: 'radio' } },
    { id: 'hz2', act: 3, say: [
      { thread: 'cena', from: 'sistema', text: 'O Miller senta na varanda e fica olhando a canela enfaixada. "Se eu ficar estranho… vocês sabem o que fazer. Não deixa a minha mulher ver."', if: { flag: 'miller_mordido' }, wait: 7 },
      { thread: 'cena', from: 'sistema', text: 'Do pomar, gemidos. Os infectados que atravessaram o pasto voltaram, e trouxeram outros.', wait: 6 },
    ], combat: { zombies: 3, types: ['walker'], reason: 'Infectados cercam a sede da Fazenda Miller', win: 'hz3', lose: 'hz3l' } },
    { id: 'hz3l', act: 3, say: [{ thread: 'cena', from: 'sistema', text: 'Vocês fogem para o silo e sobem a escada. Lá de cima, veem a casa do Miller ser tomada.', wait: 5 }], effects: [{ stress: 12 }, { flag: 'casa_perdida' }], next: 'hz3', wait: 2 },
    { id: 'hz3', act: 3, if: { flag: 'miller_mordido' }, else: 'hz4', say: [
      { thread: 'cena', from: 'sistema', text: 'O Velho Miller está no chão, imóvel. A sua mulher, na porta, com a mão na boca.', if: { flag: 'miller_mordido' }, wait: 6 },
    ], ask: { kind: 'secret', target: 'one', from: 'sistema', thread: 'cena', text: 'O Miller vai levantar. Todo mundo sabe. A espingarda está do seu lado. Você:', options: [
      { id: 'fazer', label: 'Fazer o que precisa ser feito, longe da mulher dele', effects: [{ mark: 'mao_firme', to: 'chooser' }, { stress: 12, to: 'chooser' }], next: 'hz4' },
      { id: 'nao', label: 'Não consegue. Larga a arma.', effects: [{ mark: 'panico', to: 'chooser' }], next: 'hz4' },
    ], timeout: 35, default: 'nao' } },
    { id: 'hz4', act: 4, say: [
      { thread: 'cena', from: 'sistema', text: 'Quando escurece, vocês decidem: a fazenda não segura uma segunda leva. A caminhonete leva todo mundo pela estrada rural até a Rodovia 9.', wait: 8 },
      { thread: 'cena', from: 'sistema', text: 'No fim da estrada, holofotes e sacos de areia. O posto de controle.', wait: 12 },
    ], hub: 'h_bloqueio' },
  ],
};
