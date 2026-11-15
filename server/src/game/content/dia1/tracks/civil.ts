/**
 * Trilha CIVIL: todas as profissões sem trilha própria, cada uma começando no seu trabalho.
 * Cidade (mecânico, desempregado, atleta, professor, cozinheiro, marceneiro) → Lanchonete da Mabel (h_lanchonete).
 * Rural (caçador, agricultor) → Fazenda Miller (h_fazenda). Daí, todos seguem para o bloqueio da rodovia no ato 4.
 */
import type { Beat, Track } from '../types.js';
import { CIVIL_A } from './civil_a.js';
import { CIVIL_B } from './civil_b.js';
import { CIVIL_C } from './civil_c.js';

const ROUTE: [string, string][] = [['mechanic', 'mec1'], ['unemployed', 'des1'], ['athlete', 'atl1'], ['teacher', 'prof1'], ['cook', 'coz1'], ['carpenter', 'mar1'], ['hunter', 'cac1'], ['farmer', 'agr1']];
/** Roteador: cada grupo civil começa pela batida da sua profissão. */
const router: Beat[] = ROUTE.map(([prof, beat], i) => ({ id: `civ_r${i}`, act: 1, if: { prof: [prof] }, next: beat, else: i + 1 < ROUTE.length ? `civ_r${i + 1}` : 'des1' }));

export const CIVIL: Track = {
  id: 'civil', name: 'Civis', professions: ['mechanic', 'unemployed', 'athlete', 'teacher', 'cook', 'carpenter', 'hunter', 'farmer'], location: 'rc_apartment_3b', maxGroup: 4, start: 'civ_r0',
  startAt: { mechanic: 'rc_workshop', unemployed: 'rc_apartment_3b', athlete: 'res_avenue', teacher: 'rc_school_classrooms', cook: 'rc_restaurant', carpenter: 'in_warehouse_b', hunter: 'fo_hunting_cabin', farmer: 'fm_miller_farm' },
  beats: [
    ...router,
    ...CIVIL_A, ...CIVIL_B, ...CIVIL_C,
    { id: 'civ_cidade', act: 3, say: [{ thread: 'cena', from: 'sistema', text: 'A Lanchonete da Mabel, com as persianas meio abaixadas e gente lá dentro.', wait: 3 }], hub: 'h_lanchonete' },
    { id: 'civ_rural', act: 3, say: [{ thread: 'cena', from: 'sistema', text: 'A sede da Fazenda Miller aparece no fim da estrada de terra.', wait: 3 }], hub: 'h_fazenda' },
  ],
};
