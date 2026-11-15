/**
 * Ponto de encontro FINAL: o POSTO DE CONTROLE da Rodovia 9 (ato 4). Quase todo mundo chega aqui.
 * Triagem (quem foi mordido esconde ou mostra), ordens dos militares e, às 18h, a notícia de que não há ônibus.
 * Cada um escolhe o seu caminho para a primeira noite (ato 5). A partir daqui a morte é possível.
 */
import type { Track } from '../types.js';
import { FINAIS } from './h_bloqueio_fins.js';

export const H_BLOQUEIO: Track = {
  id: 'h_bloqueio', name: 'Posto de Controle', professions: [], hub: true, opensAt: 86, location: 'mil_checkpoint', start: 'hb0',
  beats: [
    { id: 'hb0', act: 4, at: 'mil_checkpoint', say: [
      { thread: 'cena', from: 'sistema', text: 'Posto de Controle da Rodovia 9. Sacos de areia, arame farpado, dois blindados, holofotes cortando a fumaça. Do lado de cá, centenas de pessoas e uma fila de carros parada há horas.', wait: 3 },
      { thread: 'cena', from: 'sistema', text: 'Gente chega de todos os lados: de viatura, de caminhão de bombeiro, a pé, com crianças no colo. Rostos que vocês viram de manhã, na vida normal.', wait: 8 },
    ], next: 'hb1', wait: 110 },
    { id: 'hb1', act: 4, say: [
      { thread: 'cena', from: 'sistema', text: 'O Sargento Hollis sobe num blindado com um megafone: "FILA ÚNICA! FERIDOS À ESQUERDA! QUEM TIVER ARMA, ENTREGA NA MESA! NINGUÉM PASSA SEM TRIAGEM!"', wait: 5 },
    ], ask: { kind: 'poll', text: 'Os militares querem as armas de todo mundo.', options: [
      { id: 'entregar', label: '🗃️ Entregar: quem sabe assim a fila anda', effects: [{ flag: 'entregou_armas' }, { stress: 4 }], next: 'hb2' },
      { id: 'esconder', label: '🧥 Esconder as armas na roupa e nos carros', check: { stat: 'stealth', base: 50, label: 'Esconder sem ser revistado' }, effects: [{ flag: 'armas_escondidas' }], failEffects: [{ flag: 'pego_armado' }, { stress: 8 }], next: 'hb2' },
      { id: 'recusar', label: '✋ Recusar em voz alta ("ninguém desarma a gente hoje")', effects: [{ flag: 'tensao' }, { stress: 6 }], next: 'hb2' },
    ], timeout: 60 } },
    { id: 'hb2', act: 4, say: [
      { thread: 'cena', from: 'sistema', text: 'Um soldado aponta o fuzil para o grupo enquanto outro revista. A multidão assiste, calada.', if: { flag: 'pego_armado' }, wait: 5 },
      { thread: 'cena', from: 'sistema', text: 'O Hollis desce do blindado e para na frente de vocês. "Repete isso, civil." A mão dele está no coldre.', if: { flag: 'tensao' }, wait: 5 },
      { thread: 'cena', from: 'sistema', text: 'A triagem: um médico do exército, de máscara, mandando arregaçar as mangas. Quem tem mordida vai para uma tenda separada. Ninguém sai da tenda.', wait: 6 },
    ], ask: { kind: 'secret', target: 'flag:mordido', from: 'sistema', thread: 'cena', text: 'Você foi mordido(a) hoje. Na triagem, vão ver seu braço. Você:', options: [
      { id: 'esconder', label: 'Esconder: manga comprida, sorriso, "só um arranhão de gato"', check: { stat: 'perception', base: 50, label: 'Enganar o médico do exército' }, effects: [{ mark: 'mentiu_bloqueio', to: 'chooser' }, { mark: 'escondeu_mordida', to: 'chooser' }], failEffects: [{ flag: 'retido', to: 'chooser' }, { flag: 'alguem_retido' }, { stress: 15, to: 'chooser' }], next: 'hb2m' },
      { id: 'mostrar', label: 'Mostrar e pedir ajuda', effects: [{ flag: 'retido', to: 'chooser' }, { flag: 'alguem_retido' }, { stress: 6, to: 'chooser' }], next: 'hb2m' },
    ], timeout: 40, default: 'esconder' } },
    { id: 'hb2m', act: 4, say: [
      { thread: 'cena', from: 'sistema', text: 'Dois soldados levam {escolhido} para a tenda dos retidos. Ninguém do grupo consegue impedir.', if: { flag: 'alguem_retido', notFlag: 'self:retido' }, wait: 5 },
      { thread: 'cena', from: 'sistema', text: 'Dois soldados seguram seus braços e te levam para a tenda dos retidos. Lá dentro, gente tossindo no escuro.', if: { flag: 'self:retido' }, wait: 5 },
    ], ask: { kind: 'secret', target: 'prof:soldier', from: 'Sgt. Hollis', thread: 'dm:hollis', text: '"Soldado. A tenda dos retidos não vai ser aberta. Se algum deles virar, ou correr, você atira. Entendido?"', options: [
      { id: 'sim', label: '"Entendido, Sargento."', effects: [{ mark: 'cumpriu_ordens', to: 'chooser' }], next: 'hb3' },
      { id: 'sabotar', label: 'Concordar, e soltar os retidos quando ele virar as costas', check: { stat: 'stealth', base: 45, label: 'Abrir a tenda sem ser visto' }, effects: [{ mark: 'protegeu_estranho', to: 'chooser' }, { flag: 'tenda_aberta' }], failEffects: [{ mark: 'desertor', to: 'chooser' }, { flag: 'pego_sabotando' }], next: 'hb3' },
    ], timeout: 40, default: 'sim' } },
    { id: 'hb3', act: 4, closeHub: true, say: [
      { thread: 'cena', from: 'sistema', text: 'Alguém abriu a tenda dos retidos. Gente sai correndo pelo acostamento, no escuro.', if: { flag: 'tenda_aberta' }, wait: 5 },
      { thread: 'cena', from: 'sistema', text: '18:00 · O rádio do Hollis chia. Ele escuta, fecha os olhos e pega o megafone devagar.', wait: 6 },
      { thread: 'cena', from: 'sistema', text: '"O FORT ASHBY FECHOU OS PORTÕES. NÃO VAI TER ÔNIBUS HOJE. REPITO: NÃO VAI TER ÔNIBUS." Por um segundo, silêncio total. Depois a multidão explode.', wait: 7 },
      { thread: 'cena', from: 'sistema', text: 'Um tiro. Outro. Gente correndo para todo lado. E da direção da cidade, um som que vocês aprenderam a reconhecer hoje: gemidos, muitos.', wait: 6 },
    ], ask: { kind: 'each', split: true, text: 'É agora. Para onde VOCÊ vai? (O grupo pode se separar aqui.)', options: [
      { id: 'onibus', label: '🚌 Ficar na fila, perto dos blindados, e rezar', next: 'fo1' },
      { id: 'furar', label: '🏃 Furar a barreira pela vala, no escuro', check: { stat: 'agility', base: 45, label: 'Passar pelo arame sem ser visto' }, failEffects: [{ death: 'Baleado tentando furar a barreira da Rodovia 9', to: 'chooser' }], next: 'ff1' },
      { id: 'igreja', label: '⛪ Voltar para a cidade: a Igreja de São Jorge tem portas grossas', next: 'fi1' },
      { id: 'floresta', label: '🌲 Sumir pela estrada de terra rumo à mata de Blackpine', next: 'fm1' },
      { id: 'posto', label: '🪖 Ficar do lado dos militares, segurando a barreira', next: 'fp1' },
    ], timeout: 70, default: 'onibus' } },
    ...FINAIS,
  ],
};
