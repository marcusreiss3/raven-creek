/**
 * Trilha da FÁBRICA ASHCROFT (marco zero). Bombeiros chamados para o incêndio no Setor B; engenheiros no escritório da
 * fábrica (sabem o que é o Projeto Lázaro); eletricistas na subestação ao lado. Cada um começa no seu canto e as
 * escolhas se cruzam; no ato 3 levam os feridos para o hospital (h_hospital).
 */
import type { Track } from '../types.js';

export const FABRICA: Track = {
  id: 'fabrica', name: 'Fábrica Ashcroft', professions: ['firefighter', 'engineer', 'electrician'], location: 'in_gate', maxGroup: 4, start: 'f0',
  startAt: { firefighter: 'in_gate', engineer: 'in_factory_office', electrician: 'in_substation' },
  beats: [
    { id: 'f0', act: 1, if: { prof: ['firefighter'] }, next: 'b1', else: 'f0b' },
    { id: 'f0b', act: 1, if: { prof: ['engineer'] }, next: 'e1', else: 'el1' },

    // ───────────── BOMBEIROS
    { id: 'b1', act: 1, say: [
      { thread: 'cena', from: 'sistema', text: '07:00 · Caminhão Auto-Bomba 3 parado no portão do Distrito Industrial. Fumaça cinza saindo de um galpão da Ashcroft.', wait: 3 },
      { thread: 'dm:capitao', from: 'Cap. Ruiz', text: 'Equipe, incêndio no Setor B da Ashcroft. A segurança da fábrica diz que é "pequeno e controlado". Não acredito em nada que essa empresa fala.' },
      { thread: 'grupo', from: 'ABT-3', text: '{grupo} · Distrito Industrial', wait: 4 },
    ], ask: { kind: 'poll', text: 'O segurança da Ashcroft não quer abrir o portão. "Só com autorização da diretoria."', options: [
      { id: 'forcar', label: '🪓 Abrir no machado: incêndio não espera diretoria', expert: ['firefighter'], check: { stat: 'strength', base: 55, label: 'Arrombar o cadeado' }, effects: [{ flag: 'entrou_forca' }], failEffects: [{ stress: 5 }, { flag: 'entrou_forca' }], next: 'b1b' },
      { id: 'esperar', label: '📞 Esperar a autorização', effects: [{ flag: 'esperou_autorizacao' }, { stress: 4 }], next: 'b1b' },
    ], timeout: 50 } },
    { id: 'b1b', act: 1, at: 'in_gate', say: [
      { thread: 'cena', from: 'sistema', text: 'No portão, uma pequena multidão de curiosos filmando com o celular. Uma repórter do RC Agora enfia um microfone na sua cara: "Bombeiro, é verdade que é vazamento químico?"', wait: 5 },
    ], ask: { kind: 'poll', text: 'A repórter e os curiosos.', options: [
      { id: 'entrevista', label: '🎙️ "Ainda não sabemos. Afastem-se do portão."', effects: [{ flag: 'na_tv' }], next: 'b2' },
      { id: 'afastar', label: '🚧 Isolar a área com fita e afastar todo mundo', effects: [{ mark: 'protegeu_estranho', to: 'each' }], next: 'b2' },
    ], timeout: 40 } },
    { id: 'b2', act: 1, at: 'in_factory_floor', say: [
      { thread: 'cena', from: 'sistema', text: 'Vinte minutos depois, a autorização chega por telefone. Lá dentro, o fogo já tomou metade do Setor B.', if: { flag: 'esperou_autorizacao' }, wait: 5 },
      { thread: 'cena', from: 'sistema', text: 'Chão de fábrica. O fogo não é o pior: tem funcionários de macacão branco parados entre as máquinas, olhando para a parede. Um deles bate a testa no metal, devagar, sem parar.', wait: 6 },
      { thread: 'dm:capitao', from: 'Cap. Ruiz', text: 'Tirem os civis primeiro. Depois o fogo.', wait: 5 },
    ], ask: { kind: 'poll', text: 'Os funcionários "parados" no meio da fumaça.', options: [
      { id: 'resgatar', label: '🧑‍🚒 Resgatar: um por um, pra fora', check: { stat: 'endurance', base: 50, label: 'Aguentar a fumaça' }, effects: [{ mark: 'protegeu_estranho', to: 'each' }, { flag: 'resgatou' }], failEffects: [{ wound: 'burn', region: 'left_arm', severity: 0.3, to: 'one' }, { flag: 'resgatou' }], next: 'b3' },
      { id: 'fogo', label: '🧯 Fogo primeiro, eles saem sozinhos', effects: [{ flag: 'apagou_fogo' }], next: 'b3' },
    ], timeout: 45 } },
    { id: 'b3', act: 2, say: [
      { thread: 'cena', from: 'sistema', text: 'Quando vocês encostam no primeiro funcionário, ele vira com tudo e crava os dentes no capacete de {escolhido}.', if: { flag: 'resgatou' }, wait: 4 },
      { thread: 'cena', from: 'sistema', text: 'Com o fogo controlado, os funcionários começam a andar na direção de vocês. Todos ao mesmo tempo.', if: { flag: 'apagou_fogo' }, wait: 4 },
    ], effects: [{ mark: 'primeiro_morto', to: 'each' }],
      combat: { zombies: 2, types: ['walker'], reason: 'Funcionários da Ashcroft atacam no meio da fumaça', win: 'b4', lose: 'b4l' } },
    { id: 'b4l', act: 2, say: [{ thread: 'cena', from: 'sistema', text: 'O Capitão Ruiz puxa vocês pelos tirantes até o pátio. Ele está sangrando no pescoço e finge que não é nada.', wait: 4 }], effects: [{ stress: 10 }, { flag: 'ruiz_mordido' }], next: 'b4', wait: 2 },
    { id: 'b4', act: 2, at: 'in_gate', say: [
      { thread: 'cena', from: 'sistema', text: 'No pátio, um engenheiro de crachá da Ashcroft corre até vocês: "Tem gente presa no escritório do segundo andar. E tem uma porta no Setor B que vocês NÃO PODEM abrir."', wait: 6 },
    ], hub: 'h_fabrica' },

    // ───────────── ENGENHEIROS
    { id: 'e1', act: 1, at: 'in_factory_office', say: [
      { thread: 'cena', from: 'sistema', text: '07:00 · Ashcroft Biotech, escritório de engenharia, segundo andar. O alarme do Setor B tocou a madrugada inteira e foi silenciado às 6h.', wait: 3 },
      { thread: 'dm:diretor', from: 'Diretor Kessler', text: 'Bom dia. Hoje o dia é normal, entendido? Qualquer pergunta de fora: "vazamento controlado". Assinem o termo de sigilo que está na mesa de vocês.', wait: 6 },
    ], ask: { kind: 'each', text: 'O termo de sigilo está na sua mesa.', options: [
      { id: 'assinar', label: '✍️ Assinar. Você precisa desse emprego.', effects: [{ flag: 'assinou', to: 'chooser' }], next: 'e1b' },
      { id: 'servidor', label: '💻 Antes, entrar no servidor e ver o que é o Setor B', check: { stat: 'intellect', base: 50, label: 'Achar os arquivos certos' }, effects: [{ mark: 'segredo_fabrica', to: 'chooser' }, { flag: 'sabe_lazaro', to: 'chooser' }], failEffects: [{ stress: 6, to: 'chooser' }], next: 'e1b' },
    ], timeout: 60 } },
    { id: 'e1b', act: 1, say: [
      { thread: 'cena', from: 'sistema', text: 'Reunião das 7h30 na sala de vidro. O Diretor Kessler sorri demais. Ninguém do Setor B apareceu. O café da máquina tem gosto de medo.', wait: 5 },
    ], ask: { kind: 'each', text: 'O Kessler pergunta se alguém tem dúvidas.', options: [
      { id: 'quieto', label: '🤐 Ficar quieto e anotar coisas no caderno', next: 'e2' },
      { id: 'perguntar', label: '✋ "Cadê o pessoal do Setor B, diretor?"', effects: [{ flag: 'kessler_desconfia' }, { stress: 4, to: 'chooser' }], next: 'e2' },
    ], timeout: 45 } },
    { id: 'e2', act: 1, say: [
      { thread: 'cena', from: 'sistema', text: 'Pasta "LÁZARO". Um vírus modificado para "reanimação de tecido necrosado". Teste em humanos, fase 1, seis voluntários. Relatório de ontem: "contenção comprometida".', if: { flag: 'self:sabe_lazaro' }, wait: 7 },
      { thread: 'cena', from: 'sistema', text: 'Do corredor, o som de vidro quebrando. Alguém do RH grita. Depois para de gritar.', wait: 8 },
    ], ask: { kind: 'poll', text: 'Tem algo no corredor do segundo andar.', options: [
      { id: 'trancar', label: '🔒 Trancar a sala e ligar para a segurança', effects: [{ flag: 'trancados' }, { stress: 6 }], next: 'e3' },
      { id: 'olhar', label: '🚪 Abrir uma fresta e olhar', check: { stat: 'perception', base: 50, label: 'Ver sem ser visto' }, effects: [{ mark: 'primeiro_morto', to: 'each' }], failEffects: [{ wound: 'scratch', region: 'right_hand', severity: 0.25, to: 'one', infect: 0.35 }, { flag: 'mordido', to: 'one' }], next: 'e3' },
    ], timeout: 45 } },
    { id: 'e3', act: 2, say: [
      { thread: 'dm:diretor', from: 'Diretor Kessler', text: 'Equipe de engenharia: apaguem o servidor do Projeto Lázaro. TUDO. É uma ordem.', wait: 6 },
    ], ask: { kind: 'each', text: 'Apagar os arquivos do Projeto Lázaro?', options: [
      { id: 'apagar', label: '🗑️ Apagar tudo', effects: [{ flag: 'apagou_lazaro' }, { mark: 'cumpriu_ordens', to: 'chooser' }], next: 'e3b' },
      { id: 'copiar', label: '💾 Copiar para o celular antes de apagar', effects: [{ mark: 'testemunha', to: 'chooser' }, { mark: 'segredo_fabrica', to: 'chooser' }, { flag: 'tem_prova', to: 'chooser' }, { battery: -6, to: 'chooser' }], next: 'e3b' },
      { id: 'recusar', label: '✋ Recusar', effects: [{ flag: 'recusou_kessler' }, { stress: 4, to: 'chooser' }], next: 'e3b' },
    ], timeout: 45 } },
    { id: 'e3b', act: 2, at: 'in_truck_depot', say: [
      { thread: 'cena', from: 'sistema', text: 'Pela janela, vocês veem o Diretor Kessler correndo pelo pátio de caminhões com uma maleta e dois HDs debaixo do braço, rumo ao carro dele.', wait: 5 },
    ], ask: { kind: 'poll', text: 'O Kessler está fugindo com as provas.', options: [
      { id: 'parar', label: '🏃 Correr atrás e tirar a maleta dele', check: { stat: 'athletics', base: 45, label: 'Alcançar o Kessler' }, effects: [{ mark: 'testemunha', to: 'chooser' }, { flag: 'pegou_hd' }, { item: 'electronic_parts', to: 'chooser' }], failEffects: [{ stress: 6 }], next: 'e4' },
      { id: 'deixar', label: '👀 Deixar ele ir. Não é problema de vocês.', next: 'e4' },
    ], timeout: 35 } },
    { id: 'e4', act: 2, say: [
      { thread: 'cena', from: 'sistema', text: 'Pela janela, vocês veem o caminhão dos bombeiros entrar no pátio. Lá embaixo, o fogo e os funcionários de macacão branco.', wait: 5 },
      { thread: 'cena', from: 'sistema', text: 'A porta da sala treme. Alguém (algo) do outro lado.', wait: 20 },
    ], hub: 'h_fabrica' },

    // ───────────── ELETRICISTAS
    { id: 'el1', act: 1, at: 'in_substation', say: [
      { thread: 'cena', from: 'sistema', text: '07:00 · Subestação Elétrica do Distrito Industrial. Zumbido dos transformadores. O painel da Ashcroft pisca vermelho: sobrecarga no Setor B.', wait: 3 },
      { thread: 'dm:central_eletrica', from: 'Central Elétrica', text: 'Equipe, a Ashcroft pediu religamento do Setor B. Tem algum sistema de refrigeração lá que não pode desligar.', wait: 6 },
    ], ask: { kind: 'poll', text: 'Religar o Setor B da Ashcroft?', options: [
      { id: 'religar', label: '⚡ Religar: é o nosso trabalho', check: { stat: 'electrical', base: 50, label: 'Religar sem queimar o painel' }, effects: [{ flag: 'religou' }], failEffects: [{ wound: 'burn', region: 'right_hand', severity: 0.3, to: 'one' }, { flag: 'religou' }], next: 'el1b' },
      { id: 'negar', label: '🚫 Negar até entender o que está acontecendo lá', effects: [{ flag: 'negou_religar' }], next: 'el1b' },
    ], timeout: 50 } },
    { id: 'el1b', act: 1, say: [
      { thread: 'cena', from: 'sistema', text: 'O Gus, eletricista mais velho da equipe, chega com rosquinhas: "Trinta anos nessa subestação. Nunca vi a Ashcroft puxar tanta energia de madrugada. Que diabo eles ligam lá dentro?"', wait: 5 },
    ], ask: { kind: 'each', text: 'Você e o Gus:', options: [
      { id: 'logs', label: '📈 Puxar o histórico de consumo da Ashcroft', check: { stat: 'electrical', base: 45, label: 'Ler os registros' }, effects: [{ flag: 'viu_consumo' }], next: 'el2' },
      { id: 'rosquinha', label: '🍩 Rosquinha, café e fofoca', effects: [{ stress: -4, to: 'chooser' }], next: 'el2' },
    ], timeout: 45 } },
    { id: 'el2', act: 1, say: [
      { thread: 'cena', from: 'sistema', text: 'Com o Setor B religado, as portas automáticas da Ashcroft destravam por um instante. O telefone da central não para de tocar.', if: { flag: 'religou' }, wait: 6 },
      { thread: 'cena', from: 'sistema', text: 'O histórico mostra: todo dia, das 2h às 4h, o Setor B puxa a energia de um hospital inteiro. Ontem, às 3h12, o consumo despencou a zero. E voltou.', if: { flag: 'viu_consumo' }, wait: 6 },
      { thread: 'cena', from: 'sistema', text: 'Pelas câmeras da subestação, vocês veem gente saindo do Setor B. Andando torto. Indo para o portão.', wait: 6 },
    ], next: 'el3', wait: 30 },
    { id: 'el3', act: 2, say: [
      { thread: 'dm:prefeitura', from: 'Prefeitura', text: 'Subestação, aqui é o gabinete do prefeito. Precisamos que a cidade tenha energia até a evacuação. Hospital e delegacia são prioridade. Vocês conseguem?', wait: 6 },
    ], ask: { kind: 'poll', text: 'A cidade depende da subestação.', options: [
      { id: 'manter', label: '💡 Ficar e manter a energia', check: { stat: 'electrical', base: 45, label: 'Equilibrar a carga da cidade' }, effects: [{ mark: 'manteve_luz', to: 'each' }, { flag: 'manteve_luz' }], failEffects: [{ stress: 8 }], next: 'el4' },
      { id: 'desligar', label: '🔌 Desligar tudo e sair: ninguém vai segurar isso', effects: [{ mark: 'apagou_cidade', to: 'each' }, { flag: 'apagou' }], next: 'el4' },
    ], timeout: 50 } },
    { id: 'el4', act: 2, say: [
      { thread: 'cena', from: 'sistema', text: 'Duas figuras de macacão branco batem na grade da subestação. Depois quatro.', wait: 5 },
    ], effects: [{ mark: 'primeiro_morto', to: 'each' }],
      combat: { zombies: 2, types: ['walker'], reason: 'Funcionários da Ashcroft cercam a subestação', win: 'el5', lose: 'el5l' } },
    { id: 'el5l', act: 2, say: [{ thread: 'cena', from: 'sistema', text: 'Vocês escapam pela escada de serviço, deixando as ferramentas para trás.', wait: 4 }], effects: [{ stress: 10 }], next: 'el5', wait: 2 },
    { id: 'el5', act: 2, say: [{ thread: 'cena', from: 'sistema', text: 'Vocês cortam caminho pelo pátio da Ashcroft. Tem um caminhão de bombeiro lá.', wait: 8 }], hub: 'h_fabrica' },
  ],
};
