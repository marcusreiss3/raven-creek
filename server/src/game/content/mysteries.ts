/**
 * Mistérios: bilhetes e diários espalhados pelo condado. Cada fragmento só existe uma vez no servidor —
 * quem acha primeiro leva o papel, mas o texto vai para o diário de todos. Juntando as peças,
 * descobre-se um código de cofre ou o lugar de um esconderijo.
 */
export type MysteryReward = { itemId: string; qty: number }[];
export type Fragment = {
  id: string; locationIds: string[]; title: string; text: string; hint: string;
  /** Que objeto o jogador leva: bilhete (padrão), fita cassete, foto, plaquinha, crachá… */
  itemId?: string;
};
/** Como a recompensa aparece depois que todas as peças foram achadas. */
export type Appears = 'reveal' | 'arrival' | 'search';
export type Mystery = {
  id: string; title: string; teaser: string;
  /** safe = cofre com senha; stash = esconderijo; keycard = porta trancada que abre com um item (sempre visível). */
  kind: 'safe' | 'stash' | 'keycard';
  /** reveal: surge na hora; arrival: só quem chegar ao local depois vê; search: tem que vasculhar o local para achar. */
  appears?: Appears;
  /** Item que abre a porta (kind keycard). */
  requiresItem?: string;
  /** Como chamar as peças no diário ("bilhetes", "fitas", "pistas"…). */
  pieces?: string;
  /** Aviso para o servidor quando a última peça é achada. */
  revealText?: string;
  /** Texto de quem encontra a recompensa (vai para o diário quando resolvido). */
  claimText?: string;
  /** Onde fica o cofre ou onde o esconderijo aparece. */
  locationId: string;
  /** Nome do cofre / esconderijo na cena. */
  targetName: string;
  code?: string;
  reward: MysteryReward;
  fragments: Fragment[];
};

export const MYSTERIES: Mystery[] = [
  {
    id: 'cofre_prefeitura', title: 'O cofre do prefeito Doyle', kind: 'safe', locationId: 'rc_city_hall', targetName: 'Cofre do gabinete', code: '4719',
    teaser: 'Antes de sumir, o prefeito trancou alguma coisa no gabinete. Ele nunca lembrava de senhas.',
    reward: [{ itemId: 'pistol_9mm', qty: 1 }, { itemId: 'ammo_9mm', qty: 30 }, { itemId: 'antibiotics', qty: 2 }, { itemId: 'first_aid_kit', qty: 1 }, { itemId: 'map_county', qty: 1 }, { itemId: 'car_keys', qty: 1 }],
    fragments: [
      { id: 'doyle_1', locationIds: ['rc_apartment_3b'], title: 'Diário de Margaret, secretária', hint: 'um apartamento do Edifício Harbor',
        text: 'Dia 3. O prefeito Doyle mandou todo mundo embora e trancou o cofre do gabinete com "o que vai nos tirar daqui". Ele é péssimo com senhas — vive escondendo os números em bilhetes pela cidade. Eu sei de um: o PRIMEIRO número é 4. Não contei a ninguém.' },
      { id: 'doyle_2', locationIds: ['rc_restaurant'], title: 'Guardanapo amassado', hint: 'uma lanchonete no centro',
        text: '"Mabel, guarda isso pra mim, não deixa o Tom ver. SEGUNDO: 7. — H.D." (Tem uma mancha de café em cima da assinatura.)' },
      { id: 'doyle_3', locationIds: ['in_factory_office'], title: 'Memorando da Ashcroft', hint: 'um escritório no distrito industrial',
        text: 'Para: H. Doyle. Assunto: o "pacote". Conforme combinado, a amostra e as chaves ficam no seu cofre. Rasgue isto depois de ler. P.S.: o terceiro algarismo é o 1, como o senhor pediu que eu lembrasse. — R. Ashcroft' },
      { id: 'doyle_4', locationIds: ['res_house_02', 'res_house_02_upstairs'], title: 'Carta não enviada', hint: 'um sobrado em Willow Heights',
        text: 'Querida, se você estiver lendo isto, eu não voltei. Tudo o que importa está no cofre do gabinete. O último número é o 9 — o mês em que nos casamos. Não confie no Ashcroft. — Harlan' },
    ],
  },
  {
    id: 'esconderijo_cacador', title: 'O esconderijo do velho Abe', kind: 'stash', locationId: 'fo_deep_woods', targetName: 'Esconderijo enterrado sob as raízes',
    teaser: 'Abe Turner caçava em Blackpine havia quarenta anos. Dizem que guardou tudo antes de a cidade cair.',
    reward: [{ itemId: 'hunting_rifle', qty: 1 }, { itemId: 'ammo_308', qty: 20 }, { itemId: 'hunting_knife', qty: 1 }, { itemId: 'smoked_meat', qty: 6 }, { itemId: 'winter_coat', qty: 1 }, { itemId: 'hiking_bag', qty: 1 }, { itemId: 'lighter', qty: 1 }],
    fragments: [
      { id: 'abe_1', locationIds: ['res_house_10', 'res_house_10_basement'], title: 'Bilhete na geladeira', hint: 'a casa de um caçador em Willow Heights',
        text: 'Junior — fui pro mato. Se a coisa piorar, não fica na cidade. Lembra onde a gente deixou as coisas do inverno? Começa pela cabana. — Pai' },
      { id: 'abe_2', locationIds: ['fo_hunting_cabin'], title: 'Entalhe na mesa da cabana', hint: 'uma cabana de caça em Blackpine',
        text: 'Escrito à faca na madeira: "DA CABANA, SIGA O RIACHO ATÉ O LAGO SUMIR DAS VISTAS. — A.T."' },
      { id: 'abe_3', locationIds: ['fo_ranger_station'], title: 'Livro de ocorrências do guarda florestal', hint: 'o posto da guarda florestal',
        text: '12/out: Abe Turner de novo cavando perto da bétula partida pelo raio, lá na mata fechada. Diz que é "estoque de inverno". Deixei pra lá — o velho conhece aquele mato melhor que eu.' },
      { id: 'abe_4', locationIds: ['fm_creek', 'fo_lake'], title: 'Papel encharcado numa garrafa', hint: 'à beira d\'água',
        text: 'Quase ilegível: "...três passos da bétula, do lado do musgo... enterrado fundo, debaixo das raízes. Se eu não voltar, é seu, filho."' },
    ],
  },
  {
    id: 'paciente_zero', title: 'Paciente zero', kind: 'stash', locationId: 'res_house_06', targetName: 'Caixa térmica sob o assoalho',
    teaser: 'Alguém no condado sabia do surto antes de todo mundo. E guardou o que tinha.',
    reward: [{ itemId: 'antibiotics', qty: 4 }, { itemId: 'surgical_supplies', qty: 2 }, { itemId: 'suture_kit', qty: 2 }, { itemId: 'painkillers', qty: 3 }, { itemId: 'gas_mask', qty: 1 }, { itemId: 'first_aid_kit', qty: 1 }],
    fragments: [
      { id: 'pz_1', locationIds: ['rc_hospital_morgue'], title: 'Etiqueta de necrotério', hint: 'o subsolo do hospital',
        text: 'Corpo nº 1 — trabalhador da Ashcroft, 34 anos. Causa: "febre de origem desconhecida". Observação a caneta, letra do Dr. Ellis: ELE SE MEXEU NA GAVETA. Não registrar.' },
      { id: 'pz_2', locationIds: ['rc_clinic'], title: 'Prontuário rasurado', hint: 'uma clínica no centro',
        text: 'Seis pacientes com mordidas, todos da fábrica. Notifiquei o Fort Ashby. Responderam pra eu "não espalhar pânico". Vou guardar o que eu puder em casa. — Dr. M. Ellis' },
      { id: 'pz_3', locationIds: ['mil_medical_tent'], title: 'Relatório militar', hint: 'uma tenda médica do exército',
        text: 'CONFIDENCIAL. Antibióticos não detêm o agente, mas reduzem a febre secundária. Médico civil (Ellis) requisitou estoque e foi negado. Suspeita de desvio de material.' },
      { id: 'pz_4', locationIds: ['pr_infirmary'], title: 'Recado na enfermaria da prisão', hint: 'a enfermaria da prisão',
        text: 'Pro Dr. Ellis: obrigado pelos remédios que o senhor trouxe escondido. O senhor disse que guardou o resto "debaixo do assoalho de casa, na caixa térmica azul". Deus o proteja. — Enfermeira Reyes' },
      { id: 'pz_5', locationIds: ['mil_command'], title: 'Ordem de quarentena', hint: 'o centro de comando do forte',
        text: 'Ordem 7: isolar Raven Creek. Ninguém entra, ninguém sai. Origem provável: vazamento na Fábrica Ashcroft. O prefeito Doyle está ciente desde a primeira semana.' },
    ],
  },

  // ───────────── O comboio perdido ─────────────
  {
    id: 'comboio_perdido', title: 'O comboio perdido', kind: 'stash', appears: 'arrival', locationId: 'hw_dirt_north', targetName: 'Caminhão do exército tombado no barranco',
    teaser: 'Um caminhão de carga saiu do forte de madrugada e nunca chegou a lugar nenhum.',
    revealText: 'As peças do "Comboio perdido" estão juntas. Quem passar pela estrada certa vai ver o que sobrou.',
    claimText: 'O caminhão estava de lado na vala, meio coberto de folhas. A cabine vazia, a porta arrancada, o rádio ainda ligado no chiado. Na lona, alguém escreveu com o dedo, na poeira: "seguimos a pé".',
    reward: [{ itemId: 'military_bag', qty: 1 }, { itemId: 'canned_soup', qty: 6 }, { itemId: 'water_bottle', qty: 6 }, { itemId: 'antibiotics', qty: 2 }, { itemId: 'first_aid_kit', qty: 1 }, { itemId: 'ammo_9mm', qty: 24 }, { itemId: 'binoculars', qty: 1 }, { itemId: 'gas_can', qty: 1 }],
    fragments: [
      { id: 'cb_1', locationIds: ['mil_motor_pool'], title: 'Quadro de saídas da garagem', hint: 'a garagem de viaturas do forte',
        text: 'Escrito a pincel num quadro branco: "VIATURA 14 (carga) — saída 03:40 — destino: depósito de Hollow — carga: rações, remédio, munição — retorno: ___". O espaço do retorno nunca foi preenchido.' },
      { id: 'cb_2', locationIds: ['hw_tunnel'], title: 'Recado pintado na parede do túnel', hint: 'um túnel na rodovia',
        text: 'Spray laranja, letras grandes e tortas: "COMBOIO 14 — TÚNEL FECHADO — DESVIO PELA TERRA, SENTIDO NORTE". Embaixo, uma seta.' },
      { id: 'cb_3', locationIds: ['hw_service_station'], title: 'Recibo de diesel do exército', hint: 'uma estação de serviço na rodovia',
        text: 'Viatura 14 — 120 litros de diesel — "pago pelo governo". No verso, a caneta: "pneu traseiro estourado, seguimos assim mesmo. A estrada de terra é ruim mas é o único jeito."' },
      { id: 'cb_4', locationIds: ['mil_checkpoint'], title: 'Relatório de rádio rasgado', hint: 'o posto de controle da rodovia',
        text: '"...Viatura 14 sem contato desde 05:10. Último ponto conhecido: estrada de terra ao norte da encruzilhada, na curva do barranco. Não enviar equipe. Repito: não enviar equi—" O resto foi rasgado.' },
    ],
  },
  // ───────────── O porão do pastor ─────────────
  {
    id: 'porao_pastor', title: 'O porão do pastor', kind: 'stash', locationId: 'rc_church', targetName: 'Alçapão no porão da igreja',
    teaser: 'O pastor Elias Grant passou o último verão comprando comida como quem sabia de alguma coisa.',
    revealText: 'As anotações do pastor Grant estão completas: debaixo da Igreja de São Jorge tem um alçapão que ninguém tinha visto.',
    claimText: 'Prateleiras de madeira até o teto, tudo etiquetado na letra caprichada do pastor. Num caderno em cima dos sacos de arroz: "Para quem vier depois de mim. Dividam. Não deixem ninguém passar fome na porta."',
    reward: [{ itemId: 'canned_beans', qty: 10 }, { itemId: 'canned_soup', qty: 8 }, { itemId: 'cereal', qty: 6 }, { itemId: 'water_bottle', qty: 12 }, { itemId: 'seeds', qty: 6 }, { itemId: 'salt', qty: 3 }, { itemId: 'first_aid_kit', qty: 1 }, { itemId: 'lighter', qty: 2 }],
    fragments: [
      { id: 'pg_1', locationIds: ['rc_church'], title: 'Sermão inacabado', hint: 'a igreja do centro',
        text: 'Gênesis 41: "e José guardou o trigo nos anos de fartura". Na margem, a lápis, letra apressada: "Começar a estocar já. Não falar com o conselho. Eles vão rir."' },
      { id: 'pg_2', locationIds: ['hw_chapel'], title: 'Livro de visitas da capela', hint: 'uma capela na beira da estrada',
        text: 'A última assinatura é a do pastor: "E. Grant — trouxe as últimas caixas da capela para a cidade. Agora está tudo debaixo dos pés de quem reza."' },
      { id: 'pg_3', locationIds: ['rc_school_cafeteria'], title: 'Recibo de troca na merenda', hint: 'o refeitório da escola',
        text: '"Recebido da Igreja de São Jorge: 40 cadeiras dobráveis. Em troca, o Pe. Grant levou as caixas de enlatados que sobraram do semestre. Ele insistiu muito."' },
      { id: 'pg_4', locationIds: ['fm_farm_store'], title: 'Pedido na agropecuária', hint: 'a loja agropecuária',
        text: 'Pedido nº 2231 — cliente: Pe. Elias Grant. 20 sacos de arroz, 10 galões de água, sementes variadas. "Entregar pelos fundos da igreja, depois que escurecer. Pago à vista."' },
    ],
  },
  // ───────────── O laboratório da Ashcroft ─────────────
  {
    id: 'lab_ashcroft', title: 'O laboratório do subsolo', kind: 'keycard', requiresItem: 'ashcroft_keycard', locationId: 'in_factory_floor', targetName: 'Porta do laboratório do subsolo (leitor de crachá)',
    teaser: 'No chão de fábrica da Ashcroft há uma porta de aço com um leitor de crachá que ainda pisca verde.',
    pieces: 'pistas',
    claimText: 'A porta chia e abre. Freezers desligados, gaiolas vazias com a grade arrebentada por dentro. No quadro branco, sublinhado três vezes: "AGENTE K-7 — NÃO CONTÉM. ADAPTA." Ninguém aqui dentro. Só o cheiro.',
    reward: [{ itemId: 'gas_mask', qty: 1 }, { itemId: 'antibiotics', qty: 4 }, { itemId: 'surgical_supplies', qty: 2 }, { itemId: 'suture_kit', qty: 2 }, { itemId: 'antiseptic', qty: 3 }, { itemId: 'flashlight', qty: 1 }, { itemId: 'electronic_parts', qty: 3 }],
    fragments: [
      { id: 'lab_1', locationIds: ['in_factory_office'], title: 'Planta da fábrica com anotações', hint: 'o escritório da Ashcroft',
        text: 'Uma planta baixa amarelada. No subsolo, um quadrado marcado "LAB. B — acesso só NÍVEL 3". Ao lado, à caneta: "câmara fria: amostras, EPI, estoque médico. Quem tem crachá: Kovac, Lund, Pryce."' },
      { id: 'lab_2', locationIds: ['in_warehouse_a'], title: 'Manifesto de carga devolvida', hint: 'um armazém de logística',
        text: 'Remetente: Ashcroft Ind. — Lab. B. Conteúdo declarado: "reagentes". Destino: Fort Ashby. Carimbo vermelho por cima: RECUSADO — MATERIAL CONTAMINADO — DEVOLVER À ORIGEM.' },
      { id: 'lab_3', locationIds: ['rc_hospital_ward'], title: 'Pulseira de paciente cortada', hint: 'a enfermaria do hospital',
        text: '"Lund, Peter — funcionário Ashcroft, Lab. B. Entrada: mordida na mão esquerda. Paciente afirma ter sido mordido por um animal de laboratório." Alguém riscou "animal" e escreveu "?" por cima.' },
      { id: 'lab_4', locationIds: ['in_substation'], itemId: 'ashcroft_keycard', title: 'Crachá preso num jaleco rasgado', hint: 'a subestação elétrica',
        text: 'Um jaleco largado entre os transformadores, manchado de sangue seco. No bolso, um crachá: "Dra. Ines Kovac — Laboratório B — NÍVEL 3". O crachá ainda funciona. Da dona, nem sinal.' },
    ],
  },
  // ───────────── Fitas da Rádio KRVN ─────────────
  {
    id: 'fitas_krvn', title: 'As fitas da Rádio KRVN', kind: 'stash', locationId: 'mil_motor_pool', targetName: 'Caixote de suprimentos lançado de paraquedas',
    teaser: 'Walt Harmon gravou tudo o que foi ao ar na KRVN 88.1 nos dias do surto. As fitas se espalharam pelo condado.',
    pieces: 'fitas',
    revealText: 'Com as seis fitas da KRVN, dá para ouvir o recado inteiro de Walt Harmon: o último lançamento de suprimentos do Fort Ashby caiu no pátio de viaturas.',
    claimText: 'O paraquedas está enroscado na cerca, o caixote rachado no asfalto. Na tampa, estampado: "PARA CIVIS — FREQ. 143.6". Ninguém veio buscar a tempo.',
    reward: [{ itemId: 'military_bag', qty: 1 }, { itemId: 'first_aid_kit', qty: 2 }, { itemId: 'antibiotics', qty: 2 }, { itemId: 'water_bottle', qty: 10 }, { itemId: 'canned_beans', qty: 8 }, { itemId: 'radio', qty: 1 }, { itemId: 'combat_boots', qty: 1 }],
    fragments: [
      { id: 'krvn_1', itemId: 'cassette_tape', locationIds: ['rc_restaurant'], title: 'KRVN, fita 1 de 6', hint: 'uma lanchonete no centro',
        text: '"Bom dia, Raven Creek, aqui é o Walt na KRVN 88.1. Trânsito parado na Rodovia 9 por causa de um acidente com produto químico perto da Ashcroft. A prefeitura pede calma e diz que não é nada demais. Fiquem com mais uma do Johnny Cash."' },
      { id: 'krvn_2', itemId: 'cassette_tape', locationIds: ['in_truck_depot'], title: 'KRVN, fita 2 de 6', hint: 'o pátio de caminhões',
        text: 'Um ouvinte ao telefone, motor ligado ao fundo: "Walt, os soldados não deixam ninguém atravessar a ponte. Tem família dormindo dentro do carro. Um cara foi mordido aqui na fila e ninguém sabe o que fazer com ele."' },
      { id: 'krvn_3', itemId: 'cassette_tape', locationIds: ['rc_school_gym'], title: 'KRVN, fita 3 de 6', hint: 'o ginásio da escola',
        text: '"O ginásio da Lincoln virou abrigo. Levem cobertor, levem água. E, por favor... se alguém da família estiver com febre, não tragam pra lá. Eu sei que é difícil ouvir isso. Eu sei."' },
      { id: 'krvn_4', itemId: 'cassette_tape', locationIds: ['hw_rest_stop'], title: 'KRVN, fita 4 de 6', hint: 'uma parada de descanso na rodovia',
        text: 'Walt, mais baixo: "Recebi uma ligação do forte. Eles têm uma frequência só para civis. Não posso falar no ar ainda. Se eu sumir, procurem as minhas fitas. Eu gravo tudo, sempre gravei."' },
      { id: 'krvn_5', itemId: 'cassette_tape', locationIds: ['fo_campsite'], title: 'KRVN, fita 5 de 6', hint: 'um acampamento à beira do lago',
        text: 'Chiado de gerador. "Transmitindo do mato agora. A torre caiu. Se alguém estiver ouvindo: a frequência começa com um-quatro-três. O resto eu digo amanhã, se eu tiver amanhã."' },
      { id: 'krvn_6', itemId: 'cassette_tape', locationIds: ['rc_apartment_5a'], title: 'KRVN, fita 6 de 6', hint: 'um apartamento do Edifício Harbor',
        text: '"...ponto seis. Cento e quarenta e três ponto seis. Eles disseram que o último caixote ia cair no pátio de viaturas do forte, para quem soubesse ouvir. Eu não vou conseguir chegar lá. Vocês vão. Aqui é Walt Harmon, KRVN. Encerrando."' },
    ],
  },
  // ───────────── A família Miller ─────────────
  {
    id: 'familia_miller', title: 'A família Miller', kind: 'stash', appears: 'search', locationId: 'fm_miller_barn', targetName: 'Porão de raízes sob o celeiro',
    teaser: 'Tom, Ruth, Jesse e a pequena Lily. Quatro nomes na caixa de correio da fazenda, e ninguém em casa.',
    pieces: 'pistas',
    revealText: 'Todas as pistas da família Miller foram achadas. Todas apontam para o mesmo lugar — mas é preciso procurar com calma.',
    claimText: 'Debaixo da palha, uma tampa de madeira. No porão de raízes: cobertores, latas, um ursinho sem um olho. Na parede, riscos de giz contando dezenove dias. Embaixo, na letra de Jesse: "Fomos pro norte pela estrada de terra, atrás do caminhão do exército. Pai, se você chegar, a gente te espera no forte." A data está apagada.',
    reward: [{ itemId: 'first_aid_kit', qty: 1 }, { itemId: 'antibiotics', qty: 1 }, { itemId: 'canned_beans', qty: 4 }, { itemId: 'water_bottle', qty: 4 }, { itemId: 'revolver_38', qty: 1 }, { itemId: 'ammo_38', qty: 12 }, { itemId: 'winter_coat', qty: 1 }, { itemId: 'family_photo', qty: 1 }],
    fragments: [
      { id: 'ml_1', locationIds: ['fm_miller_farm'], title: 'Lista na porta da geladeira', hint: 'a sede da Fazenda Miller',
        text: '"Tom: forte (convocado). Ruth: plantão na clínica. Jesse: cuida da Lily e do Bandit. NINGUÉM sai da fazenda até a gente voltar. — Mãe" Um ímã de abacaxi segura o papel.' },
      { id: 'ml_2', itemId: 'dog_tag', locationIds: ['mil_barracks'], title: 'Plaquinha de identificação de Tom Miller', hint: 'os alojamentos do forte',
        text: 'MILLER, THOMAS J. — O POS. Enrolado na corrente, um bilhete dobrado até virar um quadradinho: "Ruth, me mandaram pra ponte. Se fecharem a cidade, vai com as crianças pro porão do celeiro. Eu encontro vocês lá. Prometo."' },
      { id: 'ml_3', locationIds: ['rc_clinic'], title: 'Bilhete no armário de Ruth Miller', hint: 'uma clínica no centro',
        text: '"Trinta horas de plantão. Seis mordidas só hoje. Lavei as mãos até sangrar. Jesse, se você achar isso, leva a Lily pro porão do celeiro e tranca por dentro. Eu chego assim que me deixarem sair."' },
      { id: 'ml_4', locationIds: ['rc_school_classrooms'], title: 'Desenho de Lily, preso na parede', hint: 'uma sala de aula da escola',
        text: 'Giz de cera: quatro bonecos de palito e um cachorro na frente de um celeiro vermelho. Uma seta aponta para baixo do celeiro, com a legenda "NOSSO ESCONDERIJO SEGREDO". Assinado: LILY M., 7 ANOS.' },
      { id: 'ml_5', locationIds: ['fm_farm_store'], title: 'Recado de Jesse no balcão', hint: 'a loja agropecuária',
        text: '"Peguei o antibiótico de cavalo da prateleira de trás. Vou pagar depois, juro. Minha irmã está com febre e minha mãe não voltou. — Jesse Miller, Fazenda Miller, 16 anos."' },
    ],
  },
  // ───────────── Fotos com recado no verso ─────────────
  {
    id: 'foto_motel', title: 'A polaroid do quarto 12', kind: 'stash', appears: 'search', locationId: 'hw_motel', targetName: 'Fundo falso atrás do espelho do quarto 12',
    teaser: 'Uma polaroid de um casal sorrindo, com recado no verso.', pieces: 'fotos',
    revealText: 'Alguém achou uma foto com um recado no verso. O lugar da foto não tem nome — vai ter que reconhecer e procurar lá.',
    claimText: 'O espelho sai da parede com um puxão. Atrás, um envelope gordo e uma mochila arrumada para uma viagem que não aconteceu.',
    reward: [{ itemId: 'hiking_bag', qty: 1 }, { itemId: 'whiskey', qty: 1 }, { itemId: 'painkillers', qty: 2 }, { itemId: 'car_keys', qty: 1 }, { itemId: 'map_county', qty: 1 }, { itemId: 'chocolate', qty: 3 }],
    fragments: [
      { id: 'ft_motel', itemId: 'old_photo', locationIds: ['res_house_01', 'res_house_03', 'res_house_05', 'res_house_07', 'rc_apartment_3b', 'hw_service_station'], title: 'Polaroid: o casal e a estrela de néon', hint: 'alguma casa ou apartamento',
        text: 'Um casal abraçado na frente de uma placa de néon em forma de estrela, metade das letras apagadas. Atrás deles, uma porta com o número 12. No verso: "Nosso quarto. Escondi o dinheiro da viagem atrás do espelho. Se eu me atrasar, vai na frente. — K."' },
    ],
  },
  {
    id: 'foto_escorregador', title: 'O tesouro do Danny', kind: 'stash', appears: 'search', locationId: 'res_playground', targetName: 'Caixa enterrada ao pé do escorregador',
    teaser: 'Uma foto de criança, com recado no verso.', pieces: 'fotos',
    revealText: 'Alguém achou uma foto com um recado no verso. O lugar da foto não tem nome — vai ter que reconhecer e procurar lá.',
    claimText: 'A terra está fofa ao pé do escorregador. Uma lata de biscoito enferrujada: bolinhas de gude, figurinhas, uma lanterna e o que um menino de oito anos acha que se leva para o fim do mundo.',
    reward: [{ itemId: 'flashlight', qty: 1 }, { itemId: 'chocolate', qty: 4 }, { itemId: 'lighter', qty: 1 }, { itemId: 'soda', qty: 2 }, { itemId: 'bandage', qty: 2 }],
    fragments: [
      { id: 'ft_danny', itemId: 'old_photo', locationIds: ['res_house_02', 'res_house_04', 'res_house_08', 'res_house_09', 'rc_school_classrooms'], title: 'Foto: um menino no balanço quebrado', hint: 'alguma casa do bairro',
        text: 'Um menino banguela pendurado num balanço com uma corrente arrebentada. Ao fundo, um escorregador amarelo e casas iguais de telhado cinza. No verso, letra de criança: "LUGAR SECRETO DO DANNY. A CAIXA DO TESOURO TÁ ENTERRADA NO PÉ DO ESCORREGADOR. NÃO CONTA PRA NINGUÉM."' },
    ],
  },
  {
    id: 'foto_torre', title: 'O turno da noite', kind: 'stash', appears: 'search', locationId: 'pr_tower', targetName: 'Tábua solta no piso da torre',
    teaser: 'Uma foto tirada do alto, com recado no verso.', pieces: 'fotos',
    revealText: 'Alguém achou uma foto com um recado no verso. O lugar da foto não tem nome — vai ter que reconhecer e procurar lá.',
    claimText: 'A tábua cede com um rangido. Embaixo: uma garrafa pela metade, um binóculo embrulhado num pano e uma caixa de munição que não estava em nenhum inventário oficial.',
    reward: [{ itemId: 'binoculars', qty: 1 }, { itemId: 'whiskey', qty: 1 }, { itemId: 'ammo_12g', qty: 10 }, { itemId: 'cigarettes', qty: 4 }, { itemId: 'flashlight', qty: 1 }],
    fragments: [
      { id: 'ft_torre', itemId: 'old_photo', locationIds: ['pr_guard_room', 'pr_parking', 'hw_motel', 'rc_police', 'res_house_10'], title: 'Foto: um pátio visto do alto', hint: 'algum lugar onde guardas passavam',
        text: 'Foto tirada de cima, de noite, com flash: um pátio de concreto cercado de arame farpado, uma quadra de basquete sem rede, holofotes. No verso: "Turno da noite de novo. A garrafa fica no lugar de sempre, embaixo da tábua solta. Não conta pro sargento. — G."' },
    ],
  },
];

export const fragmentById = (id: string) => {
  for (const m of MYSTERIES) { const f = m.fragments.find((x) => x.id === id); if (f) return { mystery: m, fragment: f }; }
  return null;
};
