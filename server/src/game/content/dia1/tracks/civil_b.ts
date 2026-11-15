/** Trilha civil, parte B: ATLETA (corrida matinal), PROFESSOR (Escola Lincoln), COZINHEIRO (Lanchonete) e MARCENEIRO. */
import type { Beat } from '../types.js';

export const CIVIL_B: Beat[] = [
  // ───────────── ATLETA · corrida matinal que cruza a cidade
  { id: 'atl1', act: 1, at: 'res_avenue', say: [
    { thread: 'cena', from: 'sistema', text: '07:00 · Avenida Willow. Fone no ouvido, 5 km no relógio, a cidade ainda acordando. Treino de segunda.', wait: 3 },
    { thread: 'dm:tecnico', from: 'Técnico Briggs', text: 'Bom dia! Hoje é intervalado: 10 tiros de 400m na pista da escola às 8h. Não se atrasa.' },
  ], ask: { kind: 'each', text: 'Na corrida, você escolhe o caminho:', options: [
    { id: 'parque', label: '🌳 Pela Praça do Bairro', effects: [{ flag: 'praca', to: 'chooser' }], next: 'atl1b' },
    { id: 'centro', label: '🏙️ Pela Rua Principal', effects: [{ flag: 'centro', to: 'chooser' }], next: 'atl1b' },
  ], timeout: 50 } },
  { id: 'atl1b', act: 1, say: [
    { thread: 'grupo', from: 'Time de Atletismo', text: 'Briggs: quem chegar atrasado paga 20 flexões 😤', wait: 4 },
    { thread: 'grupo', from: 'Time de Atletismo', text: 'Danny: alguém viu o vídeo do cara mordendo o frentista no posto?? kkkkk', wait: 5 },
  ], ask: { kind: 'each', text: 'No grupo do time, você responde:', options: [
    { id: 'zoar', label: '😂 "kkkk deve ser bêbado"', next: 'atl2' },
    { id: 'serio', label: '😐 "Isso não tem graça, Danny."', next: 'atl2' },
    { id: 'ignorar', label: '🎧 Aumentar o volume e ignorar', effects: [{ stress: -3, to: 'chooser' }], next: 'atl2' },
  ], timeout: 35, default: 'ignorar' } },
  { id: 'atl2', act: 1, say: [
    { thread: 'cena', from: 'sistema', text: 'Na praça, um homem de terno está ajoelhado sobre um cachorro, de costas. O cachorro não late mais.', if: { flag: 'self:praca' }, wait: 6 },
    { thread: 'cena', from: 'sistema', text: 'Na Rua Principal, uma viatura passa voando de sirene ligada. Depois outra. Na porta do Posto Gulf, uma poça escura.', if: { flag: 'self:centro' }, wait: 6 },
    { thread: 'cena', from: 'sistema', text: 'Alguém vem correndo na sua direção. Não é corredor: é um homem de macacão branco, mancando rápido demais, a boca aberta.', wait: 6 },
  ], ask: { kind: 'poll', text: 'Ele está vindo direto em você.', options: [
    { id: 'correr', label: '🏃 Correr. É o que você faz de melhor.', expert: ['athlete'], check: { stat: 'athletics', base: 55, label: 'Deixar ele para trás' }, effects: [{ flag: 'escapou' }], failEffects: [{ wound: 'scratch', region: 'left_leg', severity: 0.3, to: 'one', infect: 0.3 }, { flag: 'escapou' }], next: 'atl3' },
    { id: 'enfrentar', label: '👊 Parar e enfrentar', effects: [{ mark: 'primeiro_morto', to: 'each' }], next: 'atl2c' },
  ], timeout: 25 } },
  { id: 'atl2c', act: 1, combat: { zombies: 1, types: ['runner'], reason: 'Um infectado corredor na sua rota de treino', win: 'atl3', lose: 'atl3l' } },
  { id: 'atl3l', act: 1, say: [{ thread: 'cena', from: 'sistema', text: 'Você se arrasta para dentro de um quintal e se esconde atrás de uma lixeira até ele perder o interesse.', wait: 5 }], effects: [{ stress: 10 }], next: 'atl3', wait: 2 },
  { id: 'atl3', act: 2, at: 'rc_school_gym', say: [
    { thread: 'cena', from: 'sistema', text: 'Ginásio da Escola Lincoln. O Técnico Briggs está trancando as portas com corrente. "Entra, entra! Tem gente estranha na rua. Os moleques do time estão aqui."', wait: 5 },
  ], ask: { kind: 'poll', text: 'Oito adolescentes do time de atletismo, assustados, olhando para você.', options: [
    { id: 'liderar', label: '📣 Organizar os moleques: ninguém sai sem ordem', effects: [{ flag: 'liderou_time' }, { stress: -4 }], next: 'atl3b' },
    { id: 'pais', label: '📱 Ajudar a ligar para os pais de cada um', effects: [{ flag: 'ligou_pais' }, { battery: -8, to: 'one' }], next: 'atl3b' },
  ], timeout: 45 } },
  { id: 'atl3b', act: 2, say: [
    { thread: 'cena', from: 'sistema', text: 'O Danny, o mais rápido do time, empurra a porta lateral do ginásio: "Vou ver minha mãe. Ela trabalha no posto Gulf." E sai correndo.', wait: 5 },
  ], ask: { kind: 'poll', text: 'O Danny correu para a rua.', options: [
    { id: 'buscar', label: '🏃 Ir atrás dele (você é mais rápido)', expert: ['athlete'], check: { stat: 'athletics', base: 50, label: 'Alcançar o Danny' }, effects: [{ mark: 'salvou_crianca', to: 'chooser' }, { flag: 'trouxe_danny' }], failEffects: [{ wound: 'scratch', region: 'right_arm', severity: 0.25, to: 'one', infect: 0.3 }, { stress: 10 }], next: 'atl3c' },
    { id: 'ficar', label: '🔒 Trancar a porta. Não dá para arriscar os outros.', effects: [{ mark: 'deixou_para_tras', to: 'each' }, { stress: 8 }], next: 'atl3c' },
  ], timeout: 30 } },
  { id: 'atl3c', act: 2, say: [
    { thread: 'cena', from: 'sistema', text: 'Do vestiário, um barulho de armário caindo. O zelador do ginásio sai de lá cambaleando, de olhos brancos.', wait: 4 },
  ], combat: { zombies: 1, types: ['walker'], reason: 'O zelador do ginásio da Escola Lincoln', win: 'atl4', lose: 'atl3l2' } },
  { id: 'atl3l2', act: 2, say: [{ thread: 'cena', from: 'sistema', text: 'Vocês trancam o zelador no vestiário com um banco atravessado na porta.', wait: 4 }], effects: [{ stress: 8 }], next: 'atl4', wait: 2 },
  { id: 'atl4', act: 2, say: [
    { thread: 'cena', from: 'sistema', text: 'Os pais chegam um por um, em pânico. Sobram dois garotos que ninguém veio buscar.', if: { flag: 'ligou_pais' }, wait: 6 },
    { thread: 'cena', from: 'sistema', text: 'Os garotos fazem fila, quietos. Um deles pergunta se o mundo vai acabar. O Briggs não responde.', if: { flag: 'liderou_time' }, wait: 6 },
    { thread: 'dm:tecnico', from: 'Técnico Briggs', text: 'Leva os que sobraram até a Lanchonete da Mabel. A Mabel conhece todo mundo, vai achar os pais. Eu fico pra trancar a escola.', wait: 7 },
  ], ask: { kind: 'poll', text: 'Levar os garotos até a lanchonete?', options: [
    { id: 'levar', label: '🧒 Levar os garotos', effects: [{ mark: 'salvou_crianca', to: 'each' }, { flag: 'com_criancas' }], next: 'civ_cidade' },
    { id: 'sozinho', label: '🏃 Ir sozinho, mais rápido, e mandar ajuda', effects: [{ mark: 'deixou_para_tras', to: 'each' }], next: 'civ_cidade' },
  ], timeout: 40 } },

  // ───────────── PROFESSOR · Escola Lincoln
  { id: 'prof1', act: 1, at: 'rc_school_classrooms', say: [
    { thread: 'cena', from: 'sistema', text: '07:00 · Escola Lincoln, sala 12. Vinte e três alunos, chamada, cheiro de giz. Três carteiras vazias: os filhos dos funcionários da Ashcroft.', wait: 3 },
    { thread: 'dm:diretora', from: 'Diretora Hale', text: 'Bom dia. Aula normal, por favor. Não comentem nada sobre a fábrica com as crianças.' },
  ], ask: { kind: 'each', text: 'A aula começa.', options: [
    { id: 'aula', label: '📚 Dar a aula como se nada estivesse acontecendo', effects: [{ stress: -3, to: 'chooser' }], next: 'prof1b' },
    { id: 'conversa', label: '💬 Conversar com as crianças sobre o que elas ouviram', effects: [{ flag: 'ouviu_criancas', to: 'chooser' }], next: 'prof1b' },
  ], timeout: 50 } },
  { id: 'prof1b', act: 1, say: [
    { thread: 'cena', from: 'sistema', text: 'O Tommy, do fundo da sala, joga uma bolinha de papel na nuca da menina da frente. A sala inteira ri. Você tem 23 pares de olhos esperando sua reação.', wait: 5 },
  ], ask: { kind: 'poll', text: 'O Tommy de novo.', options: [
    { id: 'diretoria', label: '📋 Mandar para a diretoria', next: 'prof2' },
    { id: 'conversa', label: '🗣️ Conversar com ele no corredor', effects: [{ flag: 'tommy_ok' }], next: 'prof2' },
    { id: 'prova', label: '📝 "Prova surpresa pra todo mundo." (silêncio total)', effects: [{ stress: -2 }], next: 'prof2' },
  ], timeout: 40 } },
  { id: 'prof2', act: 1, say: [
    { thread: 'cena', from: 'sistema', text: 'Uma menina conta: "Meu pai trabalha no Setor B. Ele disse que se a sirene tocasse de noite era pra gente ir embora da cidade. A sirene tocou."', if: { flag: 'self:ouviu_criancas' }, wait: 6 },
    { thread: 'cena', from: 'sistema', text: 'O alarme de incêndio da escola dispara. Não tem fumaça.', wait: 6 },
  ], ask: { kind: 'poll', text: 'O alarme tocou. As crianças olham para vocês.', options: [
    { id: 'evacuar', label: '🚸 Evacuar pela saída de emergência, em fila', check: { stat: 'intellect', base: 50, label: 'Manter a calma das crianças' }, effects: [{ flag: 'evacuou' }], failEffects: [{ flag: 'evacuou' }, { stress: 8 }, { flag: 'perdeu_aluno' }], next: 'prof3' },
    { id: 'trancar', label: '🔒 Trancar a sala até entender o que é', effects: [{ flag: 'trancou_sala' }], next: 'prof3' },
  ], timeout: 35 } },
  { id: 'prof3', act: 2, say: [
    { thread: 'cena', from: 'sistema', text: 'Na contagem do pátio, falta um aluno: o Danny. Alguém viu ele correr para o ginásio.', if: { flag: 'perdeu_aluno' }, wait: 6 },
    { thread: 'cena', from: 'sistema', text: 'Pela janela da sala, vocês veem o zelador andando no pátio. Ele morde a mão da Diretora Hale quando ela vai ajudá-lo.', if: { flag: 'trancou_sala' }, wait: 6 },
    { thread: 'cena', from: 'sistema', text: 'Os pais começam a chegar aos gritos. Algumas crianças vão. Outras ficam, olhando o portão.', wait: 8 },
  ], effects: [{ mark: 'primeiro_morto', to: 'each' }], ask: { kind: 'poll', text: 'Sobraram cinco crianças sem ninguém.', options: [
    { id: 'levar', label: '🧒 Levar as cinco até a Lanchonete da Mabel (é perto)', effects: [{ mark: 'salvou_crianca', to: 'each' }, { flag: 'com_criancas' }], next: 'prof3b' },
    { id: 'ficar', label: '🏫 Ficar na escola esperando os pais', effects: [{ flag: 'ficou_escola' }], next: 'prof3b' },
  ], timeout: 45 } },
  { id: 'prof4b', act: 2, say: [{ thread: 'cena', from: 'sistema', text: 'Meia hora. Ninguém mais vem buscar ninguém. Vocês saem com as crianças pelo portão dos fundos.', wait: 6 }], effects: [{ flag: 'com_criancas' }, { stress: 8 }], next: 'prof4', wait: 2 },
  { id: 'prof3b', act: 2, at: 'rc_school', say: [
    { thread: 'cena', from: 'sistema', text: 'No portão, um pai de macacão da Ashcroft, pálido e tremendo, estende a mão: "Vem, Lucy. O papai chegou." A Lucy dá um passo. O braço dele está enfaixado e escuro.', wait: 6 },
  ], ask: { kind: 'poll', text: 'O pai da Lucy quer levar a filha.', options: [
    { id: 'entregar', label: '👨‍👧 Entregar: é o pai dela', effects: [{ stress: 10 }, { flag: 'lucy_foi' }], next: 'prof3c' },
    { id: 'segurar', label: '✋ "Senhor, o senhor precisa de um médico primeiro."', check: { stat: 'intellect', base: 45, label: 'Convencer sem escândalo' }, effects: [{ mark: 'salvou_crianca', to: 'chooser' }], failEffects: [{ wound: 'scratch', region: 'left_arm', severity: 0.25, to: 'one', infect: 0.3 }, { mark: 'salvou_crianca', to: 'chooser' }], next: 'prof3c' },
  ], timeout: 35 } },
  { id: 'prof3c', act: 2, say: [
    { thread: 'cena', from: 'sistema', text: 'Do refeitório, o som de bandejas caindo e algo batendo nas portas duplas por dentro. As merendeiras não saíram de lá.', wait: 5 },
  ], combat: { zombies: 2, types: ['walker'], reason: 'As portas do refeitório da Escola Lincoln cedem', win: 'prof3d', lose: 'prof3d' } },
  { id: 'prof3d', act: 2, if: { flag: 'ficou_escola' }, next: 'prof4b', else: 'prof4' },
  { id: 'prof4', act: 2, at: 'rc_main_street', say: [{ thread: 'cena', from: 'sistema', text: 'Rua Principal, de mãos dadas em fila indiana. Uma criança chora baixinho. Vocês não olham para os lados.', wait: 25 }], next: 'civ_cidade', wait: 5 },

  // ───────────── COZINHEIRO · Lanchonete da Mabel
  { id: 'coz1', act: 1, at: 'rc_restaurant', say: [
    { thread: 'cena', from: 'sistema', text: '07:00 · Lanchonete da Mabel. Chapa quente, panquecas, café passado. Os clientes de sempre no balcão.', wait: 3 },
    { thread: 'dm:mabel', from: 'Mabel', text: 'Bom dia, querido(a)! Segunda é dia de bacon. E fica de olho no Earl, ele tá tossindo em cima das panquecas de todo mundo.' },
  ], ask: { kind: 'each', text: 'Na cozinha:', options: [
    { id: 'chapa', label: '🥞 Tocar a chapa, fila grande hoje', effects: [{ flag: 'chapa', to: 'chooser' }], next: 'coz1b' },
    { id: 'estoque', label: '📦 Conferir o estoque da despensa', effects: [{ flag: 'viu_estoque' }], next: 'coz1b' },
  ], timeout: 50 } },
  { id: 'coz1b', act: 1, say: [
    { thread: 'cena', from: 'sistema', text: 'No balcão, o Sargento Doyle, da delegacia, devora panqueca com bacon e reclama do café. "Hoje vai ser tranquilo, Mabel. Segunda é sempre tranquila."', wait: 5 },
  ], ask: { kind: 'poll', text: 'A cozinha a todo vapor.', options: [
    { id: 'especial', label: '🥓 Caprichar no prato do Sargento (bacon extra)', effects: [{ flag: 'doyle_feliz' }, { stress: -2 }], next: 'coz2' },
    { id: 'ritmo', label: '⏱️ Acelerar a fila, tem gente esperando', next: 'coz2' },
  ], timeout: 40 } },
  { id: 'coz2', act: 1, say: [
    { thread: 'cena', from: 'sistema', text: 'Despensa: enlatados para umas duas semanas, se ninguém comer demais. Uma porta dos fundos que dá para o beco.', if: { flag: 'viu_estoque' }, wait: 5 },
    { thread: 'cena', from: 'sistema', text: 'O Earl vai ao banheiro e não volta. Vinte minutos depois, a porta do banheiro começa a bater.', wait: 8 },
  ], next: 'coz3', wait: 25 },
  { id: 'coz3', act: 2, say: [
    { thread: 'cena', from: 'sistema', text: 'A Mabel abre a porta do banheiro para ver se o Earl está bem. Ele está "bem". Ele está em cima dela.', wait: 4 },
  ], effects: [{ mark: 'primeiro_morto', to: 'each' }], ask: { kind: 'poll', text: 'O Earl está em cima da Mabel no corredor do banheiro.', options: [
    { id: 'frigideira', label: '🍳 Frigideira na cabeça dele', check: { stat: 'strength', base: 50, label: 'Acertar com força' }, effects: [{ mark: 'primeiro_sangue', to: 'chooser' }, { flag: 'salvou_mabel' }], failEffects: [{ wound: 'bite', region: 'left_hand', severity: 0.3, to: 'one', infect: 0.6 }, { flag: 'mordido', to: 'one' }], next: 'coz4' },
    { id: 'clientes', label: '🚪 Tirar os clientes pela frente e fechar a cozinha', effects: [{ mark: 'deixou_para_tras', to: 'each' }, { flag: 'mabel_perdida' }], next: 'coz4' },
  ], timeout: 25 } },
  { id: 'coz4', act: 2, say: [
    { thread: 'cena', from: 'sistema', text: 'A Mabel sobrevive, com um corte feio no ombro. "Fecha as persianas. Essa lanchonete já sobreviveu a duas enchentes."', if: { flag: 'salvou_mabel' }, wait: 6 },
    { thread: 'cena', from: 'sistema', text: 'Na calçada, vocês ouvem a Mabel chamar seu nome de dentro da cozinha. Depois ela para.', if: { flag: 'mabel_perdida' }, wait: 6 },
  ], ask: { kind: 'poll', text: 'Gente da rua está batendo nas persianas pedindo para entrar.', options: [
    { id: 'abrir', label: '🚪 Abrir: aqui tem comida e porta forte', effects: [{ mark: 'protegeu_estranho', to: 'each' }, { flag: 'lanchonete_aberta' }], next: 'coz5' },
    { id: 'estoque', label: '🥫 Encher a mochila de comida antes de tudo', effects: [{ item: 'canned_soup', qty: 2, to: 'one' }, { item: 'kitchen_knife', to: 'one' }, { mark: 'saqueador', to: 'chooser' }], next: 'coz5' },
  ], timeout: 40 } },

  // ───────────── MARCENEIRO · Armazém B
  { id: 'coz5', act: 2, say: [
    { thread: 'cena', from: 'sistema', text: 'Da câmara fria, um choro baixinho. Atrás das caixas de carne, uma garçonete encolhida, abraçada aos joelhos. "Eu vi o Earl. Eu vi o que ele fez com a Mabel."', wait: 6 },
  ], ask: { kind: 'poll', text: 'A garçonete escondida na câmara fria.', options: [
    { id: 'acolher', label: '🫂 Tirar ela de lá, cobertor e café', effects: [{ mark: 'protegeu_estranho', to: 'each' }, { stress: -3 }], next: 'civ_cidade' },
    { id: 'interrogar', label: '❓ "Ela foi mordida? Mostra os braços."', check: { stat: 'perception', base: 45, label: 'Perceber se ela esconde algo' }, effects: [{ flag: 'garconete_limpa' }], failEffects: [{ stress: 6 }], next: 'civ_cidade' },
  ], timeout: 40 } },
  { id: 'mar1', act: 1, at: 'in_warehouse_b', say: [
    { thread: 'cena', from: 'sistema', text: '07:00 · Armazém B, Materiais de Construção. Pilhas de tábuas, pregos, o barulho da serra. Encomenda grande da prefeitura: tapumes para a obra da ponte.', wait: 3 },
    { thread: 'dm:capataz', from: 'Capataz Dale', text: 'Bom dia. A prefeitura mudou a encomenda: agora querem tapume pra fechar janelas do hospital. Pra hoje. Ninguém me explicou por quê.' },
  ], ask: { kind: 'poll', text: 'A encomenda estranha da prefeitura.', options: [
    { id: 'fazer', label: '🪚 Cortar os tapumes e entregar no hospital', check: { stat: 'carpentry', base: 50, label: 'Cortar rápido e certo' }, effects: [{ flag: 'tapumes' }], failEffects: [{ wound: 'cut_shallow', region: 'left_hand', severity: 0.25, to: 'one' }, { flag: 'tapumes' }], next: 'mar1b' },
    { id: 'perguntar', label: '📞 Ligar para a prefeitura e perguntar o que está havendo', effects: [{ flag: 'ligou_prefeitura' }], next: 'mar1b' },
  ], timeout: 50 } },
  { id: 'mar1b', act: 1, say: [
    { thread: 'cena', from: 'sistema', text: 'O Jake, aprendiz de dezenove anos, corta a ponta do dedo na serra circular. Sangue na tábua inteira. Ele fica olhando, pálido, sem gritar.', wait: 4 },
  ], ask: { kind: 'poll', text: 'O dedo do Jake.', options: [
    { id: 'curativo', label: '🩹 Garrote, gelo e pano limpo', check: { stat: 'medicine', base: 45, label: 'Estancar o sangramento' }, effects: [{ mark: 'mao_firme', to: 'chooser' }], failEffects: [{ stress: 6 }], next: 'mar2' },
    { id: 'hospital', label: '🚗 Levar o Jake ao hospital no caminhão', effects: [{ flag: 'jake_hospital' }], next: 'mar2' },
  ], timeout: 35 } },
  { id: 'mar2', act: 1, say: [
    { thread: 'dm:prefeitura', from: 'Prefeitura', text: 'É precaução. Não há motivo para alarme. Entreguem os tapumes, por favor.', if: { flag: 'ligou_prefeitura' }, wait: 5 },
    { thread: 'cena', from: 'sistema', text: 'O Dale vai fumar no pátio e volta com a mão sangrando. "Um maluco da Ashcroft pulou o muro e me mordeu. Me passa o kit de primeiros socorros."', wait: 7 },
  ], next: 'mar3', wait: 30 },
  { id: 'mar3', act: 2, say: [
    { thread: 'cena', from: 'sistema', text: 'Uma hora depois, o Dale desmaia em cima da bancada. Quando levanta, a primeira coisa que faz é avançar no aprendiz.', wait: 5 },
  ], effects: [{ mark: 'primeiro_morto', to: 'each' }], combat: { zombies: 1, types: ['walker'], reason: 'O Capataz Dale no Armazém B', win: 'mar4', lose: 'mar4l' } },
  { id: 'mar4l', act: 2, say: [{ thread: 'cena', from: 'sistema', text: 'Vocês se trancam no escritório do armazém e saem pela janela, sem olhar para trás.', wait: 4 }], effects: [{ stress: 10 }], next: 'mar4', wait: 2 },
  { id: 'mar4', act: 2, say: [{ thread: 'cena', from: 'sistema', text: 'O caminhão de entrega ainda está carregado de tábuas, pregos e martelos.', wait: 5 }],
    ask: { kind: 'poll', text: 'Antes de sair do armazém:', options: [
      { id: 'material', label: '🔨 Levar martelo, pregos e tábuas (barricadas!)', effects: [{ item: 'hammer', to: 'one' }, { item: 'nails', qty: 10, to: 'one' }, { item: 'plank', qty: 2, to: 'one' }, { flag: 'barricadeiros' }], next: 'mar5' },
      { id: 'caminhao', label: '🚚 Sair com o caminhão de entrega', check: { stat: 'agility', base: 50, label: 'Dirigir no meio do caos' }, effects: [{ flag: 'tem_carro' }], failEffects: [{ wound: 'bruise', region: 'head', severity: 0.3, to: 'one' }], next: 'mar5' },
    ], timeout: 45 } },
  { id: 'mar5', act: 2, at: 'rc_main_street', say: [{ thread: 'cena', from: 'sistema', text: 'Vocês chegam à Rua Principal. A única porta aberta com gente viva é a da Lanchonete da Mabel.', wait: 20 }], next: 'civ_cidade', wait: 5 },
];
