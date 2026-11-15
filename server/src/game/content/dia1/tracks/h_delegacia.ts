/** Ponto de encontro: DELEGACIA (ato 2). O arsenal, o preso da cela, o Sargento Doyle e a escolha de para onde ir. */
import type { Track } from '../types.js';

export const H_DELEGACIA: Track = {
  id: 'h_delegacia', name: 'Delegacia', professions: [], hub: true, opensAt: 22, location: 'rc_police', start: 'hd0',
  beats: [
    { id: 'hd0', act: 2, at: 'rc_police', say: [
      { thread: 'cena', from: 'sistema', text: 'Delegacia de Raven Creek. Lá fora, a cidade começa a gritar. O rádio da recepção chama todas as viaturas. Poucas respondem.', wait: 3 },
    ], next: 'hd1', wait: 70 },
    { id: 'hd1', act: 2, closeHub: true, if: { flag: 'preso_na_cela' }, else: 'hd2', say: [
      { thread: 'cena', from: 'sistema', text: 'Das celas, um barulho ritmado: o homem mordido do posto bate o rosto nas grades. Não para quando chamam o nome dele.', wait: 5 },
    ], ask: { kind: 'poll', text: 'O homem da cela.', options: [
      { id: 'abrir', label: '🔓 Abrir a cela e verificar', effects: [{ flag: 'abriu_cela' }], next: 'hd1c' },
      { id: 'deixar', label: '🔒 Deixar trancado. Ele não sai daí.', effects: [{ stress: 5 }], next: 'hd2' },
    ], timeout: 40 } },
    { id: 'hd1c', act: 2, at: 'rc_police_cells', combat: { zombies: 1, types: ['walker'], reason: 'O preso da cela não é mais um preso', win: 'hd2', lose: 'hd2' } },
    { id: 'hd2', act: 2, at: 'rc_police_armory', say: [
      { thread: 'cena', from: 'sistema', text: 'Arsenal. A chave estava na gaveta do Sargento Doyle. Uma pistola 9mm, um revólver .38, uma espingarda 12, e munição contada.', wait: 5 },
      { thread: 'dm:central', from: 'Central', text: 'Todas as unidades: autorizado o uso de armamento do arsenal. Repito: autorizado.', wait: 6 },
    ], ask: { kind: 'poll', text: 'Como dividir o arsenal?', options: [
      { id: 'dividir', label: '🔫 Uma arma para cada policial', expert: ['police'], effects: [{ mark: 'abriu_arsenal', to: 'chooser' }, { item: 'pistol_9mm', to: 'one' }, { item: 'ammo_9mm', qty: 8, to: 'one' }, { item: 'revolver_38', to: 'one' }, { item: 'ammo_38', qty: 6, to: 'one' }, { item: 'shotgun', to: 'one' }, { item: 'ammo_12g', qty: 4, to: 'one' }], next: 'hd3' },
      { id: 'uma', label: '🎯 Só a pistola, com quem atira melhor. O resto fica trancado.', effects: [{ item: 'pistol_9mm', to: 'one' }, { item: 'ammo_9mm', qty: 10, to: 'one' }, { flag: 'arsenal_trancado' }], next: 'hd3' },
      { id: 'tudo', label: '🧳 Levar tudo, munição inclusa, antes que alguém leve', effects: [{ mark: 'saqueador', to: 'chooser' }, { item: 'shotgun', to: 'chooser' }, { item: 'ammo_12g', qty: 6, to: 'chooser' }, { item: 'pistol_9mm', to: 'one' }, { item: 'ammo_9mm', qty: 6, to: 'one' }], next: 'hd3' },
    ], timeout: 60 } },
    { id: 'hd3', act: 2, at: 'rc_police', say: [
      { thread: 'cena', from: 'sistema', text: 'Pela porta dos fundos, mancando, entra o Sargento Doyle. A perna da calça rasgada, uma mordida funda na panturrilha. "Tô bem. Tô bem. Só me ajuda a sentar."', wait: 6 },
    ], ask: { kind: 'poll', text: 'O Sargento Doyle, mordido.', options: [
      { id: 'cuidar', label: '🩹 Deixar ele entrar e fazer um curativo', effects: [{ flag: 'doyle_dentro' }, { item: 'bandage', to: 'one' }], next: 'hd4' },
      { id: 'fora', label: '🚪 "Sargento… você não pode entrar." Trancar a porta.', effects: [{ mark: 'deixou_para_tras', to: 'each' }, { stress: 12 }], next: 'hd4' },
    ], timeout: 45 } },
    { id: 'hd4', act: 3, say: [
      { thread: 'cena', from: 'sistema', text: 'O Doyle cochila no sofá da recepção. A respiração vai ficando curta. Depois para. Quando os olhos dele abrem de novo, não são os olhos dele.', if: { flag: 'doyle_dentro' }, wait: 6 },
      { thread: 'cena', from: 'sistema', text: 'Do lado de fora, o Doyle bate na porta de vidro por um tempo. Depois só fica parado, olhando para dentro.', if: { notFlag: 'doyle_dentro' }, wait: 6 },
    ], next: 'hd4r', wait: 2 },
    { id: 'hd4r', act: 3, if: { flag: 'doyle_dentro' }, next: 'hd4c', else: 'hd5' },
    { id: 'hd4c', act: 3, combat: { zombies: 1, types: ['brute'], reason: 'O Sargento Doyle levanta do sofá', win: 'hd5', lose: 'hd5' } },
    { id: 'hd5', act: 3, say: [
      { thread: 'dm:central', from: 'Central', text: 'Delegacia, aqui é o Hospital St. Mary pedindo apoio policial urgente. O saguão está sendo invadido.', wait: 5 },
      { thread: 'dm:central', from: 'Central', text: 'Também: civis encurralados na Lanchonete da Mabel, com crianças.', wait: 5 },
      { thread: 'dm:central', from: 'Central', text: 'E o Comando do Fort Ashby avisa: ponto de triagem e evacuação no posto da Rodovia 9, até as 18h.', wait: 6 },
    ], ask: { kind: 'each', split: true, text: 'Para onde VOCÊ vai? (Se escolherem lugares diferentes, o grupo se separa.)', options: [
      { id: 'hospital', label: '🏥 Hospital St. Mary', next: 'hd_hosp' },
      { id: 'lanchonete', label: '🍔 Lanchonete da Mabel (civis e crianças)', next: 'hd_lanch' },
      { id: 'ficar', label: '🛡️ Ficar e defender a delegacia', next: 'hd_fica' },
    ], timeout: 60, default: 'hospital' } },
    { id: 'hd_hosp', act: 3, say: [{ thread: 'cena', from: 'sistema', text: 'Viatura a toda velocidade, contramão, sirene ligada. O hospital aparece no fim da avenida com fumaça saindo de uma janela.', wait: 15 }], hub: 'h_hospital' },
    { id: 'hd_lanch', act: 3, at: 'rc_alley', say: [{ thread: 'cena', from: 'sistema', text: 'A pé, pelo beco atrás da Rua Principal. Arma em punho. Cada sombra é uma pergunta.', wait: 15 }], hub: 'h_lanchonete' },
    { id: 'hd_fica', act: 3, say: [{ thread: 'cena', from: 'sistema', text: 'A delegacia fica sua. Grades nas janelas, uma porta de aço nos fundos, e a frente de vidro.', wait: 5 }],
      ask: { kind: 'poll', text: 'Como fortificar a delegacia?', options: [
        { id: 'vidro', label: '🗄️ Arquivos e mesas contra a porta de vidro', check: { stat: 'strength', base: 50, label: 'Montar a barricada' }, effects: [{ flag: 'delegacia_forte' }], failEffects: [{ stress: 6 }], next: 'hd_f2' },
        { id: 'teto', label: '🪜 Subir para o telhado com o rádio', effects: [{ flag: 'telhado' }, { item: 'radio', to: 'one' }], next: 'hd_f2' },
      ], timeout: 45 } },
    { id: 'hd_f2', act: 3, say: [{ thread: 'cena', from: 'sistema', text: 'Ao entardecer, eles chegam pela frente. Dez, quinze, atraídos pelas luzes da delegacia.', wait: 30 }],
      combat: { zombies: 3, types: ['walker'], reason: 'Infectados cercam a delegacia', win: 'hd_f3', lose: 'hd_f3' } },
    { id: 'hd_f3', act: 3, say: [
      { thread: 'cena', from: 'sistema', text: 'A frente de vidro não aguenta. A delegacia está perdida.', wait: 25 },
      { thread: 'dm:central', from: 'Central', text: '[última transmissão] …todas as unidades… triagem na rodovia… boa sorte…', wait: 30 },
    ], next: 'hd_f4', wait: 30 },
    { id: 'hd_f4', act: 4, say: [{ thread: 'cena', from: 'sistema', text: 'Pelos fundos, até a viatura. Rumo à Rodovia 9, faróis apagados.', wait: 10 }], hub: 'h_bloqueio' },
  ],
};
