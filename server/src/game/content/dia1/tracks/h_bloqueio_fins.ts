/** Os cinco caminhos da primeira noite (ato 5), a partir do posto de controle. Cada um termina num lugar do mapa. */
import type { Beat } from '../types.js';

const fim = (id: string, at: string, text: string): Beat => ({ id, act: 5, at, say: [
  { thread: 'cena', from: 'sistema', text, wait: 6 },
  { thread: 'cena', from: 'sistema', text: 'O Dia 1 acabou. Amanhã, Raven Creek é outro mundo — e vocês ainda estão nele.', wait: 8 },
], effects: [{ mark: 'sobreviveu_dia1', to: 'each' }], end: true });

export const FINAIS: Beat[] = [
  // ───────────── FILA DOS BLINDADOS
  { id: 'fo1', act: 4, say: [
    { thread: 'cena', from: 'sistema', text: 'Vocês se encolhem entre os carros, perto dos blindados. Fogueiras em tambores de óleo. Crianças dormindo no banco de trás. Ninguém fala de ônibus.', wait: 6 },
  ], next: 'fo2', wait: 90 },
  { id: 'fo2', act: 5, say: [{ thread: 'cena', from: 'sistema', text: 'Alguém do grupo está suando frio, encostado no para-choque.', if: { flag: 'self:mordido' }, wait: 5 }],
    ask: { kind: 'secret', target: 'flag:mordido', from: 'sistema', thread: 'cena', text: 'A febre chegou. Você sabe o que isso quer dizer. Você:', options: [
      { id: 'contar', label: 'Contar para o grupo e pedir que fiquem de olho', effects: [{ flag: 'confessou' }], next: 'fo3' },
      { id: 'calar', label: 'Calar. Talvez não seja nada.', effects: [{ mark: 'escondeu_mordida', to: 'chooser' }], next: 'fo3' },
      { id: 'sumir', label: 'Se afastar do grupo e sentar sozinho(a) longe dos carros', effects: [{ mark: 'lobo_solitario', to: 'chooser' }], next: 'fo3' },
    ], timeout: 40, default: 'calar' } },
  { id: 'fo3', act: 5, say: [
    { thread: 'cena', from: 'sistema', text: '{escolhido} conta da mordida. O grupo fica em silêncio. Alguém oferece um cobertor mesmo assim.', if: { flag: 'confessou' }, wait: 6 },
    { thread: 'cena', from: 'sistema', text: '22:00 · Os holofotes piscam. Da cidade, eles chegam: uma maré de gente que não é mais gente, atraída pelas luzes e pelo barulho.', wait: 8 },
  ], ask: { kind: 'each', text: 'A horda chegou na fila de carros. Você:', options: [
    { id: 'correr', label: '🏃 Correr para trás dos blindados', check: { stat: 'athletics', base: 50, label: 'Chegar antes de ser pego' }, failEffects: [{ death: 'Pisoteado e pego na correria da Rodovia 9', to: 'chooser' }], next: 'fo4' },
    { id: 'carro', label: '🚗 Se trancar num carro e não fazer barulho', check: { stat: 'stealth', base: 55, label: 'Passar despercebido' }, failEffects: [{ wound: 'laceration', region: 'left_arm', severity: 0.4, to: 'chooser', infect: 0.5 }, { stress: 15, to: 'chooser' }], next: 'fo4' },
    { id: 'lutar', label: '🔥 Lutar ao lado dos soldados', effects: [{ mark: 'primeiro_sangue', to: 'chooser' }], next: 'fo4' },
  ], timeout: 35, default: 'carro' } },
  { id: 'fo4', act: 5, combat: { zombies: 4, types: ['walker', 'runner'], reason: 'A horda da cidade alcança o posto de controle', win: 'fo5', lose: 'fo5l' } },
  { id: 'fo5l', act: 5, say: [{ thread: 'cena', from: 'sistema', text: 'Vocês acordam dentro de um blindado, arrastados pelos soldados no último segundo.', wait: 5 }], next: 'fo5', wait: 2 },
  fim('fo5', 'mil_gate', 'De madrugada, sem ordem de ninguém, um soldado abre o portão lateral do Fort Ashby para os que sobraram da fila. Vocês entram. Ninguém pergunta nomes.'),

  // ───────────── FURAR A BARREIRA
  { id: 'ff1', act: 5, at: 'hw_route9_west', say: [
    { thread: 'cena', from: 'sistema', text: 'Do outro lado do arame, a rodovia vazia e escura. Atrás, gritos e tiros. Na frente, nada. Vocês correm até as pernas pararem.', wait: 6 },
  ], next: 'ff2', wait: 80 },
  { id: 'ff2', act: 5, at: 'hw_motel', say: [
    { thread: 'cena', from: 'sistema', text: 'Motel Starlight. O letreiro piscando "VAGAS". A recepção revirada, as chaves no chão, e um quarto com a luz acesa.', wait: 6 },
  ], ask: { kind: 'poll', text: 'O quarto 7 está com a luz acesa e a porta encostada.', options: [
    { id: 'bater', label: '🚪 Bater e chamar', effects: [{ flag: 'bateu' }], next: 'ff3' },
    { id: 'entrar', label: '🔦 Entrar de uma vez, preparados', check: { stat: 'perception', base: 50, light: true, label: 'Ver o que está lá dentro primeiro' }, effects: [{ item: 'canned_soup', to: 'one' }, { item: 'water_bottle', to: 'one' }], failEffects: [{ wound: 'bite', region: 'right_hand', severity: 0.3, to: 'one', infect: 0.6 }, { flag: 'mordido', to: 'one' }], next: 'ff3' },
    { id: 'outro', label: '🛏️ Pegar outro quarto e trancar tudo', next: 'ff3' },
  ], timeout: 45 } },
  { id: 'ff3', act: 5, say: [
    { thread: 'cena', from: 'sistema', text: 'Uma voz responde lá de dentro: "Vocês estão mordidos? Não? Então entra, rápido." Um caminhoneiro com uma escopeta e um rádio de PX.', if: { flag: 'bateu' }, wait: 6 },
    { thread: 'cena', from: 'sistema', text: 'No estacionamento, vultos se aproximando devagar, vindos da rodovia.', wait: 30 },
  ], combat: { zombies: 3, types: ['walker'], reason: 'Infectados da rodovia cercam o Motel Starlight', win: 'ff4', lose: 'ff4' } },
  fim('ff4', 'hw_motel', 'Vocês passam a noite no Motel Starlight, revezando a vigia na janela. Fora da barreira. Fora da lei. Vivos.'),

  // ───────────── IGREJA
  { id: 'fi1', act: 5, at: 'rc_main_street', say: [
    { thread: 'cena', from: 'sistema', text: 'De volta à cidade, no escuro. A Rua Principal está cheia deles, andando sem rumo entre carros abandonados. O sino da igreja toca, chamando quem estiver vivo.', wait: 6 },
  ], ask: { kind: 'poll', text: 'Atravessar a Rua Principal até a igreja.', options: [
    { id: 'correr', label: '🏃 Correndo, todo mundo junto', check: { stat: 'athletics', base: 45, label: 'Atravessar sem ser cercado' }, failEffects: [{ wound: 'scratch', to: 'one', infect: 0.35 }, { stress: 10 }], next: 'fi2' },
    { id: 'esgoto', label: '🕳️ Pelas galerias de esgoto', check: { stat: 'perception', base: 45, light: true, label: 'Achar o caminho no escuro' }, failEffects: [{ stress: 12 }, { wound: 'cut_shallow', region: 'left_leg', severity: 0.3, to: 'one' }], next: 'fi2' },
  ], timeout: 40 } },
  { id: 'fi2', act: 5, at: 'rc_church', say: [
    { thread: 'cena', from: 'sistema', text: 'Igreja de São Jorge. O Padre Thomas abre a porta lateral só o suficiente. Lá dentro: trinta pessoas, velas, choro baixo. "Entrem. Deus sabe que hoje ninguém fica de fora."', wait: 6 },
  ], next: 'fi3', wait: 70 },
  { id: 'fi3', act: 5, say: [{ thread: 'cena', from: 'sistema', text: 'O sino atraiu mais do que gente viva. A porta principal começa a ser empurrada. As dobradiças rangem.', wait: 5 }],
    ask: { kind: 'each', text: 'A porta da igreja está cedendo. Você:', options: [
      { id: 'segurar', label: '🚪 Segurar a porta com o ombro', check: { stat: 'strength', base: 50, label: 'Aguentar o empurrão da horda' }, effects: [{ mark: 'protegeu_estranho', to: 'chooser' }], failEffects: [{ death: 'Arrastado pela horda na porta da Igreja de São Jorge', to: 'chooser' }], next: 'fi4' },
      { id: 'criancas', label: '🧒 Levar as crianças para o campanário', effects: [{ mark: 'salvou_crianca', to: 'chooser' }], next: 'fi4' },
      { id: 'bancos', label: '🪑 Arrastar bancos contra a porta', check: { stat: 'endurance', base: 45, label: 'Mover os bancos a tempo' }, failEffects: [{ wound: 'bruise', region: 'torso', severity: 0.3, to: 'chooser' }], next: 'fi4' },
    ], timeout: 35, default: 'bancos' } },
  { id: 'fi4', act: 5, combat: { zombies: 3, types: ['walker'], reason: 'A horda invade a nave da Igreja de São Jorge', win: 'fi5', lose: 'fi5' } },
  fim('fi5', 'rc_church', 'A porta aguenta. Até o amanhecer, ninguém dorme na Igreja de São Jorge. O Padre Thomas reza baixinho pelos que ficaram lá fora.'),

  // ───────────── FLORESTA
  { id: 'fm1', act: 5, at: 'hw_dirt_north', say: [
    { thread: 'cena', from: 'sistema', text: 'Estrada de Terra Norte. Sem faróis, só a lua. O barulho da rodovia vai ficando para trás.', wait: 6 },
    { thread: 'cena', from: 'sistema', text: 'Quem conhece a mata vai na frente, lendo o chão.', if: { prof: ['hunter'] }, wait: 5 },
  ], next: 'fm2', wait: 70 },
  { id: 'fm2', act: 5, at: 'fo_trailhead', say: [{ thread: 'cena', from: 'sistema', text: 'Entrada da Trilha Blackpine. Frio de verdade agora. Ninguém trouxe casaco suficiente.', wait: 5 }],
    ask: { kind: 'poll', text: 'A noite na mata.', options: [
      { id: 'fogueira', label: '🔥 Fazer uma fogueira (calor, mas a luz atrai)', effects: [{ stress: -6 }, { flag: 'fogueira' }], next: 'fm3' },
      { id: 'posto', label: '🛖 Andar até o Posto da Guarda Florestal no escuro', check: { stat: 'survival', base: 45, light: true, label: 'Não se perder na mata' }, failEffects: [{ wound: 'fracture', region: 'left_foot', severity: 0.35, to: 'one' }, { stress: 10 }], next: 'fm3' },
    ], timeout: 45 } },
  { id: 'fm3', act: 5, say: [
    { thread: 'cena', from: 'sistema', text: 'A fogueira estala. Do escuro entre os pinheiros, um par de olhos refletindo a luz. Depois outro. Depois outro.', if: { flag: 'fogueira' }, wait: 6 },
    { thread: 'cena', from: 'sistema', text: 'Galhos quebrando, perto. Algo segue vocês desde a estrada.', if: { notFlag: 'fogueira' }, wait: 6 },
  ], combat: { zombies: 3, types: ['walker', 'runner'], reason: 'Infectados saem do escuro da mata de Blackpine', win: 'fm4', lose: 'fm4l' } },
  { id: 'fm4l', act: 5, say: [{ thread: 'cena', from: 'sistema', text: 'Vocês se espalham pela mata e se reencontram, um por um, horas depois, na porta do posto da guarda.', wait: 5 }], effects: [{ stress: 12 }], next: 'fm4', wait: 2 },
  fim('fm4', 'fo_ranger_station', 'Posto da Guarda Florestal. Porta trancada com uma cadeira, um mapa riscado de vermelho na parede e o rádio do Pike chiando a noite toda, sem ninguém do outro lado.'),

  // ───────────── SEGURAR A BARREIRA
  { id: 'fp1', act: 5, say: [
    { thread: 'cena', from: 'sistema', text: 'Atrás dos sacos de areia, ao lado dos soldados. O Hollis olha para vocês e acena com a cabeça: hoje, quem fica é do esquadrão.', wait: 6 },
  ], next: 'fp2', wait: 80 },
  { id: 'fp2', act: 5, say: [
    { thread: 'cena', from: 'sistema', text: 'A horda da cidade chega misturada com a multidão em pânico. Gente viva correndo na frente, os mortos logo atrás. Na mira, não dá para separar uns dos outros.', wait: 6 },
    { thread: 'dm:hollis', from: 'Sgt. Hollis', text: 'FOGO NA LINHA! NINGUÉM ATRAVESSA!', wait: 4 },
  ], ask: { kind: 'poll', text: 'A ordem é atirar em quem chegar na linha.', options: [
    { id: 'ordem', label: '🔫 Cumprir a ordem: fogo na linha', effects: [{ mark: 'cumpriu_ordens', to: 'each' }, { mark: 'atirou_civil', to: 'one' }, { stress: 15 }], next: 'fp3' },
    { id: 'abrir', label: '🚧 Abrir a cancela para os vivos passarem', check: { stat: 'strength', base: 45, label: 'Abrir e fechar a tempo' }, effects: [{ mark: 'protegeu_estranho', to: 'each' }], failEffects: [{ death: 'Derrubado pela horda ao abrir a cancela', to: 'one' }], next: 'fp3' },
    { id: 'mirar', label: '🎯 Atirar só no que tem olhos brancos', check: { stat: 'rifle', base: 40, label: 'Acertar só os infectados' }, effects: [{ mark: 'mao_firme', to: 'chooser' }], failEffects: [{ mark: 'atirou_civil', to: 'chooser' }, { stress: 12 }], next: 'fp3' },
  ], timeout: 30 } },
  { id: 'fp3', act: 5, combat: { zombies: 4, types: ['walker', 'brute'], reason: 'A horda chega aos sacos de areia do posto de controle', win: 'fp4', lose: 'fp4l' } },
  { id: 'fp4l', act: 5, say: [{ thread: 'cena', from: 'sistema', text: 'A linha cede. Os sobreviventes do esquadrão recuam para trás dos blindados, arrastando os feridos.', wait: 5 }], effects: [{ stress: 15 }], next: 'fp4', wait: 2 },
  fim('fp4', 'mil_checkpoint', 'De manhã, o posto de controle é um campo de sacos de areia, cápsulas e silêncio. Vocês ainda estão de pé atrás dele.'),
];
