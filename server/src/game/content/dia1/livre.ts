/**
 * Dia 1 — quem SAIU DO TRABALHO fica livre pelo condado.
 * - Eventos de LOCAL: acontecem ao chegar num lugar importante (um "cedo", antes da queda; outro "tarde", depois).
 * - Eventos GLOBAIS: acontecem de tempos em tempos onde a pessoa estiver (gente desesperada, ataques, achados).
 * Cada pessoa decide por si (escolhas individuais), mas o texto leva em conta quem mais está no lugar:
 * `if: { others: true }` mostra a linha só quando há outros sobreviventes ali, e {outros} vira os nomes deles.
 * Itens vêm daqui (não há "vasculhar" no Dia 1). Ferimentos sim; morte só nos atos 4 e 5.
 * Um evento termina numa batida sem saída de propósito: o motor devolve a pessoa ao estado livre.
 */
import type { Act, Beat, Track } from './types.js';

const ev = (t: Omit<Track, 'professions' | 'location'> & { location?: string }): Track => ({ professions: [], location: t.location ?? t.free?.at ?? 'rc_main_street', ...t });
/** Fim de evento: uma linha de narração e volta a ficar livre. */
const fim = (id: string, act: Act, text: string): Beat => ({ id, act, say: [{ thread: 'cena', from: 'sistema', text, wait: 3 }], end: true });

export const FREE_LOCAL_A: Track[] = [
  // ───────────── HOSPITAL ST. MARY
  ev({ id: 'lv_hospital_cedo', name: 'Hospital: a fila da febre', free: { at: 'rc_hospital_entrance', acts: [1, 2] }, start: 'a', beats: [
    { id: 'a', act: 1, say: [
      { thread: 'cena', from: 'sistema', text: 'A fila da emergência dá a volta no estacionamento. Gente enrolada em cobertor, tossindo, suando. Uma enfermeira de olheiras fundas grita números que ninguém escuta.', wait: 5 },
      { thread: 'cena', from: 'sistema', text: '{outros} também estão por aqui, olhando a mesma fila.', if: { others: true }, wait: 4 },
      { thread: 'cena', from: 'sistema', text: 'Um carrinho de medicação está parado, sozinho, perto da porta lateral.', wait: 4 },
    ], ask: { kind: 'each', text: 'O que você faz no hospital?', options: [
      { id: 'ajudar', label: '🩺 Ajudar a enfermeira com a triagem', check: { stat: 'medicine', base: 45, label: 'Separar os casos graves' }, effects: [{ mark: 'protegeu_estranho', to: 'chooser' }, { item: 'bandage', qty: 2, to: 'chooser' }], failEffects: [{ stress: 6, to: 'chooser' }, { wound: 'scratch', region: 'left_arm', severity: 0.2, to: 'chooser', infect: 0.25 }], next: 'b' },
      { id: 'carrinho', label: '🤫 Pegar o que der do carrinho de medicação', check: { stat: 'stealth', base: 50, label: 'Ninguém ver' }, effects: [{ item: 'painkillers', to: 'chooser' }, { item: 'antiseptic', to: 'chooser' }, { mark: 'saqueador', to: 'chooser' }], failEffects: [{ stress: 8, to: 'chooser' }], next: 'b' },
      { id: 'sair', label: '🚪 Isso aqui vai virar um foco. Ir embora.', effects: [{ stress: -2, to: 'chooser' }], next: 'b' },
    ], timeout: 90 } },
    fim('b', 1, 'Lá dentro, alguém começa a gritar. A fila inteira se vira para a porta ao mesmo tempo, e depois volta a olhar para o chão.'),
  ] }),
  ev({ id: 'lv_hospital_tarde', name: 'Hospital: o saguão caiu', free: { at: 'rc_hospital_entrance', acts: [3, 5] }, start: 'a', beats: [
    { id: 'a', act: 3, say: [
      { thread: 'cena', from: 'sistema', text: 'As portas de vidro estão quebradas. Macas tombadas na rampa da ambulância. De dentro vem um som que não é de gente.', wait: 5 },
      { thread: 'cena', from: 'sistema', text: '{outros} estão aqui, decidindo se entram.', if: { others: true }, wait: 4 },
    ], ask: { kind: 'each', text: 'O hospital caiu. Mas lá dentro ainda tem remédio.', options: [
      { id: 'entrar', label: '🏥 Entrar rápido pela farmácia interna', next: 'luta' },
      { id: 'ambulancia', label: '🚑 Revirar a ambulância parada na rampa', check: { stat: 'perception', base: 50, label: 'Achar o kit no meio da bagunça' }, effects: [{ item: 'first_aid_kit', to: 'chooser' }], failEffects: [{ stress: 5, to: 'chooser' }], next: 'fim' },
      { id: 'nao', label: '🚶 Não vale a vida. Seguir em frente.', next: 'fim' },
    ], timeout: 90 } },
    { id: 'luta', act: 3, say: [{ thread: 'cena', from: 'sistema', text: 'Você mal passa da recepção e eles viram a cabeça ao mesmo tempo.', wait: 3 }],
      combat: { zombies: 2, types: ['walker'], reason: 'Infectados no saguão do Hospital St. Mary', win: 'loot', lose: 'fim' } },
    { id: 'loot', act: 3, say: [{ thread: 'cena', from: 'sistema', text: 'Na farmácia interna, prateleiras reviradas. Mas uma gaveta trancada cede com um chute.', wait: 4 }], effects: [{ item: 'antibiotics', to: 'each' }, { item: 'bandage', qty: 2, to: 'each' }], next: 'fim' },
    fim('fim', 3, 'Você sai do hospital sem olhar para trás.'),
  ] }),
  // ───────────── FARMÁCIA WELLS
  ev({ id: 'lv_farmacia_cedo', name: 'Farmácia: o racionamento', free: { at: 'rc_pharmacy', acts: [1, 2] }, start: 'a', beats: [
    { id: 'a', act: 1, say: [
      { thread: 'cena', from: 'sistema', text: 'O velho Wells limita: "Duas caixas por pessoa!". Na sua frente, um homem com um menino febril no colo implora por antibiótico sem receita.', wait: 5 },
      { thread: 'cena', from: 'sistema', text: '{outros} estão na mesma fila, alguns lugares atrás.', if: { others: true }, wait: 3 },
    ], ask: { kind: 'each', text: 'Na fila da farmácia:', options: [
      { id: 'vez', label: '🫂 Ceder sua vez ao pai com o menino', effects: [{ mark: 'protegeu_estranho', to: 'chooser' }, { stress: -4, to: 'chooser' }], next: 'b' },
      { id: 'comprar', label: '💊 Comprar o que dá: analgésico e curativo', effects: [{ item: 'painkillers', to: 'chooser' }, { item: 'bandage', to: 'chooser' }], next: 'b' },
      { id: 'balcao', label: '✋ Na confusão, pegar antibiótico atrás do balcão', check: { stat: 'agility', base: 45, label: 'Ser rápido' }, effects: [{ item: 'antibiotics', to: 'chooser' }, { mark: 'saqueador', to: 'chooser' }], failEffects: [{ wound: 'bruise', region: 'torso', severity: 0.25, to: 'chooser' }, { stress: 8, to: 'chooser' }], next: 'b' },
    ], timeout: 90 } },
    fim('b', 1, 'Wells baixa a porta de aço até a metade. "Volta amanhã quem não foi atendido." Ninguém acredita.'),
  ] }),
  ev({ id: 'lv_farmacia_tarde', name: 'Farmácia: o dono armado', free: { at: 'rc_pharmacy', acts: [3, 5] }, start: 'a', beats: [
    { id: 'a', act: 3, say: [
      { thread: 'cena', from: 'sistema', text: 'A porta de aço foi arrombada. Lá dentro, só caixas vazias. Nos fundos, Wells está sentado no chão com uma espingarda no colo, apontada para a porta.', wait: 5 },
      { thread: 'cena', from: 'sistema', text: '{outros} entraram com você. Ele olha de um para o outro, nervoso.', if: { others: true }, wait: 3 },
    ], ask: { kind: 'each', text: 'O farmacêutico armado, nos fundos:', options: [
      { id: 'conversar', label: '🗣️ "Calma, seu Wells. Só quero ajudar."', check: { stat: 'intellect', base: 50, label: 'Acalmar um homem apavorado' }, effects: [{ item: 'first_aid_kit', to: 'chooser' }, { mark: 'protegeu_estranho', to: 'chooser' }], failEffects: [{ wound: 'gunshot', region: 'left_arm', severity: 0.3, to: 'chooser' }, { stress: 12, to: 'chooser' }], next: 'b' },
      { id: 'sair', label: '🚪 Sair devagar, de mãos para cima', next: 'b' },
    ], timeout: 80 } },
    fim('b', 3, '"Vai. Vai antes que eles sintam o cheiro de vocês", ele sussurra.'),
  ] }),
];

export const FREE_LOCAL_B: Track[] = [
  // ───────────── SUPERMERCADO FOODMAX
  ev({ id: 'lv_foodmax_cedo', name: 'FoodMax: a corrida às compras', free: { at: 'rc_supermarket', acts: [1, 2] }, start: 'a', beats: [
    { id: 'a', act: 1, say: [
      { thread: 'cena', from: 'sistema', text: 'Carrinhos lotados de água, papel higiênico e enlatado. Uma senhora e um homem de terno puxam o último fardo de água ao mesmo tempo.', wait: 5 },
      { thread: 'cena', from: 'sistema', text: '{outros} disputam espaço no mesmo corredor.', if: { others: true }, wait: 3 },
    ], ask: { kind: 'each', text: 'No FoodMax:', options: [
      { id: 'agua', label: '💧 Garantir água antes que acabe', effects: [{ item: 'water_bottle', qty: 2, to: 'chooser' }], next: 'b' },
      { id: 'lata', label: '🥫 Corredor dos enlatados', effects: [{ item: 'canned_beans', qty: 2, to: 'chooser' }], next: 'b' },
      { id: 'briga', label: '✋ Separar a briga pela água', check: { stat: 'strength', base: 45, label: 'Afastar o homem de terno' }, effects: [{ mark: 'protegeu_estranho', to: 'chooser' }, { item: 'water_bottle', to: 'chooser' }], failEffects: [{ wound: 'bruise', region: 'head', severity: 0.2, to: 'chooser' }], next: 'b' },
    ], timeout: 90 } },
    fim('b', 1, 'O gerente desliga as caixas: "Só dinheiro vivo!". A fila vira empurra-empurra.'),
  ] }),
  ev({ id: 'lv_foodmax_tarde', name: 'FoodMax: saqueadores', free: { at: 'rc_supermarket', acts: [3, 5] }, start: 'a', beats: [
    { id: 'a', act: 3, say: [
      { thread: 'cena', from: 'sistema', text: 'Vitrine estourada. Dois caras com tacos de beisebol carregam uma picape com o que sobrou. Um deles aponta o taco para você: "Isso aqui é nosso. Some."', wait: 5 },
      { thread: 'cena', from: 'sistema', text: 'Com {outros} por perto, eles hesitam. Vocês são mais.', if: { others: true }, wait: 3 },
    ], ask: { kind: 'each', text: 'Os saqueadores do FoodMax:', options: [
      { id: 'enfrentar', label: '👊 Encarar e pegar sua parte', check: { stat: 'strength', base: 40, label: 'Não recuar' }, effects: [{ item: 'canned_soup', qty: 2, to: 'chooser' }, { item: 'baseball_bat', to: 'chooser' }], failEffects: [{ wound: 'bruise', region: 'torso', severity: 0.35, to: 'chooser' }, { wound: 'cut_shallow', region: 'right_arm', severity: 0.25, to: 'chooser' }], next: 'b' },
      { id: 'estoque', label: '🤫 Entrar pelos fundos, pelo estoque', check: { stat: 'stealth', base: 50, label: 'Passar sem ser visto' }, effects: [{ item: 'crackers', to: 'chooser' }, { item: 'water_bottle', qty: 2, to: 'chooser' }], failEffects: [{ stress: 8, to: 'chooser' }], next: 'b' },
      { id: 'sair', label: '🚶 Não vale a briga. Sair.', next: 'b' },
    ], timeout: 80 } },
    fim('b', 3, 'A picape arranca cantando pneu. Do fundo do mercado, alguma coisa começa a bater nas portas do frigorífico.'),
  ] }),
  // ───────────── POSTO GULF
  ev({ id: 'lv_posto_cedo', name: 'Posto Gulf: o frentista', free: { at: 'rc_gas_station', acts: [1, 2] }, start: 'a', beats: [
    { id: 'a', act: 1, say: [
      { thread: 'cena', from: 'sistema', text: 'O frentista do vídeo está sentado no meio-fio, com a camisa encharcada de sangue no ombro. Diz que está bem. Os olhos dele não estão bem.', wait: 5 },
      { thread: 'cena', from: 'sistema', text: '{outros} estão abastecendo, fingindo não ver.', if: { others: true }, wait: 3 },
    ], ask: { kind: 'each', text: 'No Posto Gulf:', options: [
      { id: 'socorro', label: '🩹 Fazer um curativo nele', check: { stat: 'medicine', base: 40, label: 'Estancar sem se sujar de sangue' }, effects: [{ mark: 'protegeu_estranho', to: 'chooser' }], failEffects: [{ wound: 'scratch', region: 'right_hand', severity: 0.2, to: 'chooser', infect: 0.35 }], next: 'b' },
      { id: 'galao', label: '⛽ Encher um galão de gasolina e ir', effects: [{ item: 'gas_can', to: 'chooser' }], next: 'b' },
      { id: 'loja', label: '🍫 Comprar o que der na lojinha', effects: [{ item: 'chocolate', to: 'chooser' }, { item: 'soda', to: 'chooser' }, { item: 'lighter', to: 'chooser' }], next: 'b' },
    ], timeout: 90 } },
    fim('b', 1, 'Quando você olha de novo, o frentista sumiu. Só a mancha no meio-fio.'),
  ] }),
  ev({ id: 'lv_posto_tarde', name: 'Posto Gulf: a última bomba', free: { at: 'rc_gas_station', acts: [3, 5] }, start: 'a', beats: [
    { id: 'a', act: 3, say: [
      { thread: 'cena', from: 'sistema', text: 'Fila de carros buzinando na única bomba que ainda funciona. Um carro pega fogo na saída. Ninguém sai da fila.', wait: 5 },
      { thread: 'cena', from: 'sistema', text: '{outros} estão no meio da confusão também.', if: { others: true }, wait: 3 },
    ], ask: { kind: 'each', text: 'O posto em chamas:', options: [
      { id: 'galao', label: '⛽ Encher um galão na bomba de trás', check: { stat: 'agility', base: 45, label: 'Antes do fogo chegar' }, effects: [{ item: 'gas_can', to: 'chooser' }], failEffects: [{ wound: 'burn', region: 'left_hand', severity: 0.3, to: 'chooser' }], next: 'b' },
      { id: 'apagar', label: '🧯 Pegar o extintor e tentar apagar', check: { stat: 'strength', base: 40, label: 'Segurar o extintor' }, effects: [{ mark: 'protegeu_estranho', to: 'chooser' }], failEffects: [{ wound: 'burn', region: 'right_arm', severity: 0.35, to: 'chooser' }], next: 'b' },
      { id: 'sair', label: '🏃 Sair antes que exploda', next: 'b' },
    ], timeout: 70 } },
    fim('b', 3, 'Um estouro abafado. A fumaça preta engole a placa do Gulf.'),
  ] }),
  // ───────────── ESCOLA LINCOLN
  ev({ id: 'lv_escola_cedo', name: 'Escola: os pais no portão', free: { at: 'rc_school', acts: [1, 2] }, start: 'a', beats: [
    { id: 'a', act: 1, say: [
      { thread: 'cena', from: 'sistema', text: 'O portão da Escola Lincoln está trancado. Pais gritando com o porteiro. Uma professora sozinha tenta organizar quarenta crianças no pátio.', wait: 5 },
      { thread: 'cena', from: 'sistema', text: '{outros} estão no meio dos pais, procurando um rosto conhecido.', if: { others: true }, wait: 3 },
    ], ask: { kind: 'each', text: 'No portão da escola:', options: [
      { id: 'ajudar', label: '🧒 Ajudar a professora a entregar as crianças', check: { stat: 'intellect', base: 40, label: 'Manter a ordem' }, effects: [{ mark: 'salvou_crianca', to: 'chooser' }, { stress: -3, to: 'chooser' }], failEffects: [{ stress: 6, to: 'chooser' }], next: 'b' },
      { id: 'porteiro', label: '🗣️ Convencer o porteiro a abrir o portão', check: { stat: 'strength', base: 45, label: 'Se impor' }, effects: [{ mark: 'protegeu_estranho', to: 'chooser' }], failEffects: [{ wound: 'bruise', region: 'left_arm', severity: 0.2, to: 'chooser' }], next: 'b' },
      { id: 'sair', label: '🚶 Não é problema seu. Seguir.', next: 'b' },
    ], timeout: 90 } },
    fim('b', 1, 'Um menino de mochila do Batman fica olhando você ir embora pela grade.'),
  ] }),
  ev({ id: 'lv_escola_tarde', name: 'Escola: o menino no armário', free: { at: 'rc_school', acts: [3, 5] }, start: 'a', beats: [
    { id: 'a', act: 3, say: [
      { thread: 'cena', from: 'sistema', text: 'A escola está vazia. Mochilas no pátio. Do armário do zelador vem um choro abafado, e do corredor, passos arrastados.', wait: 5 },
    ], ask: { kind: 'each', text: 'Alguém chora no armário do zelador.', options: [
      { id: 'abrir', label: '🔓 Abrir o armário e tirar quem está lá', next: 'luta' },
      { id: 'chamar', label: '📱 Avisar no grupo de pais da escola e ir', effects: [{ stress: 6, to: 'chooser' }], next: 'fim' },
      { id: 'sair', label: '🚶 Sair antes que o corredor chegue até você', effects: [{ mark: 'deixou_para_tras', to: 'chooser' }, { stress: 10, to: 'chooser' }], next: 'fim' },
    ], timeout: 80 } },
    { id: 'luta', act: 3, say: [{ thread: 'cena', from: 'sistema', text: 'Você abre a porta e puxa um menino de uns sete anos. Do corredor, o zelador vem na sua direção, com a boca aberta.', wait: 4 }],
      combat: { zombies: 1, types: ['walker'], reason: 'O zelador da Escola Lincoln', win: 'salvo', lose: 'salvo' } },
    { id: 'salvo', act: 3, say: [{ thread: 'cena', from: 'sistema', text: 'Você leva o menino até a igreja, onde ainda há luz e adultos. Ele não solta sua mão até o último segundo.', wait: 5 }], effects: [{ mark: 'salvou_crianca', to: 'each' }], next: 'fim' },
    fim('fim', 3, 'O pátio fica para trás, cheio de mochilas que ninguém vai buscar.'),
  ] }),
];

export const FREE_LOCAL_C: Track[] = [
  // ───────────── IGREJA DE SÃO JORGE
  ev({ id: 'lv_igreja_cedo', name: 'Igreja: as portas abertas', free: { at: 'rc_church', acts: [1, 3] }, start: 'a', beats: [
    { id: 'a', act: 1, say: [
      { thread: 'cena', from: 'sistema', text: 'O Padre Collins abriu as portas e acendeu todas as velas. Velhinhas rezam o terço, uma família dorme num banco. Ele te oferece café de garrafa térmica.', wait: 5 },
      { thread: 'cena', from: 'sistema', text: '{outros} estão sentados nos bancos do fundo.', if: { others: true }, wait: 3 },
    ], ask: { kind: 'each', text: 'Na igreja:', options: [
      { id: 'cafe', label: '☕ Aceitar o café e descansar um pouco', effects: [{ stress: -8, to: 'chooser' }], next: 'b' },
      { id: 'ajudar', label: '📦 Ajudar o padre a carregar água e cobertores', check: { stat: 'endurance', base: 40, label: 'Aguentar o vaivém' }, effects: [{ item: 'water_bottle', to: 'chooser' }, { mark: 'protegeu_estranho', to: 'chooser' }], failEffects: [{ stress: 4, to: 'chooser' }], next: 'b' },
      { id: 'velas', label: '🕯️ Pegar velas e fósforos da sacristia', effects: [{ item: 'lighter', to: 'chooser' }, { stress: 3, to: 'chooser' }], next: 'b' },
    ], timeout: 90 } },
    fim('b', 1, '"Se ficar ruim lá fora, volta. Aqui ninguém fica de fora", diz o padre.'),
  ] }),
  // ───────────── OFICINA DO HANK
  ev({ id: 'lv_oficina_cedo', name: 'Oficina: o Hank fechando', free: { at: 'rc_workshop', acts: [1, 2] }, start: 'a', beats: [
    { id: 'a', act: 1, say: [
      { thread: 'cena', from: 'sistema', text: 'O Hank está pregando tábuas na própria vitrine. "Não sei o que é, mas não vou esperar pra ver." Ele te olha de cima a baixo.', wait: 5 },
      { thread: 'cena', from: 'sistema', text: '{outros} já estão ajudando o Hank a segurar as tábuas.', if: { others: true }, wait: 3 },
    ], ask: { kind: 'each', text: 'Na oficina do Hank:', options: [
      { id: 'ajudar', label: '🔨 Ajudar a pregar as tábuas', check: { stat: 'carpentry', base: 40, label: 'Pregar firme' }, effects: [{ item: 'hammer', to: 'chooser' }, { item: 'nails', qty: 10, to: 'chooser' }], failEffects: [{ wound: 'cut_shallow', region: 'left_hand', severity: 0.2, to: 'chooser' }, { item: 'nails', qty: 5, to: 'chooser' }], next: 'b' },
      { id: 'comprar', label: '🔧 Pedir o pé de cabra emprestado', check: { stat: 'intellect', base: 45, label: 'Convencer o Hank' }, effects: [{ item: 'crowbar', to: 'chooser' }], failEffects: [{ stress: 3, to: 'chooser' }], next: 'b' },
      { id: 'sair', label: '🚶 Desejar sorte e seguir', next: 'b' },
    ], timeout: 90 } },
    fim('b', 1, 'A última tábua sobe. Lá de dentro, o rádio do Hank toca country baixinho.'),
  ] }),
  ev({ id: 'lv_oficina_tarde', name: 'Oficina: o Hank mordido', free: { at: 'rc_workshop', acts: [3, 5] }, start: 'a', beats: [
    { id: 'a', act: 3, say: [
      { thread: 'cena', from: 'sistema', text: 'As tábuas foram arrancadas de dentro para fora. O Hank está sentado na bancada, com o braço enrolado num pano. "Foi um cachorro", ele mente.', wait: 5 },
    ], ask: { kind: 'each', text: 'O Hank, ferido:', options: [
      { id: 'ferramentas', label: '🧰 "Hank, me deixa levar umas ferramentas."', effects: [{ item: 'crowbar', to: 'chooser' }, { item: 'rope', to: 'chooser' }, { stress: 6, to: 'chooser' }], next: 'b' },
      { id: 'cuidar', label: '🩹 Trocar o pano por um curativo de verdade', check: { stat: 'medicine', base: 45, label: 'Sem encostar no sangue' }, effects: [{ mark: 'protegeu_estranho', to: 'chooser' }], failEffects: [{ wound: 'scratch', region: 'right_hand', severity: 0.2, to: 'chooser', infect: 0.4 }], next: 'b' },
      { id: 'sair', label: '🚪 Recuar devagar até a porta', next: 'b' },
    ], timeout: 80 } },
    fim('b', 3, '"Fecha a porta quando sair", diz o Hank. "Fecha bem."'),
  ] }),
  // ───────────── AVENIDA WILLOW (bairro)
  ev({ id: 'lv_bairro_cedo', name: 'Bairro: o marido doente', free: { at: 'res_avenue', acts: [1, 2] }, start: 'a', beats: [
    { id: 'a', act: 1, say: [
      { thread: 'cena', from: 'sistema', text: 'Uma vizinha de roupão bate no seu ombro: "Por favor, meu marido tá com febre, a ambulância não vem, o telefone não completa." A porta da casa dela está aberta.', wait: 5 },
      { thread: 'cena', from: 'sistema', text: '{outros} também ouviram. Ela olha para todos vocês ao mesmo tempo.', if: { others: true }, wait: 3 },
    ], ask: { kind: 'each', text: 'A vizinha desesperada:', options: [
      { id: 'entrar', label: '🏠 Entrar para ver o marido', next: 'casa' },
      { id: 'hospital', label: '🚗 "Leva ele pro St. Mary agora. Não espera."', effects: [{ stress: 2, to: 'chooser' }], next: 'fim' },
      { id: 'nao', label: '✋ Pedir desculpa e se afastar', effects: [{ stress: 5, to: 'chooser' }], next: 'fim' },
    ], timeout: 90 } },
    { id: 'casa', act: 1, say: [{ thread: 'cena', from: 'sistema', text: 'O marido está no sofá, cinza, com o pescoço enfaixado. Ele abre os olhos. Não olha para você: olha para o seu pescoço.', wait: 5 }],
      ask: { kind: 'each', text: 'O marido doente:', options: [
        { id: 'sair', label: '🏃 Tirar a vizinha de dentro de casa', check: { stat: 'strength', base: 45, label: 'Arrastar a vizinha' }, effects: [{ mark: 'protegeu_estranho', to: 'chooser' }], failEffects: [{ wound: 'scratch', region: 'left_arm', severity: 0.25, to: 'chooser', infect: 0.3 }], next: 'fim' },
        { id: 'remedio', label: '💊 Pegar os remédios da cozinha e sair', effects: [{ item: 'painkillers', to: 'chooser' }, { mark: 'deixou_para_tras', to: 'chooser' }], next: 'fim' },
      ], timeout: 60 } },
    fim('fim', 1, 'Atrás de você, na Avenida Willow, uma porta bate. Depois outra.'),
  ] }),
  ev({ id: 'lv_bairro_tarde', name: 'Bairro: casas arrombadas', free: { at: 'res_avenue', acts: [3, 5] }, start: 'a', beats: [
    { id: 'a', act: 3, say: [
      { thread: 'cena', from: 'sistema', text: 'Metade das casas da Avenida Willow está de porta aberta. Uma garagem com um carro ainda ligado. Um cachorro preso latindo num quintal.', wait: 5 },
      { thread: 'cena', from: 'sistema', text: '{outros} vasculham a casa ao lado.', if: { others: true }, wait: 3 },
    ], ask: { kind: 'each', text: 'Na avenida abandonada:', options: [
      { id: 'garagem', label: '🚗 Ver a garagem com o carro ligado', check: { stat: 'perception', base: 45, label: 'Ver se tem alguém dentro' }, effects: [{ item: 'flashlight', to: 'chooser' }, { item: 'canned_beans', to: 'chooser' }], failEffects: [{ wound: 'bite', region: 'left_arm', severity: 0.2, to: 'chooser', infect: 0.5 }], next: 'fim' },
      { id: 'cachorro', label: '🐕 Soltar o cachorro do quintal', effects: [{ stress: -5, to: 'chooser' }], next: 'fim' },
      { id: 'casa', label: '🏠 Entrar numa casa de porta aberta', next: 'luta' },
    ], timeout: 80 } },
    { id: 'luta', act: 3, say: [{ thread: 'cena', from: 'sistema', text: 'A casa não está vazia.', wait: 3 }], combat: { zombies: 1, types: ['walker'], reason: 'Um morador da Avenida Willow', win: 'loot', lose: 'fim' } },
    { id: 'loot', act: 3, say: [{ thread: 'cena', from: 'sistema', text: 'Na despensa, latas e água. Na geladeira, uma foto da família presa com ímã.', wait: 4 }], effects: [{ item: 'canned_soup', qty: 2, to: 'each' }, { item: 'water_bottle', to: 'each' }], next: 'fim' },
    fim('fim', 3, 'Você segue pela calçada, longe das janelas.'),
  ] }),
];

/** Eventos globais: acontecem de tempos em tempos onde a pessoa estiver (sem `at`). */
export const FREE_GLOBAL: Track[] = [
  ev({ id: 'lg_vizinha_cafe', name: 'Uma senhora oferece café', free: { acts: [1, 1] }, start: 'a', beats: [
    { id: 'a', act: 1, say: [{ thread: 'cena', from: 'sistema', text: 'Uma senhora de avental te chama da varanda: "Você tá com cara de quem não comeu. Entra, tem bolo." Na TV dela, o noticiário fala da fábrica.', wait: 5 }],
      ask: { kind: 'each', text: 'A senhora da varanda:', options: [
        { id: 'aceitar', label: '☕ Aceitar o café e o bolo', effects: [{ stress: -6, to: 'chooser' }, { item: 'crackers', to: 'chooser' }], next: 'b' },
        { id: 'avisar', label: '⚠️ "Senhora, tranca a porta hoje. Não abre pra ninguém."', effects: [{ mark: 'protegeu_estranho', to: 'chooser' }], next: 'b' },
      ], timeout: 70 } },
    fim('b', 1, 'Ela acena da varanda até você virar a esquina.'),
  ] }),
  ev({ id: 'lg_carro_desgovernado', name: 'Carro desgovernado', free: { acts: [1, 3] }, start: 'a', beats: [
    { id: 'a', act: 1, say: [{ thread: 'cena', from: 'sistema', text: 'Um sedan vem em zigue-zague pela rua, buzinando sem parar. O motorista está debruçado no volante. Ele vem na sua direção.', wait: 3 }],
      ask: { kind: 'each', text: 'O carro vem direto em você!', options: [
        { id: 'pular', label: '🏃 Pular para o lado', check: { stat: 'agility', base: 55, label: 'Sair da frente' }, failEffects: [{ wound: 'bruise', region: 'left_leg', severity: 0.4, to: 'chooser' }, { stress: 8, to: 'chooser' }], next: 'b' },
        { id: 'poste', label: '🧱 Se jogar atrás de um poste', check: { stat: 'perception', base: 45, label: 'Achar abrigo a tempo' }, failEffects: [{ wound: 'fracture', region: 'left_foot', severity: 0.3, to: 'chooser' }], next: 'b' },
      ], timeout: 25 } },
    { id: 'b', act: 1, say: [{ thread: 'cena', from: 'sistema', text: 'O carro bate num hidrante. O motorista não se mexe. Depois se mexe, mas não do jeito certo.', wait: 4 }],
      ask: { kind: 'each', text: 'O motorista no carro batido:', options: [
        { id: 'porta', label: '🚪 Abrir a porta para ajudar', next: 'luta' },
        { id: 'ir', label: '🚶 Deixar quieto e ir embora', effects: [{ stress: 4, to: 'chooser' }], next: 'fim' },
      ], timeout: 60 } },
    { id: 'luta', act: 1, say: [{ thread: 'cena', from: 'sistema', text: 'Ele avança antes que você termine de abrir a porta.', wait: 2 }], combat: { zombies: 1, types: ['walker'], reason: 'O motorista do carro batido', win: 'fim', lose: 'fim' } },
    fim('fim', 1, 'A buzina continua tocando, presa, até a bateria acabar.'),
  ] }),
  ev({ id: 'lg_mae_carro', name: 'Uma mãe desesperada', free: { acts: [2, 3] }, start: 'a', beats: [
    { id: 'a', act: 2, say: [{ thread: 'cena', from: 'sistema', text: 'Uma mulher te segura pelo braço, chorando: "Meu filho tá na escola, meu carro não pega, por favor, você tem carro? Tem alguma coisa? Qualquer coisa!"', wait: 5 }],
      ask: { kind: 'each', text: 'A mãe desesperada:', options: [
        { id: 'chaves', label: '🔑 Dar suas chaves do carro (se tiver)', if: { item: 'car_keys' }, effects: [{ mark: 'protegeu_estranho', to: 'chooser' }, { stress: -6, to: 'chooser' }], next: 'b' },
        { id: 'caminho', label: '🗺️ Ensinar o caminho mais curto pelos fundos', check: { stat: 'intellect', base: 40, label: 'Lembrar das ruas' }, effects: [{ mark: 'protegeu_estranho', to: 'chooser' }], next: 'b' },
        { id: 'soltar', label: '✋ Se soltar dela e seguir', effects: [{ stress: 6, to: 'chooser' }], next: 'b' },
      ], timeout: 70 } },
    fim('b', 2, 'Ela sai correndo, de chinelo, no meio da rua.'),
  ] }),
  ev({ id: 'lg_mordido_pede', name: 'Um mordido pede ajuda', free: { acts: [2, 4] }, start: 'a', beats: [
    { id: 'a', act: 2, say: [{ thread: 'cena', from: 'sistema', text: 'Um rapaz de uniforme do FoodMax está encostado num muro, apertando o antebraço mordido. "Me ajuda. Por favor. Só um pano, qualquer coisa."', wait: 5 }],
      ask: { kind: 'each', text: 'O rapaz mordido:', options: [
        { id: 'ajudar', label: '🩹 Amarrar o braço dele', check: { stat: 'medicine', base: 45, label: 'Sem se ferir' }, effects: [{ mark: 'protegeu_estranho', to: 'chooser' }, { item: 'cigarettes', to: 'chooser' }], failEffects: [{ wound: 'scratch', region: 'left_hand', severity: 0.2, to: 'chooser', infect: 0.4 }], next: 'b' },
        { id: 'agua', label: '💧 Deixar uma garrafa d\'água e se afastar', effects: [{ stress: 2, to: 'chooser' }], next: 'b' },
        { id: 'nao', label: '🚶 Fingir que não ouviu', effects: [{ mark: 'deixou_para_tras', to: 'chooser' }, { stress: 6, to: 'chooser' }], next: 'b' },
      ], timeout: 70 } },
    fim('b', 2, 'Quando você olha para trás, ele está de cabeça baixa. Parado. Bem parado.'),
  ] }),
  ev({ id: 'lg_ataque_rua', name: 'Ataque na rua', free: { acts: [2, 5] }, start: 'a', beats: [
    { id: 'a', act: 2, say: [{ thread: 'cena', from: 'sistema', text: 'Um vulto sai de trás de uma caçamba e vem direto em você, rápido demais para quem está machucado daquele jeito.', wait: 3 }],
      ask: { kind: 'each', text: 'Ele vem para cima!', options: [
        { id: 'lutar', label: '👊 Encarar', next: 'luta' },
        { id: 'correr', label: '🏃 Correr', check: { stat: 'athletics', base: 50, label: 'Fugir' }, failEffects: [{ wound: 'scratch', region: 'right_arm', severity: 0.25, to: 'chooser', infect: 0.3 }], next: 'fim' },
      ], timeout: 20, default: 'lutar' } },
    { id: 'luta', act: 2, combat: { zombies: 1, types: ['walker'], reason: 'Um infectado sai de trás de uma caçamba', win: 'fim', lose: 'fim' } },
    fim('fim', 2, 'Seu coração demora para voltar ao normal.'),
  ] }),
  ev({ id: 'lg_saqueadores', name: 'Assaltantes', free: { acts: [3, 5] }, start: 'a', beats: [
    { id: 'a', act: 3, say: [{ thread: 'cena', from: 'sistema', text: 'Dois homens de capuz te cercam. Um mostra uma faca. "Mochila. Agora. Ninguém precisa se machucar."', wait: 4 }],
      ask: { kind: 'each', text: 'Os assaltantes:', options: [
        { id: 'entregar', label: '🎒 Entregar a comida que tiver', effects: [{ stress: 8, to: 'chooser' }], next: 'fim' },
        { id: 'blefar', label: '🗣️ "Tem infectado vindo aí atrás. Corre!"', check: { stat: 'intellect', base: 50, label: 'Blefar' }, failEffects: [{ wound: 'cut_shallow', region: 'left_arm', severity: 0.3, to: 'chooser' }], next: 'fim' },
        { id: 'lutar', label: '👊 Reagir', check: { stat: 'strength', base: 45, label: 'Desarmar o da faca' }, effects: [{ item: 'kitchen_knife', to: 'chooser' }], failEffects: [{ wound: 'cut_deep', region: 'torso', severity: 0.35, to: 'chooser' }, { stress: 10, to: 'chooser' }], next: 'fim' },
      ], timeout: 40 } },
    fim('fim', 3, 'Eles somem num beco. Ninguém na rua viu nada. Ou fingiu não ver.'),
  ] }),
  ev({ id: 'lg_mochila_militar', name: 'Uma mochila do exército', free: { acts: [3, 5] }, start: 'a', beats: [
    { id: 'a', act: 3, say: [{ thread: 'cena', from: 'sistema', text: 'No meio da rua, um jipe do exército capotado. Uma mochila verde caída perto da roda, e um soldado preso no cinto de segurança, se debatendo.', wait: 5 }],
      ask: { kind: 'each', text: 'O jipe capotado:', options: [
        { id: 'mochila', label: '🎒 Pegar a mochila sem chegar perto da janela', check: { stat: 'stealth', base: 50, label: 'Sem chamar atenção' }, effects: [{ item: 'radio', to: 'chooser' }, { item: 'ammo_9mm', qty: 6, to: 'chooser' }], failEffects: [{ wound: 'scratch', region: 'right_hand', severity: 0.25, to: 'chooser', infect: 0.35 }], next: 'fim' },
        { id: 'deixar', label: '🚶 Deixar tudo onde está', next: 'fim' },
      ], timeout: 60 } },
    fim('fim', 3, 'O soldado continua se debatendo no cinto. Ele vai ficar ali muito tempo.'),
  ] }),
  ev({ id: 'lg_tiroteio', name: 'Tiroteio', free: { acts: [3, 5] }, start: 'a', beats: [
    { id: 'a', act: 3, say: [{ thread: 'cena', from: 'sistema', text: 'Tiros. Muitos. Alguém atira de uma janela em qualquer coisa que se mexe na rua, gente ou não.', wait: 3 }],
      ask: { kind: 'each', text: 'Atirador na janela!', options: [
        { id: 'abrigo', label: '🧱 Se jogar atrás de um carro', check: { stat: 'perception', base: 50, label: 'Achar o ângulo seguro' }, failEffects: [{ wound: 'gunshot', region: 'left_leg', severity: 0.3, to: 'chooser' }], next: 'fim' },
        { id: 'gritar', label: '📢 Gritar "TEM GENTE VIVA AQUI!"', check: { stat: 'endurance', base: 40, label: 'Fazer ele ouvir' }, effects: [{ stress: 4, to: 'chooser' }], failEffects: [{ wound: 'gunshot', region: 'right_arm', severity: 0.25, to: 'chooser' }], next: 'fim' },
      ], timeout: 25, default: 'abrigo' } },
    fim('fim', 3, 'Quando os tiros param, a rua inteira está em silêncio.'),
  ] }),
  ev({ id: 'lg_horda', name: 'A horda passa', free: { acts: [4, 5] }, start: 'a', beats: [
    { id: 'a', act: 4, say: [{ thread: 'cena', from: 'sistema', text: 'O chão parece tremer. Dezenas deles descendo a rua, devagar, juntos, como uma procissão.', wait: 4 }],
      ask: { kind: 'each', text: 'A horda vem na sua direção:', options: [
        { id: 'esconder', label: '🤫 Se esconder e não respirar', check: { stat: 'stealth', base: 50, label: 'Não ser notado' }, effects: [{ stress: 8, to: 'chooser' }], fail: 'luta', next: 'fim' },
        { id: 'correr', label: '🏃 Correr para o lado oposto', check: { stat: 'athletics', base: 45, label: 'Ser mais rápido' }, fail: 'luta', next: 'fim' },
      ], timeout: 30, default: 'esconder' } },
    { id: 'luta', act: 4, say: [{ thread: 'cena', from: 'sistema', text: 'Os da frente te viram.', wait: 2 }], combat: { zombies: 3, types: ['walker', 'runner'], reason: 'A ponta da horda', win: 'fim', lose: 'fim' } },
    fim('fim', 4, 'A procissão segue rua abaixo, sem pressa nenhuma.'),
  ] }),
];

export const FREE_TRACKS: Track[] = [...FREE_LOCAL_A, ...FREE_LOCAL_B, ...FREE_LOCAL_C, ...FREE_GLOBAL];
