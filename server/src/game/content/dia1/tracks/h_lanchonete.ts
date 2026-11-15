/** Ponto de encontro: LANCHONETE DA MABEL (ato 3). Civis da cidade, crianças, a mulher trancada no banheiro e a fuga. */
import type { Track } from '../types.js';

export const H_LANCHONETE: Track = {
  id: 'h_lanchonete', name: 'Lanchonete da Mabel', professions: [], hub: true, opensAt: 44, location: 'rc_restaurant', start: 'hl0',
  beats: [
    { id: 'hl0', act: 3, at: 'rc_restaurant', say: [
      { thread: 'cena', from: 'sistema', text: 'Lanchonete da Mabel. Persianas abaixadas, mesas contra a porta, o cheiro de bacon queimado. Lá fora, a Rua Principal virou outra coisa.', wait: 3 },
    ], next: 'hl1', wait: 90 },
    { id: 'hl1', act: 3, say: [
      { thread: 'cena', from: 'sistema', text: 'As crianças sentam no chão atrás do balcão. Alguém liga a TV: só um aviso de "programação interrompida".', if: { flag: 'com_criancas' }, wait: 5 },
      { thread: 'cena', from: 'sistema', text: 'Do banheiro feminino, batidas fracas e uma voz: "Tem alguém aí? Por favor… eu tô trancada aqui desde de manhã. Eu fiz uma live, ninguém veio."', wait: 6 },
    ], ask: { kind: 'poll', text: 'A mulher trancada no banheiro.', options: [
      { id: 'abrir', label: '🔓 Arrombar a porta e tirar ela', check: { stat: 'strength', base: 45, label: 'Arrombar a porta' }, effects: [{ flag: 'kayla_salva' }, { mark: 'protegeu_estranho', to: 'each' }], failEffects: [{ wound: 'bruise', region: 'right_arm', severity: 0.25, to: 'one' }, { flag: 'kayla_salva' }], next: 'hl1c' },
      { id: 'perguntar', label: '🗣️ "Você foi mordida?" (antes de abrir)', effects: [{ flag: 'perguntou' }], next: 'hl1b' },
    ], timeout: 45 } },
    { id: 'hl1b', act: 3, say: [{ thread: 'cena', from: 'sistema', text: 'Silêncio do outro lado. Depois: "…só um arranhão. Não é nada. Por favor."', wait: 6 }],
      ask: { kind: 'poll', text: 'Ela disse que tem um arranhão.', options: [
        { id: 'abrir', label: '🔓 Abrir mesmo assim', effects: [{ flag: 'kayla_salva' }, { flag: 'kayla_arranhada' }, { mark: 'protegeu_estranho', to: 'each' }], next: 'hl1c' },
        { id: 'deixar', label: '🚪 Deixar a porta fechada', effects: [{ mark: 'deixou_para_tras', to: 'each' }, { stress: 10 }], next: 'hl1c' },
      ], timeout: 40 } },
    { id: 'hl1c', act: 3, say: [
      { thread: 'cena', from: 'sistema', text: 'Batidas na porta dos fundos, ritmadas, humanas. "Abre! Pelo amor de Deus, eu tô com meu filho!" Pelo vão da porta, um homem de terno rasgado com um menino no colo.', wait: 6 },
    ], ask: { kind: 'poll', text: 'O homem na porta dos fundos.', options: [
      { id: 'abrir', label: '🚪 Abrir rápido e fechar de novo', check: { stat: 'agility', base: 45, label: 'Abrir e trancar antes que algo entre' }, effects: [{ mark: 'protegeu_estranho', to: 'each' }, { flag: 'pai_menino' }], failEffects: [{ wound: 'bite', region: 'left_arm', severity: 0.2, to: 'one', infect: 0.4 }, { mark: 'protegeu_estranho', to: 'each' }], next: 'hl2' },
      { id: 'olhar', label: '👀 Olhar bem antes: ele está machucado?', check: { stat: 'perception', base: 45, label: 'Ver no escuro do beco' }, effects: [{ flag: 'pai_menino' }], failEffects: [{ stress: 6 }], next: 'hl2' },
      { id: 'nao', label: '🔒 Não abrir. Lá fora tem barulho demais.', effects: [{ mark: 'deixou_para_tras', to: 'each' }, { stress: 10 }], next: 'hl2' },
    ], timeout: 35 } },
    { id: 'hl2', act: 3, closeHub: true, say: [
      { thread: 'cena', from: 'sistema', text: 'A Kayla sai do banheiro tremendo, com a maquiagem escorrida e o celular sem bateria na mão. Abraça a primeira pessoa que vê.', if: { flag: 'kayla_salva' }, wait: 6 },
      { thread: 'cena', from: 'sistema', text: 'As persianas da frente começam a tremer. Mãos. Muitas mãos.', wait: 6 },
    ], ask: { kind: 'each', text: 'Eles estão na vitrine. Você:', options: [
      { id: 'cozinha', label: '🍳 Pegar comida na cozinha antes de tudo', effects: [{ item: 'canned_beans', to: 'chooser' }, { item: 'water_bottle', to: 'chooser' }], next: 'hl3' },
      { id: 'arma', label: '🔪 Pegar uma faca ou um taco', effects: [{ item: 'kitchen_knife', to: 'chooser' }], next: 'hl3' },
      { id: 'criancas', label: '🧒 Proteger as crianças atrás do balcão', effects: [{ mark: 'protegeu_estranho', to: 'chooser' }, { stress: -3, to: 'chooser' }], next: 'hl3' },
    ], timeout: 30 } },
    { id: 'hl3', act: 3, say: [{ thread: 'cena', from: 'sistema', text: 'O vidro da vitrine estoura.', wait: 3 }],
      combat: { zombies: 3, types: ['walker'], reason: 'A vitrine da Lanchonete da Mabel cede', win: 'hl4', lose: 'hl4l' } },
    { id: 'hl4l', act: 3, say: [{ thread: 'cena', from: 'sistema', text: 'Vocês saem pela porta dos fundos, para o beco, puxando quem dá para puxar.', wait: 4 }], effects: [{ stress: 12 }], next: 'hl4', wait: 2 },
    { id: 'hl4', act: 3, at: 'rc_alley', say: [
      { thread: 'cena', from: 'sistema', text: 'Beco atrás da Rua Principal. Ofegantes. Ninguém fala. Ao longe, o alerta extremo da Defesa Civil tocando em celulares caídos no chão.', wait: 6 },
    ], ask: { kind: 'poll', text: 'O alerta fala em triagem e evacuação na Rodovia 9. Como chegam lá?', options: [
      { id: 'carro', label: '🚚 No veículo que alguém conseguiu', if: { flag: 'tem_carro' }, effects: [{ flag: 'chegou_de_carro' }], next: 'hl5' },
      { id: 'pe', label: '🚶 A pé, pelo esgoto e pelos fundos das casas', check: { stat: 'stealth', base: 45, label: 'Atravessar a cidade sem chamar atenção' }, failEffects: [{ wound: 'scratch', to: 'one', infect: 0.3 }, { stress: 8 }], next: 'hl5' },
      { id: 'onibus', label: '🚌 O ônibus abandonado na Rua Principal', check: { stat: 'mechanics', base: 40, label: 'Fazer o ônibus andar' }, effects: [{ flag: 'chegou_de_carro' }, { mark: 'protegeu_estranho', to: 'each' }], failEffects: [{ stress: 6 }], next: 'hl5' },
    ], timeout: 50 } },
    { id: 'hl5', act: 4, say: [
      { thread: 'cena', from: 'sistema', text: 'Na Rodovia 9, faróis até onde a vista alcança. No fim da fila, holofotes, sacos de areia e soldados.', wait: 15 },
    ], hub: 'h_bloqueio' },
  ],
};
