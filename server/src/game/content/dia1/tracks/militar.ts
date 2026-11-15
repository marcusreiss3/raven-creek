/**
 * Trilha MILITAR. Esquadrão Bravo-2 no Posto de Controle da Rodovia 9, sob o comando do Fort Ashby.
 * O dia todo na barreira: ordens que pioram, famílias querendo sair, o primeiro infectado entre os detidos, a tentação de
 * desertar. No ato 4, todo mundo chega até eles: é o ponto de encontro (h_bloqueio).
 */
import type { Track } from '../types.js';

export const MILITAR: Track = {
  id: 'militar', name: 'Esquadrão Bravo-2', professions: ['soldier'], location: 'mil_checkpoint', maxGroup: 4, start: 'm1',
  beats: [
    { id: 'm1', act: 1, say: [
      { thread: 'cena', from: 'sistema', text: '06:55 · Posto de Controle da Rodovia 9. Cones, uma cancela, uma guarita com ar-condicionado quebrado. Turno de doze horas.', wait: 3 },
      { thread: 'dm:hollis', from: 'Sgt. Hollis', text: 'Bravo-2, bom dia. Ordem do Comando: inspeção de rotina nos veículos que saem da cidade. Sem estresse.' },
      { thread: 'grupo', from: 'Bravo-2', text: '{grupo} · Posto de Controle · Rodovia 9', wait: 4 },
    ], ask: { kind: 'poll', text: 'O turno começa. O esquadrão:', options: [
      { id: 'rigor', label: '🪖 Inspeção pelo manual, carro por carro', effects: [{ flag: 'rigor' }], next: 'm1b' },
      { id: 'leve', label: '🙄 Acenar pros carros e torcer pro dia passar', effects: [{ flag: 'leve' }, { stress: -4 }], next: 'm1b' },
    ], timeout: 50 } },
    { id: 'm1b', act: 1, say: [
      { thread: 'cena', from: 'sistema', text: 'Guarita. Café de garrafa térmica, um baralho sebento e o Sargento Hollis mostrando no celular a foto da filha formada em enfermagem. "Trabalha no St. Mary. Orgulho do pai."', wait: 5 },
    ], ask: { kind: 'each', text: 'Na guarita, você:', options: [
      { id: 'baralho', label: '🃏 Joga truco com o esquadrão', effects: [{ stress: -4, to: 'chooser' }], next: 'm2' },
      { id: 'hollis', label: '💬 Puxa conversa com o Hollis sobre a filha', effects: [{ flag: 'conhece_hollis' }], next: 'm2' },
      { id: 'radio', label: '📻 Fica no rádio ouvindo o Comando', effects: [{ flag: 'ouviu_comando', to: 'chooser' }], next: 'm2' },
    ], timeout: 50 } },
    { id: 'm2', act: 1, say: [
      { thread: 'cena', from: 'sistema', text: 'Um caminhão-baú da Ashcroft para na cancela. O motorista está pálido, a mão enfaixada. "Tô levando amostra pro Fort Ashby. Me deixa passar, é urgente."', wait: 5 },
      { thread: 'cena', from: 'sistema', text: 'Pela fresta do baú, vocês veem caixas de isopor com o símbolo de risco biológico.', if: { flag: 'rigor' }, wait: 5 },
    ], ask: { kind: 'poll', text: 'O caminhão da Ashcroft quer passar.', options: [
      { id: 'passar', label: '✅ Liberar: tem papelada do Fort Ashby', effects: [{ flag: 'liberou_caminhao' }], next: 'm2b' },
      { id: 'abrir', label: '📦 Abrir o baú antes', check: { stat: 'perception', base: 45, label: 'Achar algo útil sem se contaminar' }, effects: [{ item: 'gas_mask', to: 'one' }, { flag: 'abriu_bau' }], failEffects: [{ stress: 8 }, { flag: 'abriu_bau' }], next: 'm2b' },
    ], timeout: 50 } },
    { id: 'm2b', act: 1, say: [
      { thread: 'cena', from: 'sistema', text: 'No rádio do Comando, uma conversa cortada: "…Projeto Lázaro… contenção… Ashcroft…". Alguém troca de canal rápido.', if: { flag: 'self:ouviu_comando' }, wait: 5 },
      { thread: 'cena', from: 'sistema', text: 'Um ônibus escolar amarelo passa devagar pela cancela, rumo à Escola Lincoln. As crianças grudam o rosto no vidro para ver os soldados.', wait: 5 },
    ], ask: { kind: 'poll', text: 'As crianças acenam do ônibus.', options: [
      { id: 'acenar', label: '👋 Acenar de volta', effects: [{ stress: -3 }], next: 'm3' },
      { id: 'serio', label: '🪖 Cara de mau, postura de soldado', next: 'm3' },
    ], timeout: 30 } },
    { id: 'm3', act: 1, say: [
      { thread: 'cena', from: 'sistema', text: 'Dentro do baú: caixas lacradas "ASHCROFT · PROJETO LÁZARO · NÃO ABRIR FORA DE NÍVEL 3". Uma delas está rachada e vazia.', if: { flag: 'abriu_bau' }, wait: 6 },
      { thread: 'dm:hollis', from: 'Sgt. Hollis', text: 'Bravo-2, nova ordem: NENHUM veículo civil sai da cidade sem autorização do Comando. Fechem a cancela.', wait: 8 },
    ], next: 'm4', wait: 40 },

    // ───────────── Ato 2: a barreira fecha
    { id: 'm4', act: 2, say: [
      { thread: 'cena', from: 'sistema', text: 'A fila de carros cresce. Buzinas. Uma minivan com uma família: pai, mãe e um menino de uns oito anos, com o braço enfaixado e febre.', wait: 4 },
      { thread: 'cena', from: 'sistema', text: '"Por favor, a gente só quer ir pra casa da minha irmã em Willow. O menino caiu da bicicleta, só isso."', wait: 6 },
    ], ask: { kind: 'poll', text: 'A família da minivan.', options: [
      { id: 'reter', label: '🛑 Ordem é ordem: ninguém passa', effects: [{ flag: 'reteve_familia' }, { mark: 'cumpriu_ordens', to: 'each' }, { stress: 6 }], next: 'm5' },
      { id: 'deixar', label: '🚗 Abrir a cancela só pra eles', effects: [{ flag: 'deixou_familia' }, { mark: 'salvou_crianca', to: 'each' }], next: 'm5' },
    ], timeout: 45 } },
    { id: 'm5', act: 2, say: [
      { thread: 'dm:hollis', from: 'Sgt. Hollis', text: 'Quem autorizou a passagem daquela minivan?! Isso vai pro relatório, Bravo-2.', if: { flag: 'deixou_familia' }, wait: 5 },
      { thread: 'cena', from: 'sistema', text: 'A família é levada para a tenda de detidos ao lado da guarita. O menino não para de chorar. A mãe olha para vocês sem piscar.', if: { flag: 'reteve_familia' }, wait: 6 },
    ], ask: { kind: 'call', target: 'one', from: 'Comando · Fort Ashby', text: '📞 "Soldado, aqui é o Comando. Isso é confidencial. O que saiu da Ashcroft é transmissível por mordida. Se alguém tentar furar a barreira, vocês estão autorizados a abrir fogo. Repita a ordem."', options: [
      { id: 'repetir', label: '"Autorizado a abrir fogo. Entendido, senhor."', effects: [{ flag: 'sabe_ordem', to: 'chooser' }, { mark: 'cumpriu_ordens', to: 'chooser' }], next: 'm6' },
      { id: 'questionar', label: '"Senhor, são civis. Eu não vou atirar em civis."', effects: [{ flag: 'sabe_ordem', to: 'chooser' }, { flag: 'questionou', to: 'chooser' }, { stress: 6, to: 'chooser' }], next: 'm6' },
    ], timeout: 35, default: 'repetir' } },
    { id: 'm6', act: 2, say: [
      { thread: 'cena', from: 'sistema', text: '{escolhido} desliga o rádio com a cara branca.', wait: 4 },
      { thread: 'grupo', from: 'Bravo-2', text: 'o que o Comando falou?', wait: 3 },
    ], ask: { kind: 'secret', target: 'flag:sabe_ordem', from: 'sistema', thread: 'cena', text: 'Você é o único que ouviu a ordem de atirar em civis. Conta pro esquadrão?', options: [
      { id: 'contar', label: 'Contar tudo pro esquadrão', effects: [{ flag: 'ordem_publica' }], next: 'm7' },
      { id: 'calar', label: '"Nada demais. Mantenham posição."', effects: [{ flag: 'ordem_secreta' }], next: 'm7' },
    ], timeout: 30 } },
    { id: 'm7', act: 2, say: [
      { thread: 'grupo', from: 'Bravo-2', text: '{escolhido} contou: ordem de atirar em quem furar a barreira.', if: { flag: 'ordem_publica' }, wait: 4 },
      { thread: 'cena', from: 'sistema', text: 'Na tenda de detidos, um grito. Um homem da fila (o motorista do caminhão da Ashcroft) está em cima de outro detido.', wait: 5 },
    ], effects: [{ mark: 'primeiro_morto', to: 'each' }],
      combat: { zombies: 2, types: ['walker'], reason: 'Detidos se transformam na tenda ao lado da guarita', win: 'm8', lose: 'm8l' } },
    { id: 'm8l', act: 2, say: [{ thread: 'cena', from: 'sistema', text: 'Os outros soldados do posto chegam atirando. Vocês saem da tenda arranhados e em choque.', wait: 4 }], effects: [{ stress: 12 }, { wound: 'scratch', to: 'one', infect: 0.3 }], next: 'm8', wait: 2 },
    { id: 'm8', act: 2, say: [
      { thread: 'cena', from: 'sistema', text: 'Silêncio na tenda. Corpos no chão. A família da minivan está encolhida num canto. O menino parou de chorar.', if: { flag: 'reteve_familia' }, wait: 6 },
      { thread: 'dm:hollis', from: 'Sgt. Hollis', text: 'Bravo-2, relatório! …Esqueçam o relatório. Sacos de areia na pista. Ninguém entra, ninguém sai.', wait: 6 },
    ], next: 'm9', wait: 30 },

    // ───────────── Ato 3: o cerco
    { id: 'm9', act: 3, say: [
      { thread: 'cena', from: 'sistema', text: 'O alerta extremo da Defesa Civil toca em todos os celulares ao mesmo tempo. Na fila, alguém começa a rezar em voz alta.', wait: 6 },
    ], ask: { kind: 'poll', text: 'O Hollis quer a barreira reforçada antes de escurecer.', options: [
      { id: 'areia', label: '🧱 Empilhar sacos de areia e arame farpado', check: { stat: 'endurance', base: 55, label: 'Aguentar o serviço pesado' }, effects: [{ flag: 'barreira_forte' }], failEffects: [{ stress: 6 }, { wound: 'bruise', region: 'right_hand', severity: 0.2, to: 'one' }], next: 'm9b' },
      { id: 'triagem', label: '🩺 Montar uma triagem decente pros civis', effects: [{ flag: 'triagem_humana' }, { item: 'bandage', qty: 2, to: 'one' }], next: 'm9b' },
    ], timeout: 50 } },
    { id: 'm9b', act: 3, at: 'hw_route9_east', say: [
      { thread: 'cena', from: 'sistema', text: 'Rodovia 9, sentido cidade. Três vultos correndo pela faixa — rápido demais, aos trancos. Não são gente fugindo. São eles, e esses correm.', wait: 5 },
      { thread: 'dm:hollis', from: 'Sgt. Hollis', text: 'CONTATO NA PISTA! Bravo-2, intercepta antes que cheguem na fila!', wait: 3 },
    ], combat: { zombies: 2, types: ['runner'], reason: 'Infectados corredores na Rodovia 9', win: 'm9c', lose: 'm9l' } },
    { id: 'm9l', act: 3, say: [{ thread: 'cena', from: 'sistema', text: 'Um blindado passa por cima do último. Vocês ficam caídos no asfalto, sem ar.', wait: 4 }], effects: [{ stress: 10 }, { wound: 'bruise', to: 'one' }], next: 'm9c', wait: 2 },
    { id: 'm9c', act: 3, at: 'hw_bridge', say: [
      { thread: 'dm:hollis', from: 'Sgt. Hollis', text: 'Nova ordem do Comando: explosivos na Ponte do Rio Raven. Se a cidade cair, a ponte cai junto. Bravo-2 escolta a equipe de engenharia.', wait: 6 },
      { thread: 'cena', from: 'sistema', text: 'Ponte do Rio Raven. Cargas de demolição presas nos pilares. Do outro lado, gente atravessando a pé com malas e crianças.', wait: 6 },
    ], ask: { kind: 'poll', text: 'Se a ponte explodir agora, essa gente fica do lado errado.', options: [
      { id: 'esperar', label: '⏳ Segurar a explosão até a última família passar', effects: [{ mark: 'protegeu_estranho', to: 'each' }, { flag: 'ponte_aberta' }], next: 'm10' },
      { id: 'ordem', label: '📟 Ordem é ordem: liberar a área e armar as cargas', effects: [{ mark: 'cumpriu_ordens', to: 'each' }, { flag: 'ponte_armada' }, { stress: 8 }], next: 'm10' },
    ], timeout: 50 } },
    { id: 'm10', act: 3, say: [
      { thread: 'familia', from: 'família', text: '@fila', wait: 8 },
    ], ask: { kind: 'each', text: 'Sua família está na fila (no seu celular, pelo menos é o que dizem). Você:', options: [
      { id: 'procurar', label: 'Sair da posição e procurar o carro da sua família', check: { stat: 'perception', base: 40, label: 'Achar o carro na fila' }, effects: [{ mark: 'voltou_familia', to: 'chooser' }, { flag: 'achou_familia', to: 'chooser' }], failEffects: [{ stress: 10, to: 'chooser' }], next: 'm11' },
      { id: 'posicao', label: 'Manter a posição. Responder "não posso".', effects: [{ stress: 8, to: 'chooser' }, { mark: 'cumpriu_ordens', to: 'chooser' }], next: 'm11' },
    ], timeout: 45 } },
    { id: 'm11', act: 3, say: [
      { thread: 'cena', from: 'sistema', text: 'O carro que descreveram não está na fila. Só um sedan prata abandonado, com o vidro de trás estourado.', if: { flag: 'self:achou_familia' }, wait: 6 },
      { thread: 'dm:hollis', from: 'Sgt. Hollis', text: 'Bravo-2, o Comando confirma: ônibus de evacuação às 18h. Até lá, segurem.', wait: 7 },
    ], ask: { kind: 'secret', target: 'one', from: 'sistema', thread: 'cena', text: 'Escurece. Ninguém está olhando para você. A estrada de terra para o norte está a cem metros. Você:', options: [
      { id: 'ficar', label: 'Fica. Alguém tem que segurar esta barreira.', effects: [{ mark: 'cumpriu_ordens', to: 'chooser' }], next: 'm12' },
      { id: 'desertar', label: 'Larga o fuzil no chão e some pela estrada', effects: [{ mark: 'desertor', to: 'chooser' }, { flag: 'desertou', to: 'chooser' }, { flag: 'alguem_desertou' }], next: 'm12' },
    ], timeout: 30, default: 'ficar' } },
    { id: 'm12', act: 3, say: [
      { thread: 'grupo', from: 'Bravo-2', text: 'alguém viu {escolhido}? sumiu da posição', if: { flag: 'alguem_desertou', notFlag: 'self:desertou' }, wait: 5 },
      { thread: 'cena', from: 'sistema', text: 'Da cidade, uma coluna de fumaça preta sobe da Fábrica Ashcroft. Os primeiros grupos de gente a pé começam a chegar pela rodovia.', wait: 30 },
    ], next: 'm12b', wait: 25 },
    { id: 'm12b', act: 3, at: 'mil_checkpoint', say: [
      { thread: 'cena', from: 'sistema', text: 'De volta ao posto. Um caminhão de supermercado para na fila com vinte pessoas na carroceria. O motorista grita que tem água e comida para trocar por passagem.', wait: 6 },
    ], ask: { kind: 'poll', text: 'O caminhão do FoodMax quer "negociar" a passagem.', options: [
      { id: 'confiscar', label: '📦 Confiscar a carga para a triagem', check: { stat: 'strength', base: 45, label: 'Impor a ordem' }, effects: [{ item: 'water_bottle', qty: 2, to: 'one' }, { item: 'canned_beans', to: 'one' }, { flag: 'confiscou' }], failEffects: [{ stress: 8 }, { wound: 'bruise', region: 'head', severity: 0.2, to: 'one' }], next: 'm13' },
      { id: 'dividir', label: '🤝 Distribuir a comida na fila, de graça', effects: [{ mark: 'protegeu_estranho', to: 'each' }, { stress: -4 }], next: 'm13' },
      { id: 'aceitar', label: '💵 Aceitar o "presente" e abrir a cancela pra ele', effects: [{ item: 'whiskey', to: 'one' }, { mark: 'saqueador', to: 'each' }], next: 'm13' },
    ], timeout: 50 } },
    { id: 'm13', act: 3, say: [
      { thread: 'cena', from: 'sistema', text: 'Holofotes acesos. A fila agora é uma multidão. Vocês reconhecem rostos da cidade: policiais, gente de jaleco, um bombeiro carregando alguém no colo.', wait: 6 },
    ], hub: 'h_bloqueio' },
  ],
};
