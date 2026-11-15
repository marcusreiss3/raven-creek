/** Ponto de encontro: HOSPITAL ST. MARY (ato 3). Triagem, o saguão invadido, a promessa ao Dr. Ellis e a evacuação. */
import type { Track } from '../types.js';

export const H_HOSPITAL: Track = {
  id: 'h_hospital', name: 'Hospital St. Mary', professions: [], hub: true, opensAt: 48, location: 'rc_hospital_lobby', start: 'hh0',
  beats: [
    { id: 'hh0', act: 3, at: 'rc_hospital_lobby', say: [
      { thread: 'cena', from: 'sistema', text: 'Saguão do St. Mary. Macas no corredor, gente sangrando no chão, um segurança tentando fechar a porta automática com as mãos.', wait: 3 },
    ], next: 'hh1', wait: 90 },
    { id: 'hh1', act: 3, say: [
      { thread: 'cena', from: 'sistema', text: 'O caminhão dos bombeiros encosta com os feridos da Ashcroft. Policiais trazem mais feridos. O Dr. Ellis grita ordens que ninguém escuta.', if: { flag: 'trouxe_feridos' }, wait: 5 },
      { thread: 'dm:ellis', from: 'Dr. Ellis', text: 'Quem consegue andar, ajuda! Triagem: mordidos para a ala leste, o resto aqui!', wait: 5 },
    ], ask: { kind: 'each', text: 'O saguão precisa de todo mundo. Você:', options: [
      { id: 'triagem', label: '🩺 Ajudar na triagem dos feridos', check: { stat: 'medicine', base: 35, label: 'Separar quem foi mordido' }, effects: [{ mark: 'protegeu_estranho', to: 'chooser' }], failEffects: [{ wound: 'scratch', region: 'left_hand', severity: 0.25, to: 'chooser', infect: 0.3 }], next: 'hh2' },
      { id: 'portas', label: '🚪 Segurar as portas da entrada', check: { stat: 'strength', base: 45, label: 'Segurar a porta' }, failEffects: [{ wound: 'bruise', region: 'right_arm', severity: 0.3, to: 'chooser' }], next: 'hh2' },
      { id: 'farmacia', label: '💊 Ir até a farmácia interna "buscar suprimentos"', effects: [{ item: 'antibiotics', to: 'chooser' }, { item: 'painkillers', to: 'chooser' }, { mark: 'saqueador', to: 'chooser' }], next: 'hh2' },
    ], timeout: 50 } },
    { id: 'hh2', act: 3, closeHub: true, say: [
      { thread: 'cena', from: 'sistema', text: 'Do fundo do saguão, alguém grita. Um dos feridos da triagem levantou e está em cima do segurança.', wait: 5 },
    ], combat: { zombies: 2, types: ['walker'], reason: 'Feridos se transformam no saguão do St. Mary', win: 'hh3', lose: 'hh3l' } },
    { id: 'hh3l', act: 3, say: [{ thread: 'cena', from: 'sistema', text: 'Vocês recuam para a escada de emergência, puxando quem dá para puxar.', wait: 4 }], effects: [{ stress: 10 }], next: 'hh3', wait: 2 },
    { id: 'hh3', act: 3, say: [
      { thread: 'dm:ellis', from: 'Dr. Ellis', text: 'A ala leste caiu. Eu vou ficar com os pacientes da UTI. Alguém precisa levar quem anda para a triagem da rodovia.', wait: 6 },
    ], ask: { kind: 'secret', target: 'one', from: 'Dr. Ellis', thread: 'dm:ellis', text: 'O Ellis segura seu braço, baixo: "A caixa térmica azul, debaixo do assoalho da minha casa, na Avenida Willow. Antibiótico e morfina. Se eu não sair daqui… usa. Promete?"', options: [
      { id: 'prometer', label: '"Prometo."', effects: [{ flag: 'sabe_caixa_azul', to: 'chooser' }], next: 'hh4' },
      { id: 'ficar', label: '"Eu fico com você, doutor."', effects: [{ mark: 'ultimo_plantao', to: 'chooser' }, { flag: 'sabe_caixa_azul', to: 'chooser' }], next: 'hh4' },
    ], timeout: 35, default: 'prometer' } },
    { id: 'hh4', act: 3, say: [
      { thread: 'cena', from: 'sistema', text: 'Os corredores enchem. Os geradores rosnam. A cada minuto, a porta da ala leste aguenta um pouco menos.', wait: 30 },
    ], ask: { kind: 'poll', text: 'O hospital está caindo.', options: [
      { id: 'evacuar', label: '🚑 Evacuar pela garagem com os pacientes que andam', check: { stat: 'endurance', base: 45, label: 'Tirar todos a tempo' }, effects: [{ mark: 'protegeu_estranho', to: 'each' }, { flag: 'evacuou_hospital' }], failEffects: [{ stress: 10 }, { mark: 'deixou_para_tras', to: 'each' }], next: 'hh5' },
      { id: 'uti', label: '🛏️ Ficar e defender a UTI com o Ellis', effects: [{ mark: 'ultimo_plantao', to: 'each' }, { flag: 'ficou_uti' }], next: 'hh4c' },
      { id: 'fundos', label: '🚪 Sair pelos fundos, só vocês', effects: [{ mark: 'abandonou_plantao', to: 'each' }, { item: 'bandage', qty: 2, to: 'one' }], next: 'hh5' },
    ], timeout: 50 } },
    { id: 'hh4c', act: 3, combat: { zombies: 3, types: ['walker'], reason: 'A UTI do St. Mary é invadida', win: 'hh5', lose: 'hh5' } },
    { id: 'hh5', act: 4, say: [
      { thread: 'cena', from: 'sistema', text: 'O Dr. Ellis fecha a porta da UTI por dentro. Pelo vidro, ele acena. Depois apaga a luz.', if: { flag: 'ficou_uti' }, wait: 7 },
      { thread: 'cena', from: 'sistema', text: 'Ambulâncias e carros saem da garagem em comboio, rumo à Rodovia 9.', if: { flag: 'evacuou_hospital' }, wait: 7 },
      { thread: 'cena', from: 'sistema', text: 'A cidade lá fora já não parece a cidade. Para todos os lados, o mesmo som: gemidos.', wait: 15 },
    ], hub: 'h_bloqueio' },
  ],
};
