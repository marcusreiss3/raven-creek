/** Trilha civil, parte C: CAÇADOR (Cabana de Caça, Blackpine) e AGRICULTOR (Fazenda Miller). Encontram-se na fazenda. */
import type { Beat } from '../types.js';

export const CIVIL_C: Beat[] = [
  // ───────────── CAÇADOR · Blackpine
  { id: 'cac1', act: 1, at: 'fo_hunting_cabin', say: [
    { thread: 'cena', from: 'sistema', text: '06:40 · Cabana de Caça, Mata de Blackpine. Neblina baixa, café na lata, o rifle limpo em cima da mesa. Temporada de cervo abriu sábado.', wait: 3 },
    { thread: 'dm:guarda', from: 'Guarda Florestal Pike', text: 'Bom dia. Cuidado hoje: a fauna tá esquisita. Os cervos estão descendo pro lado da rodovia em bando. Nunca vi isso.' },
  ], ask: { kind: 'each', text: 'Começo do dia na mata:', options: [
    { id: 'rastro', label: '🦌 Seguir os rastros dos cervos', check: { stat: 'survival', base: 50, label: 'Ler os rastros' }, effects: [{ flag: 'leu_rastros', to: 'chooser' }], next: 'cac1b' },
    { id: 'espera', label: '🪵 Esperar na torre de espera', effects: [{ flag: 'torre', to: 'chooser' }], next: 'cac1b' },
    { id: 'armadilha', label: '🪤 Conferir as armadilhas', effects: [{ flag: 'armadilhas', to: 'chooser' }], next: 'cac1b' },
  ], timeout: 60 } },
  { id: 'cac1b', act: 1, say: [
    { thread: 'cena', from: 'sistema', text: 'Um cervo enorme, dez pontas, atravessa a clareira devagar. Mas ele manca: a pata traseira está aberta, carne pendurada, como se algo tivesse mordido. E ele não parece sentir.', wait: 6 },
  ], ask: { kind: 'poll', text: 'O cervo ferido na clareira.', options: [
    { id: 'abater', label: '🎯 Abater (ele está sofrendo)', check: { stat: 'rifle', base: 50, label: 'Tiro limpo' }, effects: [{ flag: 'abateu_cervo' }, { stress: -2 }], failEffects: [{ stress: 5 }], next: 'cac2' },
    { id: 'observar', label: '🔭 Observar pelo binóculo', check: { stat: 'perception', base: 45, label: 'Notar o detalhe' }, effects: [{ flag: 'viu_olhos', to: 'each' }, { stress: 4 }], next: 'cac2' },
    { id: 'deixar', label: '🌲 Deixar ir. Não é problema seu.', next: 'cac2' },
  ], timeout: 40 } },
  { id: 'cac2', act: 1, say: [
    { thread: 'cena', from: 'sistema', text: 'Os rastros não são de caça: são de fuga. Os cervos correram em linha reta, quebrando galhos, para longe do leste. Para longe da cidade.', if: { flag: 'self:leu_rastros' }, wait: 6 },
    { thread: 'cena', from: 'sistema', text: 'Da torre, você vê um vulto entre os pinheiros, andando sem rumo. Uma mochila de trilha nas costas, um pé descalço.', if: { flag: 'self:torre' }, wait: 6 },
    { thread: 'cena', from: 'sistema', text: 'Numa armadilha, um coiote. Morto, com o pescoço aberto. Não foi a armadilha.', if: { flag: 'self:armadilhas' }, wait: 6 },
    { thread: 'cena', from: 'sistema', text: 'Na trilha, um homem de mochila vem na sua direção. "Ei! Ei, amigo! Tudo bem?" Ele não responde. Tem sangue seco na camisa toda.', wait: 7 },
  ], ask: { kind: 'poll', text: 'O trilheiro está a trinta metros, vindo devagar.', options: [
    { id: 'aviso', label: '🗣️ Gritar um aviso e mirar no chão perto dele', check: { stat: 'rifle', base: 45, label: 'Tiro de advertência sem acertar' }, effects: [{ flag: 'advertiu' }], failEffects: [{ mark: 'atirou_civil', to: 'one' }, { stress: 10 }], next: 'cac3' },
    { id: 'mirar', label: '🎯 Mirar na cabeça e esperar', expert: ['hunter'], effects: [{ flag: 'mirou' }], next: 'cac3' },
    { id: 'recuar', label: '🌲 Sumir entre as árvores sem ser visto', check: { stat: 'stealth', base: 50, label: 'Não fazer barulho' }, effects: [{ flag: 'sumiu' }], failEffects: [{ flag: 'visto' }], next: 'cac3' },
  ], timeout: 35 } },
  { id: 'cac3', act: 2, say: [
    { thread: 'cena', from: 'sistema', text: 'O tiro levanta terra a um metro dele. Ele nem pisca. Continua vindo.', if: { flag: 'advertiu' }, wait: 5 },
    { thread: 'cena', from: 'sistema', text: 'Pela luneta, de perto: os olhos são brancos, a mandíbula pendurada. Isso não é uma pessoa doente.', if: { flag: 'mirou' }, wait: 5 },
    { thread: 'cena', from: 'sistema', text: 'Um galho estala debaixo da sua bota. Ele vira a cabeça, devagar, e acelera.', if: { flag: 'visto' }, wait: 5 },
  ], effects: [{ mark: 'primeiro_morto', to: 'each' }], next: 'cac3r', wait: 2 },
  { id: 'cac3r', act: 2, if: { flag: 'sumiu' }, next: 'cac4', else: 'cac3c' },
  { id: 'cac3c', act: 2, combat: { zombies: 1, types: ['walker'], reason: 'O trilheiro de Blackpine', win: 'cac4', lose: 'cac4l' } },
  { id: 'cac4l', act: 2, say: [{ thread: 'cena', from: 'sistema', text: 'Você rola barranco abaixo e corre até o pulmão queimar. Ele fica lá em cima, tentando descer.', wait: 4 }], effects: [{ stress: 10 }], next: 'cac4', wait: 2 },
  { id: 'cac4', act: 2, at: 'fo_ranger_station', say: [
    { thread: 'cena', from: 'sistema', text: 'Posto da Guarda Florestal. A porta está aberta, o rádio ligado chamando sem resposta. Na mesa do Pike, um mapa da região riscado de vermelho em volta da cidade.', wait: 6 },
    { thread: 'dm:guarda', from: 'Guarda Florestal Pike', text: '[mensagem de voz] …se você tá ouvindo isso, não desce pra cidade. Vai pra fazenda do Miller, ele tem caminhão e gasolina. Eu… [respiração pesada]', wait: 8 },
  ], ask: { kind: 'poll', text: 'O posto da guarda tem equipamento. Vocês pegam:', options: [
    { id: 'radio', label: '📻 O rádio portátil do Pike', effects: [{ item: 'radio', to: 'one' }], next: 'cac4b' },
    { id: 'kit', label: '⛺ Kit de sobrevivência e corda', effects: [{ item: 'first_aid_kit', to: 'one' }, { item: 'rope', to: 'one' }], next: 'cac4b' },
    { id: 'mapa', label: '🗺️ O mapa riscado e a lanterna', effects: [{ item: 'map_county', to: 'one' }, { item: 'flashlight', to: 'one' }], next: 'cac4b' },
  ], timeout: 45 } },
  { id: 'cac4b', act: 2, at: 'fo_campsite', say: [
    { thread: 'cena', from: 'sistema', text: 'No Acampamento do Lago, um trailer com a porta aberta. Uma família de turistas de Ohio: o pai sentado no degrau, sangrando do pescoço, a mãe gritando com o rádio. Duas crianças dentro do carro.', wait: 6 },
  ], ask: { kind: 'poll', text: 'Os campistas.', options: [
    { id: 'levar', label: '🚙 Levar a mãe e as crianças com vocês', effects: [{ mark: 'protegeu_estranho', to: 'each' }, { flag: 'com_campistas' }, { stress: 4 }], next: 'cac4c' },
    { id: 'avisar', label: '🗣️ "Saiam daqui agora, pela estrada do norte."', effects: [{ stress: 3 }], next: 'cac4c' },
    { id: 'pai', label: '⚠️ "Ele foi mordido. Não fiquem perto dele."', check: { stat: 'intellect', base: 50, label: 'Convencer uma mãe em pânico' }, effects: [{ mark: 'protegeu_estranho', to: 'chooser' }], failEffects: [{ stress: 8 }], next: 'cac4c' },
  ], timeout: 40 } },
  { id: 'cac4c', act: 2, say: [
    { thread: 'cena', from: 'sistema', text: 'O pai para de tossir. Fica parado um tempo, de cabeça baixa. Depois levanta.', wait: 4 },
  ], combat: { zombies: 1, types: ['walker'], reason: 'O campista de Ohio', win: 'cac5', lose: 'cac4d' } },
  { id: 'cac4d', act: 2, say: [{ thread: 'cena', from: 'sistema', text: 'Vocês correm pela trilha, arranhados de galho e de unha, sem olhar para trás.', wait: 4 }], effects: [{ stress: 8 }], next: 'cac5', wait: 2 },
  { id: 'cac5', act: 2, say: [{ thread: 'cena', from: 'sistema', text: 'Pela Trilha dos Pinheiros e depois a estrada rural, rumo à Fazenda Miller. A mata está quieta demais: nem um passarinho.', wait: 25 }], next: 'civ_rural', wait: 5 },

  // ───────────── AGRICULTOR · Fazenda Miller
  { id: 'agr1', act: 1, at: 'fm_miller_farm', say: [
    { thread: 'cena', from: 'sistema', text: '06:30 · Fazenda Miller. As vacas não deixaram ninguém dormir: berraram a madrugada inteira, encostadas na cerca do lado da rodovia.', wait: 3 },
    { thread: 'dm:miller', from: 'Velho Miller', text: 'Bom dia. Cuida da ordenha que eu vou ver a cerca do pasto norte. Tem alguma coisa assustando o gado.' },
  ], ask: { kind: 'each', text: 'Na fazenda:', options: [
    { id: 'ordenha', label: '🐄 Fazer a ordenha', effects: [{ stress: -3, to: 'chooser' }], next: 'agr1b' },
    { id: 'cerca', label: '🚜 Ir com o Miller até a cerca', effects: [{ flag: 'foi_cerca', to: 'chooser' }], next: 'agr1b' },
  ], timeout: 50 } },
  { id: 'agr1b', act: 1, say: [
    { thread: 'cena', from: 'sistema', text: 'O Bob, o cachorro da fazenda, rosna para o pasto norte com o pelo arrepiado. Ele nunca rosna. As vacas estão todas amontoadas no canto oposto da cerca.', wait: 5 },
  ], ask: { kind: 'poll', text: 'O Bob não para de rosnar.', options: [
    { id: 'binoculo', label: '🔭 Pegar o binóculo do Miller', check: { stat: 'perception', base: 45, label: 'Ver o que tem no pasto' }, effects: [{ flag: 'viu_vulto' }], next: 'agr2' },
    { id: 'soltar', label: '🐕 Soltar o Bob', effects: [{ flag: 'bob_solto' }], next: 'agr2' },
    { id: 'ignorar', label: '☕ "Deve ser coiote." Voltar ao serviço.', effects: [{ stress: -2 }], next: 'agr2' },
  ], timeout: 40 } },
  { id: 'agr2', act: 1, say: [
    { thread: 'cena', from: 'sistema', text: 'Na cerca norte, uma vaca caída com a barriga aberta. Em volta, três pessoas de joelhos, comendo. Elas levantam a cabeça ao mesmo tempo.', if: { flag: 'self:foi_cerca' }, wait: 6 },
    { thread: 'dm:miller', from: 'Velho Miller', text: 'CORRE PRA CASA. PEGA A ESPINGARDA NO ARMÁRIO.', wait: 6 },
  ], ask: { kind: 'poll', text: 'O Velho Miller está gritando do pasto.', options: [
    { id: 'espingarda', label: '🔫 Correr para a casa e pegar a espingarda', check: { stat: 'athletics', base: 50, label: 'Chegar a tempo' }, effects: [{ item: 'shotgun', to: 'one' }, { item: 'ammo_12g', qty: 4, to: 'one' }], failEffects: [{ stress: 8 }], next: 'agr3' },
    { id: 'trator', label: '🚜 Ir de trator buscar o Miller', check: { stat: 'agility', base: 45, label: 'Manobrar o trator no pasto' }, effects: [{ flag: 'salvou_miller' }, { mark: 'protegeu_estranho', to: 'each' }], failEffects: [{ flag: 'miller_mordido' }], next: 'agr3' },
  ], timeout: 30 } },
  { id: 'agr3', act: 2, say: [
    { thread: 'cena', from: 'sistema', text: 'O Miller sobe no trator no último segundo, ofegante. "Trinta anos de fazenda e eu nunca vi bicho fazer isso. Aquilo não é bicho."', if: { flag: 'salvou_miller' }, wait: 6 },
    { thread: 'cena', from: 'sistema', text: 'O Miller chega mancando, com a canela mordida. "Não é nada. Não é nada."', if: { flag: 'miller_mordido' }, wait: 6 },
  ], effects: [{ mark: 'primeiro_morto', to: 'each' }],
    combat: { zombies: 2, types: ['walker'], reason: 'Infectados atravessam o pasto até a casa da Fazenda Miller', win: 'agr4', lose: 'agr4l' } },
  { id: 'agr4l', act: 2, say: [{ thread: 'cena', from: 'sistema', text: 'Vocês se trancam no celeiro. Do lado de fora, as vacas gritam. Depois param.', wait: 5 }], effects: [{ stress: 12 }], next: 'agr4', wait: 2 },
  { id: 'agr4', act: 2, at: 'fm_miller_barn', say: [
    { thread: 'cena', from: 'sistema', text: 'Celeiro. A caminhonete do Miller, dois galões de diesel, sementes, ferramentas e o estoque de comida do inverno.', wait: 5 },
  ], ask: { kind: 'poll', text: 'O que vocês carregam?', options: [
    { id: 'comida', label: '🥫 Comida do inverno', effects: [{ item: 'canned_beans', qty: 2, to: 'each' }], next: 'agr5' },
    { id: 'ferramentas', label: '🪓 Machadinha e pá', effects: [{ item: 'hatchet', to: 'one' }, { item: 'shovel', to: 'one' }], next: 'agr5' },
    { id: 'diesel', label: '⛽ Encher a caminhonete', effects: [{ flag: 'tem_carro' }, { item: 'car_keys', to: 'one' }], next: 'agr5' },
  ], timeout: 45 } },
  { id: 'agr5', act: 2, say: [{ thread: 'cena', from: 'sistema', text: 'Do alto da caixa d\'água, dá para ver: fumaça na cidade, uma fila de faróis parada na Rodovia 9, e um vulto armado saindo da mata em direção à fazenda.', wait: 25 }], next: 'civ_rural', wait: 5 },
];
