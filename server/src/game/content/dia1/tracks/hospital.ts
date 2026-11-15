/**
 * Trilha do HOSPITAL (médicos e enfermeiros). Plantão da manhã no Pronto-Socorro do St. Mary.
 * Ato 1: pacientes "da fábrica" com febre. Ato 2: o primeiro paciente que levanta na maca, o Dr. Ellis e o necrotério.
 * Ato 3: o saguão vira o ponto de encontro (h_hospital), com bombeiros trazendo feridos da Ashcroft e policiais.
 */
import type { Track } from '../types.js';

export const HOSPITAL: Track = {
  id: 'hospital', name: 'Hospital St. Mary', professions: ['doctor', 'nurse'], location: 'rc_hospital_entrance', maxGroup: 4, start: 'h1',
  beats: [
    { id: 'h1', act: 1, say: [
      { thread: 'cena', from: 'sistema', text: '07:00 · Hospital St. Mary, Pronto-Socorro. Troca de plantão. Cheiro de café velho e álcool gel.', wait: 3 },
      { thread: 'dm:ellis', from: 'Dr. Ellis', text: 'Bom dia, equipe. Plantão pesado: chegaram seis da Ashcroft de madrugada. Febre alta, irritados. Leito 4 ao 9.' },
      { thread: 'grupo', from: 'Plantão PS', text: '{grupo} · escala 07h–19h', wait: 4 },
    ], ask: { kind: 'each', text: 'Primeira coisa do plantão:', options: [
      { id: 'leito', label: '🩺 Examinar os pacientes da fábrica', check: { stat: 'medicine', base: 45, label: 'Entender o quadro' }, effects: [{ flag: 'entendeu_quadro' }, { flag: 'examinou', to: 'chooser' }], next: 'h1b' },
      { id: 'prontuario', label: '📋 Ler os prontuários da madrugada', effects: [{ flag: 'leu_prontuario', to: 'chooser' }], next: 'h1b' },
      { id: 'cafe', label: '☕ Café na copa (só cinco minutinhos)', effects: [{ stress: -5, to: 'chooser' }], next: 'h1b' },
    ], timeout: 60 } },
    { id: 'h1b', act: 1, at: 'rc_hospital_lobby', say: [
      { thread: 'cena', from: 'sistema', text: 'Recepção do PS. A fila de toda segunda: uma criança com dor de ouvido, a Dona Edna com "palpitação" (de novo) e um rapaz que cortou o dedo fazendo café.', wait: 4 },
    ], ask: { kind: 'each', text: 'Enquanto o leito 4 ao 9 está isolado, a fila normal não para. Você atende:', options: [
      { id: 'crianca', label: '🧒 A criança com otite (e a mãe nervosa)', check: { stat: 'medicine', base: 55, label: 'Acalmar e tratar' }, effects: [{ stress: -4, to: 'chooser' }], next: 'h2' },
      { id: 'edna', label: '👵 A Dona Edna e as palpitações de toda semana', effects: [{ flag: 'edna', to: 'chooser' }], next: 'h2' },
      { id: 'dedo', label: '🩹 O rapaz do dedo cortado (pontos rápidos)', effects: [{ item: 'bandage', to: 'chooser' }], next: 'h2' },
    ], timeout: 55 } },
    { id: 'h2', act: 1, say: [
      { thread: 'cena', from: 'sistema', text: 'A Dona Edna segura sua mão: "Meu neto trabalha no Setor B, querido(a). Ele não voltou pra casa." Ela não está com palpitação. Está com medo.', if: { flag: 'self:edna' }, wait: 6 },
      { thread: 'cena', from: 'sistema', text: 'O paciente do leito 6 morde o termômetro até quebrar. A pele está acinzentada, as pupilas não reagem à luz.', if: { flag: 'self:examinou' }, wait: 5 },
      { thread: 'cena', from: 'sistema', text: 'Prontuários: todos com "mordedura ou arranhadura no ambiente de trabalho". Todos do Setor B. Hora de entrada: entre 2h e 4h da manhã.', if: { flag: 'self:leu_prontuario' }, wait: 5 },
      { thread: 'cena', from: 'sistema', text: 'Não é gripe. Ninguém conhece esse padrão: febre, agressividade, e o sangue escurecendo nos curativos.', if: { flag: 'entendeu_quadro' }, wait: 5 },
      { thread: 'dm:ellis', from: 'Dr. Ellis', text: 'Isolem os seis. Máscara e luva dupla. E ninguém comenta isso fora daqui, entendido?', wait: 7 },
    ], ask: { kind: 'poll', text: 'O Ellis quer silêncio. O grupo:', options: [
      { id: 'obedecer', label: '🤐 Isolar e não comentar com ninguém', effects: [{ flag: 'silencio' }], next: 'h3' },
      { id: 'avisar', label: '📱 Avisar a vigilância sanitária mesmo assim', effects: [{ flag: 'avisou_vigilancia' }], next: 'h3' },
    ], timeout: 50 } },
    { id: 'h3', act: 1, say: [
      { thread: 'dm:vigilancia', from: 'Vigilância Sanitária', text: 'Recebido. A situação já está sob controle do Fort Ashby. Não há motivo para alarde. Obrigado.', if: { flag: 'avisou_vigilancia' }, wait: 6 },
      { thread: 'cena', from: 'sistema', text: 'Uma ambulância chega sem avisar. Mais dois da fábrica. Um deles, o segurança, tem um pedaço da orelha faltando.', wait: 8 },
    ], next: 'h4', wait: 35 },

    // ───────────── Ato 2
    { id: 'h4', act: 2, at: 'rc_hospital_ward', say: [
      { thread: 'cena', from: 'sistema', text: 'Enfermaria. O monitor do leito 6 apita: assistolia. O paciente para de respirar.', wait: 3 },
      { thread: 'grupo', from: 'Plantão PS', text: 'LEITO 6 PARADA!!', wait: 2 },
    ], ask: { kind: 'poll', text: 'Parada cardiorrespiratória no leito 6.', options: [
      { id: 'rcp', label: '💓 Reanimação: massagem e desfibrilador', expert: ['doctor', 'nurse'], check: { stat: 'medicine', base: 40, label: 'Manobra de reanimação' }, effects: [{ flag: 'reanimou' }], failEffects: [{ flag: 'reanimou' }], next: 'h5' },
      { id: 'obito', label: '🕯️ Declarar o óbito e cobrir o corpo', effects: [{ flag: 'cobriu' }, { stress: 5 }], next: 'h5b' },
    ], timeout: 30 } },
    { id: 'h5', act: 2, say: [
      { thread: 'cena', from: 'sistema', text: 'Na terceira compressão, a mão do paciente agarra o pulso de {escolhido}. Os olhos abrem, brancos. A boca procura carne.', wait: 4 },
    ], ask: { kind: 'secret', target: 'chooser', from: 'sistema', thread: 'cena', text: 'Ele está te puxando para perto da boca. Você:', options: [
      { id: 'soltar', label: 'Puxar o braço com toda a força', check: { stat: 'strength', base: 50, label: 'Se soltar' }, failEffects: [{ wound: 'bite', region: 'left_arm', severity: 0.4, to: 'chooser', infect: 0.7 }, { flag: 'mordido', to: 'chooser' }], next: 'h6' },
      { id: 'sedar', label: 'Enfiar a seringa de sedativo no pescoço dele', check: { stat: 'medicine', base: 45, label: 'Acertar a veia no susto' }, failEffects: [{ wound: 'scratch', region: 'left_hand', severity: 0.3, to: 'chooser', infect: 0.3 }], next: 'h6' },
    ], timeout: 20, default: 'soltar' } },
    { id: 'h5b', act: 2, say: [
      { thread: 'cena', from: 'sistema', text: 'O lençol sobre o leito 6 se mexe. Primeiro um dedo. Depois a mão inteira.', wait: 6 },
    ], next: 'h6', wait: 2 },
    { id: 'h6', act: 2, say: [{ thread: 'cena', from: 'sistema', text: 'O paciente do leito 6 levanta da maca, arrancando os fios do braço. Os outros leitos começam a se agitar.', wait: 3 }],
      effects: [{ mark: 'primeiro_morto', to: 'each' }],
      combat: { zombies: 1, types: ['walker'], reason: 'O paciente do leito 6 levantou da maca', win: 'h7', lose: 'h7l' } },
    { id: 'h7l', act: 2, say: [{ thread: 'cena', from: 'sistema', text: 'Os seguranças arrastam o paciente para o corredor. Vocês ficam no chão da enfermaria, tremendo, cheios de hematomas.', wait: 4 }], effects: [{ stress: 12 }], next: 'h7', wait: 2 },
    { id: 'h7', act: 2, say: [
      { thread: 'dm:ellis', from: 'Dr. Ellis', text: 'Venham até a minha sala. Agora. Só vocês.', wait: 6 },
      { thread: 'cena', from: 'sistema', text: 'O Ellis fecha a porta e baixa a persiana. Está suando.', wait: 5 },
      { thread: 'cena', from: 'sistema', text: '"Seis pacientes com mordidas, todos da fábrica. Notifiquei o Fort Ashby às 5h. Responderam pra eu não espalhar pânico."', wait: 7 },
      { thread: 'cena', from: 'sistema', text: '"Eu tirei antibiótico e morfina do estoque e guardei em casa. Debaixo do assoalho, numa caixa térmica azul. Se isso piorar… alguém precisa saber."', wait: 7 },
    ], effects: [{ flag: 'segredo_ellis' }], ask: { kind: 'poll', text: 'O que vocês fazem com o que o Ellis contou?', options: [
      { id: 'guardar', label: '🤫 Guardar o segredo entre nós', effects: [{ flag: 'guardou_ellis' }], next: 'h8' },
      { id: 'denunciar', label: '📢 "Isso é desvio. Vai todo mundo saber."', effects: [{ flag: 'expos_ellis' }, { stress: 4 }], next: 'h8' },
    ], timeout: 45 } },
    { id: 'h8', act: 2, at: 'rc_hospital_corridor', say: [
      { thread: 'cena', from: 'sistema', text: 'Do fim do corredor leste, vem um barulho de porta de metal sendo socada. É o necrotério.', wait: 6 },
      { thread: 'dm:ellis', from: 'Dr. Ellis', text: 'Ninguém desce no necrotério sem segurança. NINGUÉM.', wait: 5 },
    ], ask: { kind: 'poll', text: 'Barulho no necrotério.', options: [
      { id: 'descer', label: '🔦 Descer e verificar (com lanterna)', check: { stat: 'perception', base: 50, light: true, label: 'Ver o perigo no escuro antes dele' }, effects: [{ item: 'surgical_mask', to: 'one' }, { flag: 'viu_necroterio' }], failEffects: [{ wound: 'scratch', to: 'one', infect: 0.25 }, { stress: 8 }], next: 'h9' },
      { id: 'travar', label: '🔒 Travar a porta do necrotério com uma maca', check: { stat: 'strength', base: 55, label: 'Travar a porta' }, effects: [{ flag: 'travou_necroterio' }], failEffects: [{ stress: 6 }], next: 'h9' },
    ], timeout: 45 } },
    { id: 'h9', act: 2, say: [
      { thread: 'cena', from: 'sistema', text: 'Lá embaixo, quatro corpos cobertos e três macas vazias. Os lençóis estão no chão.', if: { flag: 'viu_necroterio' }, wait: 5 },
      { thread: 'cena', from: 'sistema', text: 'A maca range contra a porta a cada pancada. Vai segurar. Por enquanto.', if: { flag: 'travou_necroterio' }, wait: 5 },
      { thread: 'cena', from: 'sistema', text: 'Sirenes chegando ao mesmo tempo, de todas as direções. O saguão começa a encher.', wait: 25 },
    ], hub: 'h_hospital' },
  ],
};
