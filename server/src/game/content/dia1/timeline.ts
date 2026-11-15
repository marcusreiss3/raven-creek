/**
 * Linha do tempo global do Dia 1: chega no celular de TODO mundo ao mesmo tempo, não importa a trilha.
 * É o "pano de fundo" da cidade desabando: notícias, rede social, família, alertas da Defesa Civil, sinal e energia.
 *
 * Os minutos abaixo são "de projeto" (0–150); o motor os converte para a sessão real de 120 min (mapDesignMinute).
 * Relógio do jogo: começa às 07:00 e anda 6× (≈ 22h no fim).
 */
import type { TimelineEntry } from './types.js';

export const SESSION_MINUTES = 120;

export const TIMELINE: TimelineEntry[] = [
  // ── Ato 1: segunda-feira comum
  { at: 0, family: 'manha', msgs: [
    { thread: 'noticias', from: 'RC Agora', text: 'Trânsito lento na Rota 9: obras na ponte seguem até sexta.' },
  ] },
  { at: 3, msgs: [{ thread: 'social', from: 'Dona Rosa', text: 'Alguém mais ouviu sirene às 5 da manhã lá pros lados da fábrica? Meu cachorro não parou de latir 🐕', img: 'cachorro_janela', comments: [{ from: 'Earl T.', text: 'ouvi sim. achei que era treino dos bombeiros' }] }] },
  { at: 6, msgs: [{ thread: 'noticias', from: 'RC Agora', text: 'Fábrica Ashcroft confirma "vazamento controlado" no setor B. Prefeitura diz que não há risco à população.', img: 'ashcroft_vazamento' }] },
  { at: 10, msgs: [{ thread: 'social', from: 'Tyler M.', text: 'KKKKKK briga feia no posto Gulf agora, o cara MORDEU o frentista 😂😂 tá louco', media: 'Vídeo · 0:14', img: 'posto_gulf', comments: [{ from: 'Danny R.', text: 'KKKKKKKK o cara tá muito louco' }, { from: 'Sue W.', text: 'isso não tem graça, chamem uma ambulância' }] }] },
  { at: 13, family: 'fabrica' },

  // ── Ato 2: primeiros casos
  { at: 16, msgs: [{ thread: 'noticias', from: 'RC Agora', text: 'Hospital St. Mary registra aumento de atendimentos com febre alta e "comportamento agressivo". Secretaria pede calma.', img: 'hospital_fila' }] },
  { at: 20, msgs: [{ thread: 'social', from: 'Kayla B.', text: 'minha vizinha tá batendo a cabeça na janela faz meia hora e não responde ninguém. alguém chama a polícia??', img: 'vizinha_janela', comments: [{ from: 'Dona Rosa', text: 'liguei pro 911 e deu ocupado' }] }] },
  { at: 24, msgs: [{ thread: 'social', from: 'Raven Rede', text: 'Este vídeo foi removido por violar as diretrizes da comunidade.', media: 'Vídeo indisponível' }] },
  { at: 28, msgs: [{ thread: 'noticias', from: 'RC Agora', text: 'Prefeitura pede que moradores EVITEM a região da Fábrica Ashcroft. Bombeiros controlam incêndio no local.', img: 'incendio_ashcroft' }] },
  { at: 32, family: 'tv' },
  { at: 36, msgs: [{ thread: 'social', from: 'Marcus T.', text: 'GENTE ISSO NÃO É BRINCADEIRA. vi um cara levantar depois de levar 3 tiros na frente do mercado da esquina', img: 'silhueta_viatura', comments: [{ from: 'Tyler M.', text: 'mano apaga isso' }, { from: 'Becca K.', text: 'é o mesmo cara do posto??' }] }] },
  { at: 40, signal: 3, msgs: [{ thread: 'alerta', from: 'Operadora', text: 'Rede congestionada na sua região. Mensagens e chamadas podem atrasar.' }] },
  { at: 43, msgs: [{ thread: 'noticias', from: 'RC Agora', text: 'Escolas da região dispensam alunos mais cedo. Pais devem buscar as crianças pessoalmente.', img: 'escola_saida' }] },

  // ── Ato 3: caos
  { at: 46, msgs: [{ thread: 'alerta', from: 'Defesa Civil', text: 'ALERTA EXTREMO · Raven Creek: ameaça grave à saúde pública. Permaneça em local fechado. NÃO se aproxime de pessoas feridas ou agressivas. Aguarde instruções.' }] },
  { at: 50, family: 'panico' },
  { at: 54, msgs: [{ thread: 'social', from: 'Kayla B.', text: 'ESTÃO ATACANDO GENTE NA RUA PRINCIPAL. ALGUÉM AJUDA. EU TÔ TRANCADA NO BANHEIRO DA LANCHONETE', media: 'Ao vivo · encerrada', img: 'live_lanchonete', comments: [{ from: 'Sue W.', text: 'kayla fica aí, não sai' }, { from: 'Danny R.', text: 'cadê a polícia???' }] }] },
  { at: 59, msgs: [{ thread: 'noticias', from: 'RC Agora', text: 'Governo do estado decreta zona de contenção. Exército do Fort Ashby assume o controle da Rota 9.', img: 'exercito_rota9' }] },
  { at: 64, msgs: [{ thread: 'noticias', from: 'RC Agora', text: 'Erro 503 · Serviço temporariamente indisponível.' }] },
  { at: 69, family: 'fuga' },
  { at: 74, msgs: [{ thread: 'social', from: 'Raven Rede', text: '"alguém sabe se o hospital ainda tá atendendo" · 312 comentários · 0 respostas úteis' }] },
  { at: 80, signal: 2, msgs: [{ thread: 'alerta', from: 'Operadora', text: 'Chamadas de voz indisponíveis. Use apenas SMS.' }] },

  // ── Ato 4: fuga
  { at: 88, msgs: [{ thread: 'alerta', from: 'Defesa Civil', text: 'ALERTA EXTREMO · Evacuação pela Rota 9 encerra às 18h. Triagem obrigatória no Posto de Controle da Rodovia. Pessoas feridas DEVEM se identificar.' }] },
  { at: 95, powerOut: true, msgs: [{ thread: 'cena', from: 'sistema', text: 'As luzes piscam e apagam. A cidade inteira fica em silêncio por um segundo. Depois, os alarmes de carro.' }] },
  { at: 101, family: 'fim' },
  { at: 110, signal: 1, msgs: [{ thread: 'alerta', from: 'Operadora', text: 'Sem serviço.' }] },
  { at: 118, msgs: [{ thread: 'alerta', from: 'Defesa Civil', text: 'ALERTA · Toque de recolher. Não se aproxime das barreiras militares. Ordem de atirar em quem desobedecer.' }] },

  // ── Ato 5: a primeira noite
  { at: 132, msgs: [{ thread: 'alerta', from: 'Defesa Civil', text: 'Esta é uma mensagem automática. Fique onde está. Economize água. Aguarde resgate.' }] },
  { at: 138, signal: 0 },
];
