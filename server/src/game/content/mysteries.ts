/**
 * Mistérios: bilhetes e diários espalhados pelo condado. Cada fragmento só existe uma vez no servidor —
 * quem acha primeiro leva o papel, mas o texto vai para o diário de todos. Juntando as peças,
 * descobre-se um código de cofre ou o lugar de um esconderijo.
 */
export type MysteryReward = { itemId: string; qty: number }[];
export type Fragment = { id: string; locationIds: string[]; title: string; text: string; hint: string };
export type Mystery = {
  id: string; title: string; teaser: string;
  kind: 'safe' | 'stash';
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
];

export const fragmentById = (id: string) => {
  for (const m of MYSTERIES) { const f = m.fragments.find((x) => x.id === id); if (f) return { mystery: m, fragment: f }; }
  return null;
};
