/** Marcas que o Dia 1 deixa no personagem. Aparecem na crônica e no diário; servem de gancho de RP. */
import type { MarkDef } from './types.js';

export const MARKS: MarkDef[] = [
  { id: 'largou_o_posto', name: 'Largou o posto', text: 'No primeiro dia, você deixou o trabalho para trás e foi cuidar da própria vida.' },
  { id: 'primeiro_morto', name: 'Viu o primeiro morto levantar', text: 'Você sabe o que eles são antes de quase todo mundo.' },
  { id: 'primeiro_sangue', name: 'Primeiro sangue', text: 'Derrubou um infectado com as próprias mãos no primeiro dia.' },
  { id: 'atirou_civil', name: 'Atirou num "civil"', text: 'Na hora, ainda parecia uma pessoa.' },
  { id: 'salvou_crianca', name: 'Salvou uma criança', text: 'Alguém, em algum lugar, deve a vida a você.' },
  { id: 'deixou_para_tras', name: 'Deixou alguém para trás', text: 'Você ainda ouve os gritos quando fecha os olhos.' },
  { id: 'escondeu_mordida', name: 'Escondeu uma ferida', text: 'Ninguém viu. Ainda.' },
  { id: 'mentiu_bloqueio', name: 'Mentiu na triagem', text: 'Passou pela barreira com um segredo.' },
  { id: 'cumpriu_ordens', name: 'Cumpriu as ordens', text: 'Fez o que mandaram, mesmo quando era errado.' },
  { id: 'desertor', name: 'Desertor', text: 'Largou o posto quando tudo desabou.' },
  { id: 'testemunha', name: 'Testemunha', text: 'Tem no celular a prova do que aconteceu na barreira.' },
  { id: 'segredo_fabrica', name: 'Sabe o que a Ashcroft fazia', text: 'O "vazamento controlado" nunca foi controlado.' },
  { id: 'abriu_arsenal', name: 'Abriu o arsenal', text: 'Decidiu quem ia ter uma arma no primeiro dia.' },
  { id: 'ultimo_plantao', name: 'Último plantão', text: 'Ficou com os pacientes até não dar mais.' },
  { id: 'abandonou_plantao', name: 'Abandonou o plantão', text: 'Saiu pela porta dos fundos com o que conseguiu carregar.' },
  { id: 'voltou_familia', name: 'Voltou pela família', text: 'Arriscou tudo para tentar encontrar quem amava.' },
  { id: 'protegeu_estranho', name: 'Protegeu um estranho', text: 'Ficou entre um desconhecido e a morte.' },
  { id: 'saqueador', name: 'Saqueou no caos', text: 'Pegou o que não era seu antes de todo mundo.' },
  { id: 'lobo_solitario', name: 'Lobo solitário', text: 'Passou o primeiro dia sem ninguém do lado.' },
  { id: 'apagou_cidade', name: 'Apagou a cidade', text: 'A escuridão de Raven Creek tem a sua assinatura.' },
  { id: 'manteve_luz', name: 'Manteve a luz acesa', text: 'Por algumas horas, a cidade ainda tinha energia graças a você.' },
  { id: 'panico', name: 'Travou no pânico', text: 'O corpo não obedeceu quando mais precisava.' },
  { id: 'mao_firme', name: 'Mão firme', text: 'Não tremeu quando precisou.' },
  { id: 'sobreviveu_dia1', name: 'Sobreviveu ao Dia 1', text: 'Viu o mundo acabar e ainda está de pé.' },
];
