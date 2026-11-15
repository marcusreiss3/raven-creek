/**
 * Trilha da POLÍCIA. Duplas na Viatura 12 (Rodovia 9); quem sobra (2º grupo) começa no rádio da delegacia.
 * Ato 1: manhã parada, um sedan em alta velocidade. Ato 2: a briga no Posto Gulf (primeiro morto que levanta) e a
 * delegacia recebendo feridos → ponto de encontro na delegacia (h_delegacia), onde está o arsenal.
 */
import type { Track } from '../types.js';

export const POLICIA: Track = {
  id: 'policia', name: 'Polícia', professions: ['police'], location: 'hw_route9_east', maxGroup: 2, start: 'pol_start',
  beats: [
    { id: 'pol_start', act: 1, if: { flag: 'segundo_grupo' }, else: 'v1', next: 'd1' },

    // ───────────── VIATURA 12
    { id: 'v1', act: 1, at: 'hw_route9_east', say: [
      { thread: 'cena', from: 'sistema', text: '07:00 · Viatura 12 parada no acostamento da Rodovia 9. O café no porta-copos já esfriou. O rádio chia baixinho.', wait: 3 },
      { thread: 'dm:central', from: 'Central', text: 'Viatura 12, bom dia. Segunda devagar. Fiquem na Rodovia 9 até as 9h, tem obra na ponte.' },
      { thread: 'grupo', from: 'Viatura 12', text: '{grupo} · turno das 7h às 19h', wait: 4 },
    ], ask: { kind: 'poll', text: 'Manhã parada. O que a viatura faz?', options: [
      { id: 'cafe', label: '☕ Passar na Lanchonete da Mabel pegar café de verdade', effects: [{ stress: -5 }, { flag: 'cafe' }], next: 'v1b' },
      { id: 'radar', label: '📡 Ficar no radar da rodovia', effects: [{ flag: 'radar' }], next: 'v1b' },
      { id: 'ronda', label: '🚓 Ronda pela Avenida Willow', effects: [{ flag: 'ronda' }], next: 'v1b' },
    ], timeout: 60 } },

    { id: 'v1b', act: 1, say: [
      { thread: 'cena', from: 'sistema', text: 'Uma picape velha passa com a placa vencida e a lanterna quebrada. Rotina de segunda. O motorista, o Sr. Coleman, estaciona tremendo.', wait: 4 },
      { thread: 'cena', from: 'sistema', text: '"Desculpa, policial. Não dormi nada. Os cachorros da rua latiram a noite inteira pros lados da fábrica."', wait: 6 },
    ], ask: { kind: 'poll', text: 'A picape do Sr. Coleman.', options: [
      { id: 'multar', label: '📝 Multa e tchau, sem conversa', effects: [{ stress: -2 }], next: 'v2' },
      { id: 'advertir', label: '🙂 Advertência verbal: "conserta essa lanterna"', effects: [{ flag: 'gentil' }], next: 'v2' },
      { id: 'revistar', label: '🔦 Revistar a caçamba', check: { stat: 'perception', base: 50, label: 'Achar algo na caçamba' }, effects: [{ item: 'flashlight', to: 'one' }, { flag: 'revistou' }], next: 'v2' },
    ], timeout: 50 } },
    { id: 'v2', act: 1, say: [
      { thread: 'cena', from: 'sistema', text: 'A Mabel serve o café e comenta: "o Earl, da fábrica, saiu daqui ontem tossindo sangue. Disse que era gripe."', if: { flag: 'cafe' }, wait: 5 },
      { thread: 'cena', from: 'sistema', text: 'O radar apita: 141 km/h. Um sedan prata passa voando, o vidro de trás estourado.', if: { flag: 'radar' }, wait: 5 },
      { thread: 'cena', from: 'sistema', text: 'Na Avenida Willow, um homem de roupão está parado no meio do gramado, olhando para o nada. Não responde quando vocês buzinam.', if: { flag: 'ronda' }, wait: 5 },
      { thread: 'dm:central', from: 'Central', text: 'Viatura 12, denúncia de sedan prata em alta velocidade sentido cidade, motorista ferido. Verifiquem.', wait: 8 },
    ], ask: { kind: 'poll', text: 'O sedan prata. Vão atrás?', options: [
      { id: 'perseguir', label: '🚨 Sirene ligada, perseguição', expert: ['police'], check: { stat: 'agility', base: 55, label: 'Alcançar o sedan sem bater' }, effects: [{ flag: 'achou_sedan' }], failEffects: [{ flag: 'perdeu_sedan' }, { wound: 'bruise', region: 'head', severity: 0.2, to: 'one' }], next: 'v3', fail: 'v3b' },
      { id: 'placa', label: '📝 Anotar a placa e passar para a Central', effects: [{ flag: 'perdeu_sedan' }], next: 'v3b' },
    ], timeout: 50 } },

    { id: 'v3', act: 1, at: 'hw_crossroads', say: [
      { thread: 'cena', from: 'sistema', text: 'O sedan está na vala da encruzilhada, a frente amassada no poste. O motorista sangra pelo antebraço, em choque.', wait: 4 },
      { thread: 'cena', from: 'sistema', text: '"Ela me mordeu… a minha mulher. Ela tava com febre desde ontem, aí hoje de manhã… ela não era ela." No banco de trás, uma mulher amarrada com cinto de segurança se debate e range os dentes.' },
    ], ask: { kind: 'poll', text: 'O que vocês fazem com os dois?', options: [
      { id: 'ambulancia', label: '🚑 Chamar ambulância e esperar com eles', effects: [{ flag: 'esperou_ambulancia' }, { stress: 5 }], next: 'v3a' },
      { id: 'abrir', label: '🔓 Abrir a porta de trás e soltar a mulher', check: { stat: 'strength', base: 45, label: 'Conter a mulher' }, failEffects: [{ wound: 'bite', region: 'right_hand', severity: 0.35, to: 'one', infect: 0.5 }, { flag: 'mordido', to: 'one' }], effects: [{ mark: 'primeiro_morto', to: 'each' }], next: 'v3a', fail: 'v3a' },
      { id: 'deixar', label: '🚓 Deixar com a Central e seguir', effects: [{ flag: 'deixou_sedan' }], next: 'v4' },
    ], timeout: 55 } },
    { id: 'v3a', act: 1, say: [
      { thread: 'cena', from: 'sistema', text: 'A ambulância não vem. A Central só repete "aguardem". A mulher para de se debater de repente. O silêncio é pior.', wait: 5 },
      { thread: 'dm:central', from: 'Central', text: 'Viatura 12, larguem isso. Briga com lesão corporal no Posto Gulf. Prioridade.', wait: 6 },
    ], next: 'v4', wait: 4 },
    { id: 'v3b', act: 1, say: [
      { thread: 'dm:central', from: 'Central', text: 'Sedan prata encontrado na encruzilhada pela guarda municipal. Motorista sumiu. Deixa pra lá, Viatura 12.', wait: 6 },
      { thread: 'dm:central', from: 'Central', text: 'Viatura 12, briga com lesão corporal no Posto Gulf. Prioridade.', wait: 8 },
    ], next: 'v4', wait: 4 },

    // ───────────── Ato 2: o Posto Gulf
    { id: 'v4', act: 2, say: [{ thread: 'grupo', from: 'Viatura 12', text: 'A caminho do Posto Gulf.', wait: 2 }],
      ask: { kind: 'poll', text: 'Como chegam no posto?', options: [
        { id: 'sirene', label: '🚨 Sirene e giroflex: chegar rápido', effects: [{ flag: 'barulho' }], next: 'v5' },
        { id: 'silencio', label: '🤫 Chegada silenciosa, observar antes', effects: [{ flag: 'observou' }], next: 'v5' },
      ], timeout: 40 } },
    { id: 'v5', act: 2, at: 'rc_gas_station', say: [
      { thread: 'cena', from: 'sistema', text: 'Posto Gulf. O frentista está no chão entre as bombas. Um homem de macacão da Ashcroft está curvado sobre ele, de costas.', wait: 4 },
      { thread: 'cena', from: 'sistema', text: 'Com a sirene, o homem levanta a cabeça na hora. A boca está vermelha até o queixo.', if: { flag: 'barulho' } },
      { thread: 'cena', from: 'sistema', text: 'Vocês veem antes dele: ele não está batendo no frentista. Está mordendo. Arrancando.', if: { flag: 'observou' } },
    ], ask: { kind: 'poll', text: 'Decidam rápido.', options: [
      { id: 'arma', label: '🔫 Arma em punho: "POLÍCIA! NO CHÃO!"', expert: ['police'], effects: [{ flag: 'abordou' }], next: 'v6' },
      { id: 'braco', label: '✋ Separar no braço', check: { stat: 'strength', base: 50, label: 'Imobilizar o homem' }, effects: [{ flag: 'algemou' }], failEffects: [{ wound: 'bite', region: 'left_arm', severity: 0.4, to: 'one', infect: 0.6 }, { flag: 'mordido', to: 'one' }], next: 'v6', fail: 'v6' },
      { id: 'reforco', label: '📻 Recuar e pedir reforço', effects: [{ flag: 'recuou' }, { stress: 8 }], next: 'v6b' },
    ], timeout: 35 } },
    { id: 'v6', act: 2, say: [
      { thread: 'cena', from: 'sistema', text: 'Ele não obedece. Não parece nem ouvir. Vem na direção de vocês com os braços esticados, um grunhido molhado na garganta.', wait: 3 },
    ], combat: { zombies: 1, types: ['walker'], reason: 'O homem do posto Gulf avança sobre vocês', win: 'v7', lose: 'v7l' } },
    { id: 'v6b', act: 2, say: [
      { thread: 'cena', from: 'sistema', text: 'Do carro, vocês veem o homem largar o frentista e sumir no beco. O frentista fica imóvel no chão. A Central não responde.', wait: 5 },
    ], effects: [{ mark: 'deixou_para_tras', to: 'each' }], next: 'v7', wait: 3 },
    { id: 'v7l', act: 2, say: [{ thread: 'cena', from: 'sistema', text: 'Vocês acordam encostados na viatura, doloridos, com sangue que não é só de vocês. O homem do posto sumiu.', wait: 4 }], effects: [{ stress: 10 }], next: 'v7', wait: 2 },
    { id: 'v7', act: 2, say: [
      { thread: 'cena', from: 'sistema', text: 'O frentista, que deveria estar morto, abre os olhos. Brancos. Leitosos. E começa a se levantar.', wait: 5 },
    ], effects: [{ mark: 'primeiro_morto', to: 'each' }], ask: { kind: 'poll', text: 'O frentista está levantando.', options: [
      { id: 'atirar', label: '🔫 Atirar', expert: ['police'], check: { stat: 'pistol', base: 55, label: 'Acertar na cabeça' }, effects: [{ mark: 'atirou_civil', to: 'chooser' }, { mark: 'mao_firme', to: 'chooser' }, { stress: 10 }], failEffects: [{ stress: 15 }, { wound: 'scratch', to: 'one', infect: 0.15 }], next: 'v8' },
      { id: 'algemar', label: '⛓️ Algemar no poste', check: { stat: 'strength', base: 40, label: 'Algemar sem ser mordido' }, failEffects: [{ wound: 'bite', region: 'right_hand', severity: 0.3, to: 'one', infect: 0.5 }, { flag: 'mordido', to: 'one' }], next: 'v8' },
      { id: 'fugir', label: '🚓 Entrar na viatura e sair dali', effects: [{ stress: 6 }], next: 'v8' },
    ], timeout: 30 } },
    { id: 'v8', act: 2, say: [
      { thread: 'dm:central', from: 'Central', text: 'Todas as unidades: múltiplas ocorrências de agressão em toda a cidade. Retornem à delegacia. Repito, retornem à delegacia.', wait: 5 },
      { thread: 'grupo', from: 'Viatura 12', text: '{nome}, o que foi aquilo?', if: { min: 2 }, wait: 3 },
    ], next: 'v9', wait: 25 },
    { id: 'v9', act: 2, say: [{ thread: 'cena', from: 'sistema', text: 'A viatura corta a cidade em direção à delegacia. Na Rua Principal, um ônibus parado com a porta aberta e ninguém dentro.', wait: 3 }], hub: 'h_delegacia' },

    // ───────────── DELEGACIA (quem começa no rádio)
    { id: 'd1', act: 1, at: 'rc_police', say: [
      { thread: 'cena', from: 'sistema', text: '07:00 · Delegacia de Raven Creek. Recepção. O telefone toca, o rádio chia, a máquina de café está quebrada de novo.', wait: 3 },
      { thread: 'dm:doyle', from: 'Sgt. Doyle', text: '{nome}, hoje você fica no rádio. Viatura 12 tá na rodovia. Qualquer coisa, me chama.' },
    ], ask: { kind: 'each', text: 'Como você começa o plantão?', options: [
      { id: 'papel', label: '🗂️ Organizar as ocorrências da madrugada', effects: [{ flag: 'leu_ocorrencias', to: 'chooser' }], next: 'd1b' },
      { id: 'arsenal', label: '🔐 Conferir o arsenal com o Sargento', effects: [{ flag: 'viu_arsenal' }], next: 'd1b' },
      { id: 'cafe', label: '☕ Café da padaria e notícias no celular', effects: [{ stress: -5, to: 'chooser' }], next: 'd1b' },
    ], timeout: 60 } },
    { id: 'd1b', act: 1, at: 'rc_police_cells', say: [
      { thread: 'cena', from: 'sistema', text: 'Celas. O único preso é o Joe "Bêbado" Halloway, cantando country desafinado desde as seis. "Ô autoridade, uma aguinha pro Joe?"', wait: 4 },
    ], ask: { kind: 'each', text: 'O Joe quer água e conversa.', options: [
      { id: 'agua', label: '🥤 Dar água e um café', effects: [{ stress: -3, to: 'chooser' }, { flag: 'joe_amigo' }], next: 'd2' },
      { id: 'papo', label: '💬 Puxar conversa com o Joe', effects: [{ flag: 'ouviu_joe', to: 'chooser' }], next: 'd2' },
      { id: 'calar', label: '🤐 "Cala a boca, Joe."', next: 'd2' },
    ], timeout: 45 } },
    { id: 'd2', act: 1, say: [
      { thread: 'cena', from: 'sistema', text: 'O Joe, entre um gole e outro: "Meu cunhado é segurança da Ashcroft. Disse que ontem soltaram uns bicho lá dentro. Bicho que anda de macacão, ha-ha."', if: { flag: 'self:ouviu_joe' }, wait: 6 },
      { thread: 'cena', from: 'sistema', text: 'Nas ocorrências da madrugada: três chamados da Fábrica Ashcroft. "Funcionário agressivo." "Funcionário agressivo." "Funcionário mordeu o segurança." Nenhuma viatura foi enviada.', if: { flag: 'self:leu_ocorrencias' }, wait: 5 },
      { thread: 'cena', from: 'sistema', text: 'O arsenal: uma pistola 9mm, um revólver .38, uma espingarda calibre 12 e pouca munição. "Ninguém mexe sem minha ordem", diz o Doyle.', if: { flag: 'viu_arsenal' }, wait: 5 },
      { thread: 'cena', from: 'sistema', text: 'O telefone da recepção toca.', wait: 4 },
    ], ask: { kind: 'call', from: 'Sra. Patterson', target: 'one', text: '📞 "Moça? Moço? Meu marido chegou da fábrica com febre e… mordeu o cachorro. Ele tá trancado no banheiro batendo na porta. O que eu faço?"', options: [
      { id: 'viatura', label: '"Vou mandar uma viatura, senhora. Fique longe da porta."', effects: [{ flag: 'prometeu_viatura' }], next: 'd3' },
      { id: 'trancar', label: '"Não abra essa porta por nada. Saia de casa com as crianças."', effects: [{ flag: 'salvou_patterson' }, { mark: 'protegeu_estranho', to: 'chooser' }], next: 'd3' },
      { id: 'piada', label: '"Senhora, isso não é caso de polícia." (desligar)', effects: [{ flag: 'desligou_patterson' }], next: 'd3' },
    ], timeout: 40 } },
    { id: 'd3', act: 1, say: [
      { thread: 'dm:doyle', from: 'Sgt. Doyle', text: 'Vou dar uma passada no Posto Gulf. Briga feia lá. Segura as pontas.', wait: 6 },
      { thread: 'cena', from: 'sistema', text: 'A delegacia fica estranhamente quieta. Só o rádio e o relógio.', wait: 30 },
    ], next: 'd4', wait: 20 },
    { id: 'd4', act: 2, say: [
      { thread: 'cena', from: 'sistema', text: 'A porta da recepção bate. Um homem de jaqueta jeans entra segurando o antebraço enrolado num pano encharcado de sangue. "Fui mordido no posto. Um maluco. Me ajuda."', wait: 4 },
    ], ask: { kind: 'poll', text: 'O homem mordido está na recepção.', options: [
      { id: 'cela', label: '🔒 Colocar na cela até a ambulância chegar', effects: [{ flag: 'preso_na_cela' }], next: 'd5' },
      { id: 'curar', label: '🩹 Fazer um curativo aqui mesmo', check: { stat: 'medicine', base: 45, label: 'Estancar o sangramento' }, effects: [{ flag: 'curou_homem' }, { mark: 'protegeu_estranho', to: 'chooser' }], failEffects: [{ wound: 'scratch', region: 'left_hand', severity: 0.2, to: 'one', infect: 0.2 }], next: 'd5' },
      { id: 'hospital', label: '🏥 Mandar ele ir sozinho pro hospital', effects: [{ flag: 'mandou_embora' }], next: 'd5' },
    ], timeout: 45 } },
    { id: 'd5', act: 2, say: [
      { thread: 'dm:doyle', from: 'Sgt. Doyle', text: 'Delegacia, aqui é Doyle. Tô no posto. Tem… tem algo muito errado. O frentista… [estática]', wait: 6 },
      { thread: 'dm:doyle', from: 'Sgt. Doyle', text: '[mensagem de voz · 0:03 · só gritos e um tiro]', wait: 5 },
      { thread: 'cena', from: 'sistema', text: 'Lá fora, gente começa a se juntar na porta da delegacia. "Deixa a gente entrar! Tem gente atacando na rua!"', wait: 5 },
    ], ask: { kind: 'poll', text: 'As pessoas estão batendo na porta da delegacia.', options: [
      { id: 'abrir', label: '🚪 Abrir: a delegacia é abrigo', effects: [{ flag: 'abriu_portas' }, { mark: 'protegeu_estranho', to: 'each' }], next: 'd6' },
      { id: 'trancar', label: '🔒 Trancar tudo e esperar a viatura', effects: [{ flag: 'trancou_portas' }, { stress: 6 }], next: 'd6' },
    ], timeout: 45 } },
    { id: 'd6', act: 2, say: [
      { thread: 'cena', from: 'sistema', text: 'Lá fora, faróis e sirene: a Viatura 12 está chegando.', wait: 3 },
    ], hub: 'h_delegacia' },
  ],
};
