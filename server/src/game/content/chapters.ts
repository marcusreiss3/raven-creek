/**
 * Capítulos da história: eventos GLOBAIS que a administração ativa quando quiser (painel → História),
 * para fazer a lore do RP avançar. Cada capítulo:
 *  - abre um boletim em tela cheia para todo mundo (quem está desconectado vê ao entrar);
 *  - fica registrado no diário de todos os personagens vivos;
 *  - pode falar no rádio (88.1, Rádio KRVN), narrar em locais específicos e mexer no mundo (efeitos).
 *
 * A ordem sugerida conta um arco: o helicóptero do forte cai (e uma carta fala de um lugar seguro) → a verdade sobre o prefeito → a Ashcroft queima →
 * os sinos chamam os mortos → o exército corta a ponte → uma luz do outro lado do túnel.
 */

export type ChapterEffect =
  /** Caixote com itens deixado num local (qualquer um pode abrir). */
  | { type: 'crate'; locationId: string; name: string; items: { itemId: string; qty: number }[] }
  /** Mais infectados vagando num local. */
  | { type: 'zombies'; locationId: string; add: number }
  /** Nova horda perto de um local, indo para um alvo. */
  | { type: 'horde'; nearLocationId: string; targetLocationId: string; size?: number }
  /** Todas as hordas ativas mudam de rumo para este local. */
  | { type: 'retarget_hordes'; targetLocationId: string }
  | { type: 'weather'; weather: 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog' | 'snow' }
  /** Muda o perigo de um local (0 a 1). */
  | { type: 'danger'; locationId: string; danger: number }
  /** Bloqueia uma estrada (dá para reabrir no painel → Mundo → conexões). */
  | { type: 'block_road'; fromId: string; toId: string; reason: string }
  /** Estresse para todos os personagens vivos. */
  | { type: 'stress'; amount: number };

export type Chapter = {
  id: string; order: number; title: string;
  /** Capítulo com roteiro próprio (ver services/heli.ts): não usa boletim nem efeitos simples. */
  special?: 'heli';
  /** Para a administração: o que acontece e por quê, em uma ou duas frases. */
  summary: string;
  bulletin: { kicker: string; title: string; text: string };
  radio?: { author: string; text: string }[];
  /** Narração no chat local de lugares específicos. */
  emotes?: { locationId: string; text: string }[];
  effects: ChapterEffect[];
};

const KRVN = 'Rádio KRVN';

export const CHAPTERS: Chapter[] = [
  {
    id: 'queda_helicoptero', order: 1, title: 'A queda do Corvo 2-1', special: 'heli',
    summary: 'Um helicóptero do Fort Ashby sobrevoa o condado, entra em pane e cai na plantação da Fazenda Miller. Quem tem rádio (ou está junto de quem tem) ouve a tripulação ao vivo até a queda; os outros veem o helicóptero passar e fazem um teste de 1d6 (3+) para deduzir onde caiu. No local: 10 infectados (a tripulação virou) que precisam ser eliminados num tabuleiro próprio antes de vasculhar; depois, 6 buscas com loot militar e uma carta que fala de um lugar seguro. Leva uns 2 minutos e meio do início até a queda.',
    bulletin: { kicker: 'Fort Ashby', title: 'A queda do Corvo 2-1', text: '' },
    effects: [],
  },
  {
    id: 'fita_prefeito', order: 2, title: 'A fita do prefeito',
    summary: 'A KRVN toca uma gravação do prefeito Harlan Doyle admitindo que sabia do vazamento na Ashcroft desde a primeira semana e aceitou dinheiro para calar. Puramente narrativo (e pesa no humor de todos); conversa com o mistério do cofre e com o "Paciente zero".',
    bulletin: {
      kicker: 'Rádio KRVN, gravação encontrada',
      title: '"Eu sabia."',
      text: 'Alguém achou uma fita na Prefeitura e a entregou à KRVN. A voz é inconfundível — o prefeito Harlan Doyle, cansado, bêbado talvez:\n\n"Ashcroft me ligou no dia 2. Um vazamento no Laboratório B. Disse que estava contido. Disse que, se a cidade soubesse, a fábrica fechava e Raven Creek morria junto. Ele pagou. Eu aceitei. Quando o Fort Ashby mandou a Ordem 7, eu assinei sem ler. Que Deus me perdoe, porque vocês não vão."\n\nA fita termina com o som de uma porta de cofre se fechando.',
    },
    radio: [{ author: KRVN, text: 'Vamos repetir a gravação de hora em hora. Vocês merecem saber quem trancou vocês aqui dentro.' }],
    emotes: [{ locationId: 'rc_city_hall', text: 'O gabinete do prefeito está revirado. Na mesa, um gravador de fita aberto e vazio. Alguém esteve aqui antes de você.' }],
    effects: [{ type: 'stress', amount: 8 }],
  },
  {
    id: 'ashcroft_chamas', order: 3, title: 'Ashcroft em chamas',
    summary: 'Uma explosão no subsolo da fábrica Ashcroft (Laboratório B). Neblina de fumaça cobre o condado, o chão de fábrica fica muito mais perigoso e uma horda sai do distrito industrial rumo ao centro. Quem quiser as respostas do laboratório tem pouco tempo.',
    bulletin: {
      kicker: 'Distrito Industrial',
      title: 'Ashcroft em chamas',
      text: 'Às 3 da manhã, um estrondo seco acorda o condado inteiro. Uma coluna de fumaça preta sobe da Fábrica Ashcroft, iluminada por baixo por um fogo verde-azulado que não parece fogo de verdade.\n\nAlguém — ou alguma coisa — explodiu o Laboratório B. Se havia provas lá embaixo, estão queimando agora. E o que estava preso nas câmaras frias está andando para fora, junto com a fumaça.',
    },
    radio: [{ author: KRVN, text: 'Fumaça densa vindo da Ashcroft. Não respirem isso sem máscara. Repito: fiquem longe do distrito industrial. Uma horda está saindo de lá para o centro.' }],
    emotes: [
      { locationId: 'in_factory_floor', text: 'O chão treme. Do alçapão do subsolo sai fumaça azulada e um calor de forno. Lá embaixo, algo bate contra o metal.' },
      { locationId: 'in_gate', text: 'O céu sobre a fábrica está laranja. Vultos cambaleiam para fora do portão, alguns ainda pegando fogo.' },
      { locationId: 'rc_main_street', text: 'Uma fumaça escura e com cheiro químico desce sobre a cidade, vinda do leste.' },
    ],
    effects: [
      { type: 'weather', weather: 'fog' },
      { type: 'zombies', locationId: 'in_factory_floor', add: 8 },
      { type: 'zombies', locationId: 'in_factory_office', add: 4 },
      { type: 'danger', locationId: 'in_factory_floor', danger: 0.85 },
      { type: 'horde', nearLocationId: 'in_gate', targetLocationId: 'rc_main_street', size: 20 },
    ],
  },
  {
    id: 'sinos_sao_jorge', order: 4, title: 'Os sinos de São Jorge',
    summary: 'Alguém trancado na torre da Igreja de São Jorge começa a tocar os sinos sem parar. Todas as hordas mudam de rumo para a igreja. Dilema para os jogadores: salvar quem toca (o pastor Elias Grant?) ou aproveitar para saquear o resto da cidade.',
    bulletin: {
      kicker: 'Centro de Raven Creek',
      title: 'Os sinos não param',
      text: 'Começou ao meio-dia e não parou mais. Os sinos da Igreja de São Jorge tocam como em dia de festa — longos, insistentes, desesperados.\n\nAlguém está lá em cima, na torre, e quer ser encontrado. Ou quer que os mortos o encontrem primeiro. De todos os cantos do condado, as hordas viram a cabeça na mesma direção e começam a andar.',
    },
    radio: [{ author: KRVN, text: 'Todas as hordas que a gente acompanha mudaram de rumo. Todas. Estão indo para a Igreja de São Jorge. Se vocês estão no centro, saiam — ou subam naquela torre e façam aquilo parar.' }],
    emotes: [
      { locationId: 'rc_church', text: 'Os sinos ensurdecem. A porta da torre está trancada por dentro, e alguém grita lá de cima entre uma badalada e outra: "Eles precisam vir! Todos eles!"' },
      { locationId: 'rc_main_street', text: 'Os sinos da igreja ecoam pela avenida sem parar. Das vielas, os infectados começam a sair, todos andando para o mesmo lado.' },
    ],
    effects: [
      { type: 'retarget_hordes', targetLocationId: 'rc_church' },
      { type: 'horde', nearLocationId: 'rc_church', targetLocationId: 'rc_church', size: 18 },
      { type: 'zombies', locationId: 'rc_church', add: 4 },
    ],
  },
  {
    id: 'ponte_dinamitada', order: 5, title: 'A ponte',
    summary: 'O exército dinamita o acesso oeste da Ponte do Rio Raven para conter o surto. A estrada entre a Encruzilhada da Rodovia 9 e a ponte fica bloqueada (o resto do mapa continua ligado, por caminhos mais longos). Reabra no painel → Mundo quando a história pedir.',
    bulletin: {
      kicker: 'Rodovia 9',
      title: 'O exército fecha o rio',
      text: 'Três explosões em sequência, tão fortes que vidros racham no centro da cidade. Quando a poeira baixa, o acesso oeste da Ponte do Rio Raven não existe mais: só ferro retorcido pendurado sobre a água.\n\nNa frequência militar, uma voz que não é a do sargento Ruiz lê um comunicado seco: "Contenção ampliada. Ordem 7, cláusula 3. Nenhum veículo atravessa o Raven." Alguém lá em cima decidiu que o condado é uma perda aceitável.',
    },
    radio: [{ author: 'Fort Ashby (comando)', text: 'Contenção ampliada. Ordem 7, cláusula 3. A travessia oeste do Rio Raven foi destruída. Qualquer tentativa de reconstrução será tratada como hostil.' }],
    emotes: [
      { locationId: 'hw_crossroads', text: 'Onde ficava a rampa da ponte, há uma cratera fumegante e vergalhões apontando para o céu. Não dá para passar.' },
      { locationId: 'hw_bridge', text: 'A ponte balança. Do lado oeste, o asfalto simplesmente acaba num buraco sobre o rio.' },
    ],
    effects: [
      { type: 'block_road', fromId: 'hw_crossroads', toId: 'hw_bridge', reason: 'O exército dinamitou o acesso oeste da ponte.' },
      { type: 'stress', amount: 6 },
    ],
  },
  {
    id: 'sinal_hollow', order: 6, title: 'Luzes em Hollow',
    summary: 'Um novo sinal de rádio vem de Hollow, a cidade depois do Túnel Hollow (destino do comboio perdido): uma comunidade de sobreviventes oferece abrigo a quem levar remédio. Só narrativo — prepara o próximo arco (uma expedição pelo túnel).',
    bulletin: {
      kicker: 'Frequência desconhecida',
      title: 'Alguém do outro lado',
      text: 'À noite, quem está perto do Túnel Hollow vê luzes do outro lado da serra. Luzes elétricas, firmes, organizadas.\n\nE então o rádio pega uma voz nova — de mulher, calma, ensaiada: "Aqui é Hollow. Somos sessenta e dois. Temos muros, água e gerador. Não temos remédio. Quem atravessar o túnel com antibióticos será recebido. Quem atravessar armado e de mãos vazias, não." A mensagem se repete a cada hora.',
    },
    radio: [{ author: 'Hollow (desconhecido)', text: 'Aqui é Hollow. Temos muros, água e gerador. Não temos remédio. Quem atravessar o túnel com antibióticos será recebido.' }],
    emotes: [
      { locationId: 'hw_tunnel', text: 'Do fundo do túnel vem uma corrente de ar e, muito longe, o brilho fraco de luzes elétricas.' },
      { locationId: 'mil_checkpoint', text: 'Atrás da serra, na direção de Hollow, luzes acendem e apagam em intervalos regulares. Parece um sinal.' },
    ],
    effects: [],
  },
];

export const chapterById = (id: string) => CHAPTERS.find((c) => c.id === id);
