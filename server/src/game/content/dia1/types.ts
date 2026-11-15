/**
 * Formato do roteiro do Dia 1 (prólogo jogável pelo celular).
 *
 * Uma TRILHA é uma sequência de BATIDAS. Cada batida pode: mudar o grupo de lugar (`at`), mandar mensagens no celular
 * (`say`), fazer uma pergunta (`ask`: enquete do grupo, escolha individual, segredo ou ligação), aplicar efeitos, abrir
 * um combate tático, levar a um ponto de encontro (`hub`) ou encerrar o dia (`end`).
 *
 * Textos aceitam marcadores: {nome} (primeiro nome de quem recebe), {grupo} (nomes do grupo), {escolhido} (quem foi
 * sorteado/escolheu), {local} (nome do lugar atual).
 */

export type Act = 1 | 2 | 3 | 4 | 5;

/** Condição para mostrar uma mensagem/opção ou aplicar algo. */
export type Cond = {
  /** Flag do grupo (ou do jogador, com `self:`). Ex.: 'viu_morto', 'self:mordido'. */
  flag?: string;
  notFlag?: string;
  /** Alguém do grupo tem uma destas profissões (ou, numa mensagem individual, quem recebe tem). */
  prof?: string[];
  /** Alguém do grupo tem este item. */
  item?: string;
  /** Mínimo de membros vivos no grupo. */
  min?: number;
  /** Há (true) ou não há (false) outros sobreviventes do Dia 1 no mesmo lugar (eventos de quem saiu do trabalho). */
  others?: boolean;
};

/** Para quem vai o efeito: todos, um sorteado, quem escolheu a opção (em escolhas individuais) ou quem tem a profissão. */
export type Who = 'each' | 'one' | 'chooser' | `prof:${string}` | `flag:${string}`;

export type Effect =
  | { item: string; qty?: number; to?: Who }
  | { wound: 'scratch' | 'cut_shallow' | 'cut_deep' | 'laceration' | 'puncture' | 'bite' | 'bruise' | 'fracture' | 'burn' | 'gunshot'; region?: string; severity?: number; to?: Who; infect?: number }
  | { stress: number; to?: Who }
  | { flag: string; to?: 'group' | Who }
  | { mark: string; to?: Who }
  | { battery: number; to?: Who }
  | { death: string; to?: Who };

export type Thread =
  | 'grupo' // grupo do trabalho/de quem está junto (enquetes)
  | 'familia' // grupo da família (NPCs)
  | `dm:${string}` // conversa privada com um NPC (ex.: dm:mae, dm:central)
  | 'noticias' | 'social' | 'alerta' | 'cena';

export type Msg = {
  thread: Thread;
  /** Quem manda (NPC) ou 'sistema'. Em 'cena' é a narração do que acontece em volta. */
  from: string;
  text: string;
  /** Segundos de espera antes desta mensagem (ritmo). Padrão: 6. */
  wait?: number;
  /** Só para quem cumpre a condição (prof testa a profissão de quem recebe). */
  if?: Cond;
  /** Foto/vídeo anexado (descrição curta que aparece como mídia). */
  media?: string;
  /** Imagem da postagem/notícia: client/public/assets/dia1/social/<img>.png (ver docs/DIA1_IMAGENS.md). */
  img?: string;
  /** Comentários de moradores (NPCs) que já aparecem na postagem. */
  comments?: { from: string; text: string }[];
};

export type Check = {
  /** Atributo (strength, agility, endurance, perception, intellect) ou habilidade (medicine, pistol, athletics…). */
  stat: string;
  /** Chance base em % e quanto cada ponto acima de 4 (atributo) ou nível (habilidade) soma. */
  base: number;
  per?: number;
  /** Precisa de luz (lanterna do celular ou de verdade). Sem luz: -25%. */
  light?: boolean;
  /** Texto curto do teste, ex.: "Arrombar a porta". */
  label: string;
};

export type Option = {
  id: string;
  /** Pode começar com um emoji: o motor troca por um ícone do jogo (ver icons.ts). */
  label: string;
  /** Ícone do jogo (preenchido a partir do emoji do label). */
  icon?: string;
  /** Mensagem que o jogador "manda" ao escolher (aparece no chat como dele). */
  reply?: string;
  if?: Cond;
  check?: Check;
  effects?: Effect[];
  /** Se o teste falhar: efeitos e batida alternativa. */
  failEffects?: Effect[];
  fail?: string;
  next?: string;
  /** Profissão cujo voto desempata a favor desta opção. */
  expert?: string[];
};

export type Ask = {
  /**
   * poll: enquete do grupo (maioria; empate → especialista);
   * each: cada um escolhe por si (efeitos em quem escolheu); com `split`, quem escolhe caminhos diferentes se separa;
   * secret: só alguns recebem (target), por mensagem privada;
   * call: ligação (como secret/each, mas com tela de chamada).
   */
  kind: 'poll' | 'each' | 'secret' | 'call';
  text: string;
  from?: string;
  thread?: Thread;
  options: Option[];
  /** Segundos para responder. Padrão: 60 (enquete) / 45 (individual). */
  timeout?: number;
  /** Opção para quem não responder. Padrão: a última. */
  default?: string;
  /** Em 'each': separa o grupo conforme a escolha. */
  split?: boolean;
  /** Em 'secret'/'call': quem recebe. Padrão: 'one' (um sorteado). */
  target?: Who;
};

export type Beat = {
  id: string;
  act: Act;
  /** Muda o grupo para este local do mapa (id de location). */
  at?: string;
  say?: Msg[];
  ask?: Ask;
  effects?: Effect[];
  /** Combate tático de verdade. Vitória/fuga → win; derrota → lose. */
  combat?: { zombies: number; types?: string[]; reason: string; win: string; lose: string };
  /** Vai para um ponto de encontro (trilha compartilhada) e se junta a quem estiver lá. */
  hub?: string;
  /** Fecha o ponto de encontro: quem chegar depois começa outro grupo. */
  closeHub?: boolean;
  next?: string;
  /** Segundos de pausa depois das mensagens, antes da próxima batida. */
  wait?: number;
  end?: boolean;
  /** Condição para entrar nesta batida; se falhar, pula para `else`. */
  if?: Cond;
  else?: string;
};

export type Track = {
  id: string;
  name: string;
  /** Profissões que começam nesta trilha (na ordem de preferência). */
  professions: string[];
  /** Local inicial. */
  location: string;
  /** Local inicial por profissão (cada local forma seus próprios grupos). */
  startAt?: Record<string, string>;
  /** Tamanho máximo de um grupo inicial (sobra vira outro grupo). */
  maxGroup?: number;
  /** Trilha de ponto de encontro (sem profissões; só se chega por `hub`). */
  hub?: boolean;
  /** Minuto da sessão a partir do qual o ponto de encontro começa (quem chega antes espera). */
  opensAt?: number;
  start: string;
  beats: Beat[];
  /**
   * Evento de quem saiu do trabalho (livre pelo mapa): `at` = local onde acontece (ao chegar lá);
   * sem `at` = evento global (acontece onde a pessoa estiver). `acts` = atos em que pode acontecer.
   */
  free?: { at?: string; acts: [number, number] };
};

/** Evento da linha do tempo global (todo mundo recebe ao mesmo tempo). */
export type TimelineEntry = {
  /** Minuto da sessão. */
  at: number;
  msgs?: Msg[];
  /** Mensagem da família de cada um (texto diferente para cada pessoa; ver family.ts). */
  family?: import('./family.js').FamilySlot;
  /** Nível de sinal: 4 (normal), 3 (lento), 2 (só texto), 1 (só alerta de emergência), 0 (nada). */
  signal?: number;
  /** A energia da cidade cai. */
  powerOut?: boolean;
};

/** Marcas que o Dia 1 deixa no personagem (aparecem na crônica e no diário). */
export type MarkDef = { id: string; name: string; text: string };
