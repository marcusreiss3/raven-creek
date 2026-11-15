/**
 * Vida ambiente do Dia 1: quando um grupo fica parado esperando (fim de ato adiantado, encontro ainda fechado),
 * o celular e o entorno continuam acontecendo. (As mensagens da família ficam em family.ts: cada um tem a sua.) Uma linha a cada ~1,5 min, sem repetir, sem depender do lugar.
 */
import type { Msg } from './types.js';

type Amb = Pick<Msg, 'thread' | 'from' | 'text' | 'img' | 'comments'>;

export const AMBIENT: Record<number, Amb[]> = {
  1: [
    { thread: 'social', from: 'Prefeitura de Raven Creek', text: 'Feira de outono no sábado na praça! 🍂 Torta de maçã da Dona Rosa confirmada.', img: 'feira_outono', comments: [{ from: 'Dona Rosa', text: 'vou levar duas desta vez 🥧' }] },
    { thread: 'cena', from: 'sistema', text: 'Duas viaturas passam ao longe, sirene ligada, em direção à fábrica.' },
    { thread: 'social', from: 'Becca K.', text: 'alguém sabe pq a escola mandou bilhete sobre "vacinação extra"??', img: 'bilhete_escola' },
    { thread: 'cena', from: 'sistema', text: 'Um helicóptero cruza o céu baixo, sem identificação, e some atrás das colinas.' },
  ],
  2: [
    { thread: 'cena', from: 'sistema', text: 'Ao longe, três tiros seguidos. Depois silêncio. Depois um grito que não termina.' },
    { thread: 'social', from: 'Tyler M.', text: 'apaguei o vídeo do posto. não tem mais graça. alguém sabe do frentista?' },
    { thread: 'cena', from: 'sistema', text: 'Um carro passa em alta velocidade na contramão, buzinando sem parar.' },
    { thread: 'social', from: 'Dona Rosa', text: 'meu vizinho tá parado no quintal olhando pro nada há 1 hora. a esposa dele não atende.', img: 'vizinho_quintal' },
    { thread: 'cena', from: 'sistema', text: 'Um cachorro passa correndo, coleira arrastando no chão, sem dono atrás.' },
  ],
  3: [
    { thread: 'cena', from: 'sistema', text: 'Um alarme de carro dispara ao longe e ninguém desliga. Ele toca até a bateria acabar.' },
    { thread: 'social', from: 'Doug P.', text: 'NÃO SAIAM DE CASA. ELES ESTÃO NA RUA PRINCIPAL. REPITO NÃO SAIAM', img: 'fumaca_cidade' },
    { thread: 'cena', from: 'sistema', text: 'O cheiro de fumaça chega com o vento. Em algum lugar, uma casa inteira está pegando fogo.' },
    { thread: 'cena', from: 'sistema', text: 'Passos arrastados do outro lado da parede. Param. Recomeçam. Param.' },
    { thread: 'social', from: 'Laura S.', text: 'se alguém ler isso, estou no sótão da Rua Elm 14 com minha filha. por favor', img: 'sotao' },
    { thread: 'cena', from: 'sistema', text: 'Um avião militar passa baixo, tão baixo que as janelas tremem.' },
  ],
  4: [
    { thread: 'cena', from: 'sistema', text: 'Escureceu de vez. Sem os postes, a cidade é só um borrão com alguns pontos de fogo.' },
    { thread: 'cena', from: 'sistema', text: 'Um gemido longo, de muitas gargantas ao mesmo tempo, vem de algum lugar ao sul.' },
    { thread: 'social', from: 'Raven Rede', text: 'Não foi possível carregar o feed. Tente novamente mais tarde.' },
    { thread: 'cena', from: 'sistema', text: 'Rajadas de metralhadora ao longe. Depois, alto-falantes repetindo algo que o vento não deixa entender.' },
  ],
  5: [
    { thread: 'cena', from: 'sistema', text: 'O frio da noite chega. Ninguém fala muito. Todo mundo escuta.' },
    { thread: 'cena', from: 'sistema', text: 'Uma luz de lanterna pisca três vezes numa janela distante. Depois apaga para sempre.' },
    { thread: 'cena', from: 'sistema', text: 'O celular vibra uma vez, sem mensagem nenhuma. Só a vibração.' },
  ],
};
