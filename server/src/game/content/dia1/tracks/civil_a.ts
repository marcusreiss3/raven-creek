/** Trilha civil, parte A: MECÂNICO (Oficina do Hank) e DESEMPREGADO (Edifício Harbor). */
import type { Beat } from '../types.js';

export const CIVIL_A: Beat[] = [
  // ───────────── MECÂNICO · Oficina do Hank
  { id: 'mec1', act: 1, at: 'rc_workshop', say: [
    { thread: 'cena', from: 'sistema', text: '07:00 · Oficina do Hank. Cheiro de graxa e rádio velho tocando country. Na rampa, uma picape com o motor aberto.', wait: 3 },
    { thread: 'dm:hank', from: 'Hank', text: 'Bom dia. A picape do Earl tem que estar pronta até meio-dia. O Earl tá doente, mas disse que vem buscar.' },
  ], ask: { kind: 'each', text: 'Começo de turno na oficina:', options: [
    { id: 'picape', label: '🔧 Terminar a picape do Earl', check: { stat: 'mechanics', base: 50, label: 'Consertar a picape' }, effects: [{ flag: 'picape_pronta' }], failEffects: [{ stress: 4, to: 'chooser' }], next: 'mec1b' },
    { id: 'radio', label: '📻 Mexer no rádio velho do Hank', effects: [{ flag: 'ouviu_radio', to: 'chooser' }], next: 'mec1b' },
    { id: 'cafe', label: '🍩 Rosquinha e café antes de qualquer coisa', effects: [{ stress: -5, to: 'chooser' }], next: 'mec1b' },
  ], timeout: 60 } },
  { id: 'mec1b', act: 1, say: [
    { thread: 'cena', from: 'sistema', text: 'A Dona Rosa encosta o fusca azul com o pneu murcho e o poodle no colo. "Meu filho, não dormi nada. Sirene de madrugada lá pros lados da fábrica e o Totó latindo pra parede."', wait: 5 },
  ], ask: { kind: 'poll', text: 'A Dona Rosa e o pneu furado.', options: [
    { id: 'graca', label: '🛞 Trocar de graça (é a Dona Rosa, né)', effects: [{ stress: -3 }, { flag: 'rosa_amiga' }], next: 'mec2' },
    { id: 'cobrar', label: '💵 Cobrar o preço da tabela', next: 'mec2' },
    { id: 'fofoca', label: '☕ Trocar o pneu ouvindo toda a fofoca', effects: [{ flag: 'ouviu_rosa' }], next: 'mec2' },
  ], timeout: 45 } },
  { id: 'mec2', act: 1, say: [
    { thread: 'cena', from: 'sistema', text: 'A Dona Rosa, baixinho: "A Kayla, minha vizinha, diz que a vizinha dela tá batendo a cabeça na janela desde ontem. Isso é droga, meu filho. É droga que a fábrica fez."', if: { flag: 'ouviu_rosa' }, wait: 6 },
    { thread: 'cena', from: 'sistema', text: 'No rádio, entre chiados, uma frequência militar: "…Bravo-2, cancela fechada… ninguém sai…". Depois só estática.', if: { flag: 'self:ouviu_radio' }, wait: 6 },
    { thread: 'cena', from: 'sistema', text: 'A picape do Earl liga de primeira. O Hank bate nas suas costas: "Isso aí!"', if: { flag: 'picape_pronta' }, wait: 5 },
    { thread: 'cena', from: 'sistema', text: 'O Earl chega para buscar a picape. Está cinza, suando, com a mão enrolada numa toalha. "Me dá a chave. Preciso sair da cidade."', wait: 7 },
  ], ask: { kind: 'poll', text: 'O Earl está claramente doente e quer a picape.', options: [
    { id: 'entregar', label: '🔑 Entregar a chave: o carro é dele', effects: [{ flag: 'earl_levou' }], next: 'mec3' },
    { id: 'segurar', label: '🛑 Segurar: "Earl, senta aí, você tá péssimo"', check: { stat: 'strength', base: 45, label: 'Segurar o Earl' }, effects: [{ flag: 'segurou_earl' }], failEffects: [{ wound: 'bite', region: 'right_arm', severity: 0.35, to: 'one', infect: 0.6 }, { flag: 'mordido', to: 'one' }, { flag: 'segurou_earl' }], next: 'mec3' },
  ], timeout: 45 } },
  { id: 'mec3', act: 2, say: [
    { thread: 'cena', from: 'sistema', text: 'A picape do Earl sai cantando pneu e bate no poste da esquina. Ele não sai do carro. Fica batendo a cabeça no vidro.', if: { flag: 'earl_levou' }, wait: 6 },
    { thread: 'cena', from: 'sistema', text: 'O Earl desaba na cadeira da recepção. Para de respirar. O Hank chega perto para ver. Grande erro.', if: { flag: 'segurou_earl' }, wait: 6 },
  ], effects: [{ mark: 'primeiro_morto', to: 'each' }],
    combat: { zombies: 1, types: ['walker'], reason: 'O Earl volta, e não é mais o Earl', win: 'mec4', lose: 'mec4l' } },
  { id: 'mec4l', act: 2, say: [{ thread: 'cena', from: 'sistema', text: 'Vocês se trancam no escritório. O Hank ficou do outro lado da porta. Ele parou de chamar seus nomes.', wait: 5 }], effects: [{ mark: 'deixou_para_tras', to: 'each' }, { stress: 12 }], next: 'mec4', wait: 2 },
  { id: 'mec4', act: 2, say: [
    { thread: 'cena', from: 'sistema', text: 'Silêncio na oficina. Ferramentas no chão. Lá fora, alguém grita na Rua Principal e o grito vira outra coisa.', wait: 6 },
  ], ask: { kind: 'poll', text: 'A oficina tem ferramentas e um guincho velho. Antes de sair:', options: [
    { id: 'armas', label: '🔨 Pegar ferramentas que servem de arma', effects: [{ item: 'crowbar', to: 'one' }, { item: 'wrench', to: 'one' }], next: 'mec5' },
    { id: 'guincho', label: '🚚 Tentar ligar o guincho do Hank', check: { stat: 'mechanics', base: 45, label: 'Fazer o guincho pegar' }, effects: [{ flag: 'tem_carro' }, { item: 'car_keys', to: 'one' }], failEffects: [{ stress: 5 }], next: 'mec5' },
    { id: 'combustivel', label: '⛽ Encher galões de gasolina', effects: [{ item: 'gas_can', to: 'one' }], next: 'mec5' },
  ], timeout: 50 } },
  { id: 'mec5', act: 2, say: [
    { thread: 'cena', from: 'sistema', text: 'O guincho tosse, solta fumaça e pega. O tanque está na metade.', if: { flag: 'tem_carro' }, wait: 5 },
    { thread: 'cena', from: 'sistema', text: 'Do outro lado da rua, a Lanchonete da Mabel está com as persianas abaixadas e gente lá dentro acenando.', wait: 25 },
  ], next: 'civ_cidade', wait: 10 },

  // ───────────── DESEMPREGADO · Edifício Harbor
  { id: 'des1', act: 1, at: 'rc_apartment_3b', say: [
    { thread: 'cena', from: 'sistema', text: '07:00 · Apartamento 3B, Edifício Harbor. O despertador tocou por nada: hoje não tem entrevista. A pia tem louça de três dias.', wait: 3 },
    { thread: 'dm:sindico', from: 'Síndico', text: 'Bom dia, 3B. Aluguel venceu sexta. Hoje passo aí às 10h.' },
  ], ask: { kind: 'each', text: 'O que você faz da manhã?', options: [
    { id: 'tv', label: '📺 Ligar a TV no noticiário', effects: [{ flag: 'viu_tv', to: 'chooser' }], next: 'des1b' },
    { id: 'curriculo', label: '📄 Mandar currículo pela internet', effects: [{ flag: 'curriculo', to: 'chooser' }, { stress: -3, to: 'chooser' }], next: 'des1b' },
    { id: 'janela', label: '🪟 Ficar na janela olhando a rua', effects: [{ flag: 'janela', to: 'chooser' }], next: 'des1b' },
  ], timeout: 60 } },
  { id: 'des1b', act: 1, say: [{ thread: 'cena', from: 'sistema', text: 'O celular vibra. "{familiaA}" na tela.', wait: 4 }],
    ask: { kind: 'call', target: 'each', from: '@a', text: '📞 "Oi, meu amor! E aí, alguma entrevista essa semana? O filho da Dona Carmen arrumou emprego na Ashcroft, viu? Paga bem. Quer que eu peça pra ele te indicar?"', options: [
      { id: 'sim', label: '"Pede, sim. Qualquer coisa serve."', effects: [{ flag: 'indicacao_ashcroft', to: 'chooser' }], next: 'des2' },
      { id: 'nao', label: '"Não precisa. Eu me viro."', effects: [{ stress: 3, to: 'chooser' }], next: 'des2' },
      { id: 'rejeitar', label: '(Rejeitar a ligação)', effects: [{ stress: 2, to: 'chooser' }], next: 'des2' },
    ], timeout: 40, default: 'rejeitar' } },
  { id: 'des2', act: 1, say: [
    { thread: 'cena', from: 'sistema', text: 'Na TV, o repórter na frente da Ashcroft é interrompido por um homem que agarra o braço dele. A transmissão corta para o estúdio.', if: { flag: 'self:viu_tv' }, wait: 6 },
    { thread: 'dm:rh', from: 'RH · Supermercado FoodMax', text: 'Olá! Recebemos seu currículo. Você pode vir hoje às 14h para entrevista?', if: { flag: 'self:curriculo' }, wait: 6 },
    { thread: 'cena', from: 'sistema', text: 'Lá embaixo, o carteiro está parado no meio da rua, de costas, balançando. As cartas espalhadas no chão.', if: { flag: 'self:janela' }, wait: 6 },
    { thread: 'cena', from: 'sistema', text: 'Alguém bate na sua porta. Três batidas fortes. Depois arranhões.', wait: 8 },
  ], ask: { kind: 'poll', text: 'Tem alguém (ou algo) na porta do 3B.', options: [
    { id: 'olho', label: '👁️ Olhar pelo olho mágico', check: { stat: 'perception', base: 50, label: 'Reconhecer quem é' }, effects: [{ flag: 'viu_sindico' }], failEffects: [{ stress: 6 }], next: 'des3' },
    { id: 'abrir', label: '🚪 Abrir a porta ("deve ser o síndico")', effects: [{ flag: 'abriu_porta' }], next: 'des3' },
    { id: 'barricada', label: '🛋️ Empurrar o sofá contra a porta', check: { stat: 'strength', base: 45, label: 'Arrastar o sofá a tempo' }, effects: [{ flag: 'barricou' }], next: 'des3' },
  ], timeout: 40 } },
  { id: 'des3', act: 2, say: [
    { thread: 'cena', from: 'sistema', text: 'É o síndico. Metade do rosto dele não está mais lá.', if: { flag: 'viu_sindico' }, wait: 5 },
    { thread: 'cena', from: 'sistema', text: 'O síndico cai para dentro do apartamento. Ele não quer o aluguel.', if: { flag: 'abriu_porta' }, wait: 5 },
    { thread: 'cena', from: 'sistema', text: 'A porta treme contra o sofá. Do corredor, gritos dos vizinhos do 3A.', if: { flag: 'barricou' }, wait: 5 },
  ], next: 'des3r', wait: 2 },
  { id: 'des3r', act: 2, if: { notFlag: 'barricou' }, next: 'des4', else: 'des3b' },
  { id: 'des4', act: 2, effects: [{ mark: 'primeiro_morto', to: 'each' }], combat: { zombies: 1, types: ['walker'], reason: 'O síndico do Edifício Harbor', win: 'des5', lose: 'des5l' } },
  { id: 'des3b', act: 2, say: [{ thread: 'cena', from: 'sistema', text: 'Depois de dez minutos, o barulho no corredor muda de direção. Desce as escadas.', wait: 6 }], next: 'des5', wait: 2 },
  { id: 'des5l', act: 2, say: [{ thread: 'cena', from: 'sistema', text: 'Vocês fogem pela escada de incêndio, mancando, deixando tudo para trás.', wait: 4 }], effects: [{ stress: 10 }], next: 'des5', wait: 2 },
  { id: 'des5', act: 2, at: 'rc_apartments', say: [
    { thread: 'cena', from: 'sistema', text: 'Hall do Edifício Harbor. A Sra. Kim, do 5A, desce as escadas com uma criança no colo: "O pai dela não voltou do trabalho. Eu não sei o que fazer."', wait: 6 },
  ], ask: { kind: 'poll', text: 'A Sra. Kim e a menina.', options: [
    { id: 'levar', label: '🧒 Levar as duas junto', effects: [{ mark: 'salvou_crianca', to: 'each' }, { flag: 'com_criancas' }], next: 'des5b' },
    { id: 'conselho', label: '🏠 "Fiquem trancadas no 5A, a gente volta"', effects: [{ flag: 'prometeu_voltar' }], next: 'des5b' },
    { id: 'saquear', label: '🔑 Pegar a chave mestra do síndico e esvaziar o depósito do prédio', effects: [{ mark: 'saqueador', to: 'each' }, { item: 'canned_beans', qty: 2, to: 'one' }, { item: 'flashlight', to: 'one' }], next: 'des5b' },
  ], timeout: 45 } },
  { id: 'des5b', act: 2, at: 'rc_apartments', say: [
    { thread: 'cena', from: 'sistema', text: 'A porta do prédio abre. É o Sr. Kim, o marido, com a camisa rasgada e o pescoço sangrando. "Querida! Eu consegui voltar…" A filha corre na direção dele.', wait: 5 },
  ], ask: { kind: 'poll', text: 'A menina está correndo para o pai mordido.', options: [
    { id: 'segurar', label: '🧒 Segurar a menina', check: { stat: 'agility', base: 50, label: 'Pegar a menina a tempo' }, effects: [{ mark: 'salvou_crianca', to: 'chooser' }], failEffects: [{ stress: 12 }], next: 'des5c' },
    { id: 'deixar', label: '😶 Deixar a família se abraçar', effects: [{ stress: 6 }], next: 'des5c' },
  ], timeout: 25 } },
  { id: 'des5c', act: 2, say: [
    { thread: 'cena', from: 'sistema', text: 'O Sr. Kim cai de joelhos no hall. A Sra. Kim entende antes de todo mundo. Ela pega a filha no colo e olha para vocês: "Tira a gente daqui."', wait: 6 },
  ], next: 'des6', wait: 4 },
  { id: 'des6', act: 2, say: [
    { thread: 'cena', from: 'sistema', text: 'Na rua, uma única porta aberta com gente lá dentro: a Lanchonete da Mabel, do outro lado da Rua Principal.', wait: 25 },
  ], next: 'civ_cidade', wait: 10 },
];
