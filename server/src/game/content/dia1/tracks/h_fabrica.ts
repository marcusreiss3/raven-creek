/** Ponto de encontro: PÁTIO DA ASHCROFT (ato 2). A porta do Projeto Lázaro e os feridos da fábrica. */
import type { Track } from '../types.js';

export const H_FABRICA: Track = {
  id: 'h_fabrica', name: 'Pátio da Ashcroft', professions: [], hub: true, opensAt: 24, location: 'in_gate', start: 'hf0',
  beats: [
    { id: 'hf0', act: 2, at: 'in_gate', say: [
      { thread: 'cena', from: 'sistema', text: 'Pátio da Fábrica Ashcroft. Fumaça preta, alarmes, um caminhão de bombeiro com as portas abertas, gente de macacão branco vagando entre os carros.', wait: 3 },
    ], next: 'hf1', wait: 70 },
    { id: 'hf1', act: 2, closeHub: true, at: 'in_factory_floor', say: [
      { thread: 'cena', from: 'sistema', text: 'No fundo do Setor B, uma porta de aço com o selo amarelo: "PROJETO LÁZARO · BIOSSEGURANÇA NÍVEL 3". Está entreaberta. Algo lá dentro bate contra o metal.', wait: 6 },
    ], ask: { kind: 'secret', target: 'flag:sabe_lazaro', from: 'sistema', thread: 'cena', text: 'Você sabe o que é o Projeto Lázaro. O grupo está olhando para a porta. Você:', options: [
      { id: 'contar', label: 'Contar tudo: vírus, testes em humanos, a contenção falhou', effects: [{ flag: 'lazaro_revelado' }], next: 'hf2' },
      { id: 'calar', label: '"Não faço ideia. Vamos sair daqui."', next: 'hf2' },
    ], timeout: 35 } },
    { id: 'hf2', act: 2, say: [
      { thread: 'cena', from: 'sistema', text: '{escolhido} conta tudo, rápido, sem respirar: um vírus, seis "voluntários", a contenção falhou ontem à noite. O silêncio depois é horrível.', if: { flag: 'lazaro_revelado' }, wait: 7 },
    ], ask: { kind: 'poll', text: 'A porta do Projeto Lázaro.', options: [
      { id: 'selar', label: '🔒 Selar a porta (corrente e cadeado do caminhão)', check: { stat: 'strength', base: 50, label: 'Fechar a porta contra quem empurra' }, effects: [{ flag: 'selou_lazaro' }], failEffects: [{ wound: 'scratch', region: 'right_arm', severity: 0.3, to: 'one', infect: 0.4 }, { flag: 'mordido', to: 'one' }], next: 'hf3' },
      { id: 'olhar', label: '🔦 Olhar lá dentro antes', check: { stat: 'perception', base: 45, light: true, label: 'Ver no escuro sem ser pego' }, effects: [{ mark: 'testemunha', to: 'chooser' }, { item: 'gas_mask', to: 'chooser' }], failEffects: [{ wound: 'bite', region: 'left_hand', severity: 0.3, to: 'one', infect: 0.6 }, { flag: 'mordido', to: 'one' }], next: 'hf3' },
      { id: 'fugir', label: '🏃 Deixar a porta e tirar os feridos dali', next: 'hf3' },
    ], timeout: 45 } },
    { id: 'hf3', act: 3, at: 'in_gate', say: [
      { thread: 'cena', from: 'sistema', text: 'No pátio, cinco funcionários feridos, sentados no meio-fio, esperando ambulância. Nenhuma ambulância vem.', wait: 6 },
    ], ask: { kind: 'poll', text: 'Os feridos da Ashcroft.', options: [
      { id: 'levar', label: '🚒 Levar no caminhão até o Hospital St. Mary', effects: [{ mark: 'protegeu_estranho', to: 'each' }, { flag: 'trouxe_feridos' }], next: 'hf4' },
      { id: 'deixar', label: '⚠️ Eles podem estar infectados. Deixar e ir sozinhos.', effects: [{ mark: 'deixou_para_tras', to: 'each' }], next: 'hf4' },
    ], timeout: 45 } },
    { id: 'hf4', act: 3, say: [{ thread: 'cena', from: 'sistema', text: 'O caminhão atravessa a cidade em direção ao hospital. Pelo vidro, a Rua Principal: carros batidos, portas abertas, gente correndo para todos os lados.', wait: 20 }], hub: 'h_hospital' },
  ],
};
