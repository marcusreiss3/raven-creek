/**
 * Família no celular (Dia 1). Cada personagem recebe uma "família" diferente (mãe e pai, avó e tio, irmã, filha…),
 * com textos próprios: quem está na mesma cena nunca recebe a mesma mensagem ao mesmo tempo.
 * Cada mensagem pode trazer respostas prontas; quem recebe escolhe uma e o parente responde uma vez.
 * Os textos evitam marcar o gênero de quem recebe.
 */
export type FamReply = { text: string; answer?: string };
export type FamMsg = { from: 'a' | 'b'; text: string; replies?: FamReply[] };
/** Momentos da linha do tempo em que a família escreve (minutos "de projeto"). */
export const FAMILY_SLOTS = ['manha', 'fabrica', 'tv', 'panico', 'fuga', 'fim'] as const;
export type FamilySlot = (typeof FAMILY_SLOTS)[number] | 'fila';
export type Family = {
  id: string; a: string; b: string; minAge?: number; maxAge?: number;
  /** Atraso (minutos de projeto) para não chegar junto com as outras famílias. */
  offset: number;
  slots: Record<FamilySlot, FamMsg>;
  /** Mensagens soltas por ato, para quem está esperando. */
  ambient: Record<number, FamMsg[]>;
};

export const FAMILIES: Family[] = [
  {
    id: 'pais', a: 'Mãe', b: 'Pai', maxAge: 45, offset: 0,
    slots: {
      manha: { from: 'a', text: 'Bom dia, {nome}! Não esquece de almoçar hoje, viu? 😘', replies: [
        { text: 'Bom dia, mãe! Pode deixar 😊', answer: 'Isso! E leva um casaco que vai esfriar.' },
        { text: 'Tô atrasado no serviço, falo depois', answer: 'Tá bom, tá bom. Juízo.' } ] },
      fabrica: { from: 'b', text: 'Viu isso da fábrica? Teu tio Joe trabalha lá e não atende o telefone desde ontem.', replies: [
        { text: 'Deve tá sem bateria, pai. Calma', answer: 'Espero. Sua mãe já ligou umas dez vezes.' },
        { text: 'Vou tentar ligar pra ele', answer: 'Se conseguir, me avisa.' } ] },
      tv: { from: 'a', text: '{nome}, tá tudo bem aí? Falaram na TV que é pra ficar longe de gente machucada. Que coisa estranha', replies: [
        { text: 'Tá tudo bem, mãe. Fica em casa', answer: 'Tô em casa. Seu pai foi no mercado, tô esperando ele.' },
        { text: 'Não sei, tá esquisito aqui também', answer: 'Esquisito como?? Me liga!' } ] },
      panico: { from: 'a', text: '{nome} CADÊ VOCÊ?? me liga, tô tentando faz uma hora', replies: [
        { text: 'Tô bem! Não dá pra ligar agora', answer: 'graças a Deus. graças a Deus.' },
        { text: 'Mãe, tranca a porta e não abre pra ninguém', answer: 'trancada. seu pai chegou. ele tá com a mão sangrando' } ] },
      fuga: { from: 'b', text: 'Estamos indo pra casa da sua tia em Willow. NÃO volta pra cidade. Se der, encontra a gente lá. Te amo.', replies: [
        { text: 'Vai com cuidado, pai. Te amo', answer: 'Você também. Liga quando der.' },
        { text: 'E a mão? Você foi mordido?', answer: 'Foi um cachorro. Tá tudo bem. Vai.' } ] },
      fim: { from: 'a', text: 'se vc ler isso não vem pra cá. tem gente na porta. eu te am', replies: [{ text: 'MÃE?' }, { text: 'Tô indo aí' }] },
      fila: { from: 'a', text: '{nome}, você tá na barreira da rodovia? Me deixa passar, por favor. Eu tô na fila, no carro vermelho.' },
    },
    ambient: {
      1: [{ from: 'a', text: 'Comprei aquele pão que você gosta. Passa aqui depois do trabalho?', replies: [{ text: 'Passo sim!', answer: 'Vou fazer café então ☕' }, { text: 'Hoje não vai dar', answer: 'Ah, que pena. Amanhã então.' }] }],
      2: [{ from: 'b', text: '{nome}, não vai pro centro. Fecharam a ponte. Me liga quando der.', replies: [{ text: 'Ok pai', answer: 'Bom.' }] },
        { from: 'a', text: 'Rezei por você. Me manda só um "ok" que eu fico tranquila', replies: [{ text: 'ok ❤️', answer: '❤️' }] }],
      3: [{ from: 'b', text: 'Tô com sua mãe no porão. Tem alguém batendo na porta lá em cima. Não abre ninguém, ok?', replies: [{ text: 'Fiquem quietos aí', answer: 'ok' }] }],
      4: [{ from: 'b', text: 'bateria acabando. amo vc. fica vivo', replies: [{ text: 'Amo vocês' }] }],
    },
  },
  {
    id: 'vo', a: 'Vó Rosa', b: 'Tio Frank', maxAge: 40, offset: 2,
    slots: {
      manha: { from: 'a', text: 'Bom dia meu anjo. A vó fez torta de maçã ontem, guardei um pedaço pra você.', replies: [
        { text: 'Valeu, vó! Passo aí mais tarde', answer: 'Te espero. Traz o leite que acabou.' },
        { text: 'Vó, a senhora tomou o remédio?', answer: 'Tomei sim, chato. Igualzinho seu avô.' } ] },
      fabrica: { from: 'b', text: 'E aí. Na oficina tão dizendo que a Ashcroft vazou alguma coisa ontem à noite. Sabe de algo?', replies: [
        { text: 'Só o que deu no jornal', answer: 'Jornal não fala nada que preste. Fica esperto.' },
        { text: 'Nada. Por quê?', answer: 'Três caras faltaram hoje. Todos de lá.' } ] },
      tv: { from: 'a', text: 'Meu anjo, a TV tá mostrando umas coisas horríveis. Isso é aqui mesmo? Na nossa cidade?', replies: [
        { text: 'É, vó. Não sai de casa', answer: 'Não vou. O Frank disse que vem me buscar.' },
        { text: 'Deve ser exagero da TV', answer: 'Deus te ouça.' } ] },
      panico: { from: 'b', text: 'Tô indo buscar a mãe. Ela não atende. Se você estiver mais perto, vai você.', replies: [
        { text: 'Não tô perto. Vai você, tio', answer: 'Indo. Fica com o celular ligado.' },
        { text: 'Tio, cuidado na rua', answer: 'Tô com a espingarda do seu avô.' } ] },
      fuga: { from: 'b', text: 'Peguei a vó. Ela tá bem, só assustada. Vamos pro sítio do Hal, na estrada norte. Não volta pra cidade.', replies: [
        { text: 'Graças a Deus. Cuida dela', answer: 'Com a minha vida.' },
        { text: 'Me espera lá', answer: 'Vamos esperar. Não demora.' } ] },
      fim: { from: 'a', text: 'o frank não tá bem meu anjo. ele tá suando muito. disse que foi só um arranhão', replies: [{ text: 'Vó, se afasta dele' }, { text: 'Fica perto da porta, vó' }] },
      fila: { from: 'b', text: '{nome}, a gente tá na fila da barreira, carro do seu avô. Fala com alguém aí. A vó tá passando mal.' },
    },
    ambient: {
      1: [{ from: 'a', text: 'Meu anjo, seu tio quebrou minha cafeteira de novo 🙄', replies: [{ text: 'Kkkk de novo?', answer: 'De novo. Terceira esse ano.' }] }],
      2: [{ from: 'b', text: 'Fecharam o posto da 9. Nunca vi isso. Fila de carro até a ponte.' },
        { from: 'a', text: 'Tô rezando o terço. Não esquece de comer.', replies: [{ text: 'Não vou esquecer, vó', answer: 'Isso. 🙏' }] }],
      3: [{ from: 'b', text: 'Teve tiro na rua da vó. Tô quase lá.' }],
      4: [{ from: 'a', text: 'meu anjo a vó te ama muito. desde que você cabia no meu colo', replies: [{ text: 'Também te amo, vó' }] }],
    },
  },
  {
    id: 'irma', a: 'Jenny (irmã)', b: 'Mãe', maxAge: 50, offset: 4,
    slots: {
      manha: { from: 'a', text: 'me empresta 20 até sexta? juro que devolvo dessa vez 🙏', replies: [
        { text: 'Da última vez você jurou também', answer: 'dessa vez é sério!!! 😭' },
        { text: 'Tá, te mando no almoço', answer: 'te amo, você é a melhor pessoa do mundo' } ] },
      fabrica: { from: 'a', text: 'o Tyler postou um vídeo de um cara mordendo outro no posto Gulf. vc viu? isso é real?', replies: [
        { text: 'Deve ser montagem', answer: 'parece bem real. o cara não para de morder' },
        { text: 'Não vi. Fica longe do centro', answer: 'tô no trabalho, relaxa' } ] },
      tv: { from: 'b', text: 'A Jenny não me atende. Você falou com ela hoje?', replies: [
        { text: 'Falei de manhã. Tá no trabalho', answer: 'Liga pra ela, por favor. Eu tô nervosa.' },
        { text: 'Vou tentar falar com ela', answer: 'Obrigada. Me avisa.' } ] },
      panico: { from: 'a', text: 'tem um cara batendo no vidro do mercado. o gerente trancou a gente aqui dentro. tô com medo', replies: [
        { text: 'Fica longe do vidro. Vai pros fundos', answer: 'tô no depósito. tem mais 4 pessoas comigo' },
        { text: 'Que mercado? Eu vou aí', answer: 'FoodMax. NÃO VEM. tá cheio deles lá fora' } ] },
      fuga: { from: 'b', text: 'A Jenny conseguiu sair pelos fundos. Ela tá comigo. Vamos pra igreja, o padre tá abrindo pra todo mundo.', replies: [
        { text: 'Graças a Deus. Fiquem juntas', answer: 'Vamos ficar. Vem pra cá se puder.' },
        { text: 'Igreja não, mãe. Muita gente junta', answer: 'Não tem outro lugar, meu amor.' } ] },
      fim: { from: 'a', text: 'a mãe tá com febre. ela foi arranhada na porta da igreja. o que eu faço', replies: [{ text: 'Fica longe dela, Jenny' }, { text: 'Cuida dela. Tô indo' }] },
      fila: { from: 'a', text: 'tô na fila da barreira com a mãe!! carro vermelho, quase no fim. ela tá bem, juro. deixa a gente passar' },
    },
    ambient: {
      1: [{ from: 'a', text: 'vc vai no aniversário da mãe no sábado né? não me deixa sozinha com o tio Earl de novo', replies: [{ text: 'Vou sim', answer: 'ufa' }, { text: 'Kkk boa sorte', answer: 'te odeio' }] }],
      2: [{ from: 'b', text: 'Fecharam a escola das crianças da vizinha. Mandaram todo mundo pra casa.' }, { from: 'a', text: 'meu chefe tá tossindo sangue e não quer ir pro médico. homens.' }],
      3: [{ from: 'a', text: 'ouvi tiro. muito tiro. a mãe tá rezando alto' }],
      4: [{ from: 'b', text: 'Se você ler isso, saiba que eu tenho muito orgulho de você.' }],
    },
  },
  {
    id: 'filha', a: 'Megan (filha)', b: 'Carol (ex)', minAge: 36, offset: 1,
    slots: {
      manha: { from: 'a', text: 'posso dormir na casa da Ashley hoje? a mãe dela deixou 🙏', replies: [
        { text: 'Pode, mas me manda mensagem', answer: 'ebaaa obrigada!!! 💜' },
        { text: 'Hoje não, amanhã tem aula', answer: 'aff. tá bom.' } ] },
      fabrica: { from: 'b', text: 'A escola mandou bilhete sobre "vacinação extra". Você sabe de alguma coisa?', replies: [
        { text: 'Não sei. Não assina nada ainda', answer: 'Não assinei. Esquisito isso.' },
        { text: 'Deve ser rotina', answer: 'Espero. A Megan odeia agulha.' } ] },
      tv: { from: 'a', text: 'a escola tá mandando todo mundo pra casa. ninguém explica nada. vc vem me buscar?', replies: [
        { text: 'Vai com a sua mãe. Te amo', answer: 'ok. tô com medo' },
        { text: 'Fica na escola, vou dar um jeito', answer: 'tá. a professora tá com a gente' } ] },
      panico: { from: 'b', text: 'Peguei a Megan. Tem gente esquisita na rua de casa. Vamos pra casa da minha irmã.', replies: [
        { text: 'Valeu, Carol. Cuida dela', answer: 'Sempre cuidei. Se cuida também.' },
        { text: 'Não para o carro por nada', answer: 'Não vou.' } ] },
      fuga: { from: 'a', text: 'a gente tá bem. a tia Lisa tem um porão. a mãe disse pra vc vir pra cá se der. por favor vem', replies: [
        { text: 'Vou tentar, filha. Prometo', answer: 'promete de verdade?' },
        { text: 'Fiquem no porão. Não saiam', answer: 'tá. te amo' } ] },
      fim: { from: 'a', text: 'tem alguém andando lá em cima. a mãe disse pra ficar quieta. tô digitando bem devagar', replies: [{ text: 'Silêncio total, filha. Te amo' }, { text: 'Desliga a tela do celular' }] },
      fila: { from: 'b', text: 'Estamos na fila da barreira, eu e a Megan. Ela tá bem. Por favor, deixa a gente passar.' },
    },
    ambient: {
      1: [{ from: 'a', text: 'viu meu fone? acho que esqueci no seu carro', replies: [{ text: 'Tá aqui comigo', answer: 'ufa 😮‍💨' }] }],
      2: [{ from: 'b', text: 'A Megan disse que um menino da sala dela foi pro hospital com febre. Fica de olho.' }, { from: 'a', text: 'ninguém da minha sala tá respondendo no grupo' }],
      3: [{ from: 'a', text: 'a mãe trancou tudo. a tia tá chorando. eu tô bem, juro' }],
      4: [{ from: 'a', text: 'boa noite. vem amanhã tá' }],
    },
  },
  {
    id: 'amor', a: 'Amor ❤️', b: 'Dona Edna (sogra)', minAge: 24, offset: 3,
    slots: {
      manha: { from: 'a', text: 'Bom dia! Saiu sem me dar tchau 😤', replies: [
        { text: 'Você tava dormindo tão bem', answer: 'Hmm, desculpa aceita. Janta hoje? 🍝' },
        { text: 'Tava em cima da hora, desculpa ❤️', answer: 'Tá bom. Te amo, bom trabalho' } ] },
      fabrica: { from: 'b', text: 'Meu vizinho trabalha na Ashcroft e chegou em casa de madrugada todo machucado. Disse que foi briga. Não acreditei.', replies: [
        { text: 'Fica longe dele, Dona Edna', answer: 'Credo, falando assim até parece coisa de filme.' },
        { text: 'Chama uma ambulância pra ele', answer: 'Ele não quer. Disse que tá bem.' } ] },
      tv: { from: 'a', text: 'Amor, fecharam meu trabalho. Mandaram todo mundo pra casa. O que tá acontecendo?', replies: [
        { text: 'Vai pra casa e tranca tudo', answer: 'Tô indo. Vem logo, por favor.' },
        { text: 'Não sei. Passa na sua mãe antes', answer: 'Boa ideia. Ela não tá atendendo.' } ] },
      panico: { from: 'a', text: 'o vizinho da minha mãe tá na porta dela. ele não tá normal. ela não quer abrir. eu tô no carro aqui fora', replies: [
        { text: 'NÃO SAI DO CARRO', answer: 'não vou. buzinei e ele veio na minha direção' },
        { text: 'Liga o carro e sai daí', answer: 'não vou deixar minha mãe aqui' } ] },
      fuga: { from: 'b', text: 'Estou com a sua cara-metade. Saímos pelos fundos. Vamos pra minha irmã em Willow. Vem pra lá.', replies: [
        { text: 'Valeu, Dona Edna. Já vou', answer: 'Deus te proteja.' },
        { text: 'Ninguém foi mordido?', answer: 'Ninguém. Graças a Deus.' } ] },
      fim: { from: 'a', text: 'a estrada pra Willow tá fechada. voltamos. tô com medo. onde você tá?', replies: [{ text: 'Na barreira da rodovia. Vem pra cá' }, { text: 'Fiquem em casa. Eu vou até vocês' }] },
      fila: { from: 'a', text: 'Amor, tô na fila da barreira com a minha mãe. Me vê aí? Carro prata, perto do caminhão.' },
    },
    ambient: {
      1: [{ from: 'a', text: 'Compra pão no caminho? 🥖', replies: [{ text: 'Compro', answer: 'Você é o melhor ❤️' }, { text: 'Compra você kkk', answer: '😒' }] }],
      2: [{ from: 'b', text: 'Fecharam a farmácia do centro. Na porta tinha uma fila de gente com febre.' }, { from: 'a', text: 'só me manda um oi pra eu saber que tá bem', replies: [{ text: 'oi ❤️', answer: 'oi ❤️ fica bem' }] }],
      3: [{ from: 'a', text: 'tem fumaça pra todo lado. a mamãe tá tossindo' }],
      4: [{ from: 'a', text: 'promete que a gente vai se ver amanhã', replies: [{ text: 'Prometo' }] }],
    },
  },
  {
    id: 'paisolo', a: 'Pai', b: 'Vó Edith', maxAge: 45, offset: 5,
    slots: {
      manha: { from: 'a', text: 'Bom dia. O carro fez aquele barulho de novo. Depois do serviço dá uma olhada comigo?', replies: [
        { text: 'Dou sim, pai', answer: 'Valeu. Compro a cerveja.' },
        { text: 'Leva no mecânico, pai 🙄', answer: 'Mecânico é ladrão.' } ] },
      fabrica: { from: 'b', text: 'Seu pai saiu pra pescar no lago e esqueceu o celular aqui. Teimoso igual o avô.', replies: [
        { text: 'Típico kkk', answer: 'Kkk. Vou fazer bolo de fubá.' },
        { text: 'Lago de Blackpine?', answer: 'Esse mesmo. Volta à tarde, ele disse.' } ] },
      tv: { from: 'b', text: 'Meu bem, a TV tá dizendo pra não sair de casa. Seu pai ainda não voltou do lago.', replies: [
        { text: 'Ele já deve tá voltando, vó', answer: 'Deus queira.' },
        { text: 'Tranca a porta, vó', answer: 'Já tranquei. E fechei a cortina.' } ] },
      panico: { from: 'a', text: 'Voltando do lago. Tinha um cara no barco ao lado que pulou na água e não subiu mais. Depois subiu. Errado.', replies: [
        { text: 'Pai, vem direto pra casa da vó', answer: 'Já tô na estrada.' },
        { text: 'Você tá armado?', answer: 'Tenho a espingarda de pato. Vai ter que servir.' } ] },
      fuga: { from: 'a', text: 'Tô com a vó. A gente vai ficar aqui, a casa é de tijolo e eu preguei as janelas. Se precisar, vem.', replies: [
        { text: 'Fiquem aí. Vou tentar ir', answer: 'Bate três vezes na porta dos fundos.' },
        { text: 'Pai, saiam da cidade', answer: 'A vó não aguenta estrada. Ficamos.' } ] },
      fim: { from: 'b', text: 'seu pai está segurando a porta. ele disse para eu escrever que ele te ama', replies: [{ text: 'Eu amo vocês' }, { text: 'Aguenta, pai' }] },
      fila: { from: 'a', text: 'Tô na fila da barreira com a vó. Carro azul. Ela precisa do remédio da pressão. Dá um jeito?' },
    },
    ambient: {
      1: [{ from: 'b', text: 'Meu bem, qual é a senha do wi-fi mesmo?', replies: [{ text: 'Tá atrás do roteador, vó', answer: 'Achei! Obrigada 🥰' }] }],
      2: [{ from: 'a', text: 'Os patos sumiram do lago. Todos. Nunca vi isso.' }, { from: 'b', text: 'Vi uma vizinha andando estranho na rua. Parecia bêbada.' }],
      3: [{ from: 'a', text: 'Tem um monte deles na rua. Ficamos quietos no escuro.' }],
      4: [{ from: 'b', text: 'boa noite meu bem. Deus te guarde' }],
    },
  },
];

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/**
 * Escolhe a família de cada personagem: ninguém do mesmo grupo repete família e, no geral, elas ficam bem distribuídas.
 * `groups` são listas de [characterId, idade] por grupo inicial.
 */
export function assignFamilies(groups: [number, number][][]): Map<number, string> {
  const out = new Map<number, string>(); const used = new Map<string, number>();
  for (const g of groups) {
    const inGroup = new Set<string>();
    for (const [id, age] of g) {
      const ok = FAMILIES.filter((f) => (f.minAge ?? 0) <= age && age <= (f.maxAge ?? 200));
      const pool = (ok.length ? ok : FAMILIES).filter((f) => !inGroup.has(f.id));
      const list = pool.length ? pool : ok.length ? ok : FAMILIES;
      const min = Math.min(...list.map((f) => used.get(f.id) ?? 0));
      const best = list.filter((f) => (used.get(f.id) ?? 0) === min);
      const f = best[hash(String(id)) % best.length];
      out.set(id, f.id); inGroup.add(f.id); used.set(f.id, (used.get(f.id) ?? 0) + 1);
    }
  }
  return out;
}
export const familyById = (id: string | undefined) => FAMILIES.find((f) => f.id === id) ?? FAMILIES[0];
