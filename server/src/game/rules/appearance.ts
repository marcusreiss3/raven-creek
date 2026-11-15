/**
 * "Aparência que conta a história": o que outra pessoa percebe só de olhar para um personagem.
 * Nada de números: frases curtas, em ordem de gravidade. Ferimentos cobertos pela roupa só aparecem se sangrarem através dela.
 * Sintomas de doenças são descritos sem dizer qual doença é (a infecção zumbi continua oculta até o diagnóstico).
 */
import type { Needs } from '../../db/schema.js';

export type LookWound = { region: string; type: string; severity: number; bleeding: number; pain: number; bandaged: boolean; splinted: boolean; sutured: boolean };
export type LookCondition = { kind: string; stage: number };
export type LookInput = {
  needs: Needs;
  wounds: LookWound[];
  conditions: LookCondition[];
  /** Regiões cobertas por alguma roupa equipada. */
  covered: Set<string>;
  /** Encaixes de roupa ocupados (shirt, jacket, pants, boots...). */
  slots: Set<string>;
  amputations: string[];
  /** Nível de Medicina de quem observa: olhos treinados notam sinais sutis. */
  observerMedicine: number;
  now?: number;
};

const WHERE: Record<string, string> = {
  head: 'na cabeça', neck: 'no pescoço', torso: 'no peito', abdomen: 'na barriga', left_arm: 'no braço esquerdo', right_arm: 'no braço direito',
  left_hand: 'na mão esquerda', right_hand: 'na mão direita', left_leg: 'na perna esquerda', right_leg: 'na perna direita', left_foot: 'no pé esquerdo', right_foot: 'no pé direito',
};
const LEG_SIDE: Record<string, string> = { left_leg: 'esquerda', left_foot: 'esquerda', right_leg: 'direita', right_foot: 'direita' };
const ARM_SIDE: Record<string, string> = { left_arm: 'esquerdo', left_hand: 'esquerdo', right_arm: 'direito', right_hand: 'direito' };

export function describeAppearance(i: LookInput): string[] {
  const n = i.needs;
  const now = i.now ?? Date.now();
  const out: { p: number; t: string }[] = [];
  const add = (p: number, t: string) => out.push({ p, t });
  const open = i.wounds.filter((w) => w.severity > 0.05);

  // ── consciência e sangue
  if (n.unconscious) add(100, 'Está caído e não reage quando chamam.');
  if (n.blood < 45) add(95, n.unconscious ? 'A pele tem cor de cera e a respiração é fraca.' : 'A pele tem cor de cera; mal se sustenta de pé.');
  else if (n.blood < 65) add(80, 'Está com uma palidez que preocupa, e há sangue seco nas roupas.');
  else if (n.blood < 85 && open.some((w) => w.bleeding > 0)) add(60, 'Há manchas de sangue fresco na roupa.');

  // ── ferimentos visíveis
  const bleeders = open.filter((w) => w.bleeding > 0.05 && !w.bandaged).sort((a, b) => b.bleeding - a.bleeding);
  for (const w of bleeders.slice(0, 2)) {
    const where = WHERE[w.region] ?? 'no corpo';
    if (i.covered.has(w.region)) add(85, `O sangue atravessa o tecido da roupa, ${where}.`);
    else if (w.type === 'bite') add(90, `Tem uma mordida aberta ${where}, ainda sangrando.`);
    else if (w.region === 'head') add(85, 'Um corte na cabeça escorre sangue pelo rosto.');
    else add(84, `Sangra ${where}.`);
  }
  const bites = open.filter((w) => w.type === 'bite' && !w.bandaged && w.bleeding <= 0.05 && !i.covered.has(w.region));
  if (bites.length) add(88, `Há marcas de dentes ${WHERE[bites[0].region] ?? 'na pele'}.`);
  const bandaged = open.filter((w) => w.bandaged);
  if (bandaged.length) {
    const regions = [...new Set(bandaged.map((w) => WHERE[w.region]).filter(Boolean))];
    add(40, regions.length > 2 ? 'Tem curativos improvisados espalhados pelo corpo.' : `Tem um curativo improvisado ${regions.join(' e ')}.`);
  }
  for (const w of open.filter((x) => x.splinted).slice(0, 1)) add(45, `Usa uma tala ${WHERE[w.region] ?? 'improvisada'}.`);
  if (open.some((w) => w.region === 'head' && w.type === 'bruise' && w.severity > 0.3)) add(35, 'Tem um hematoma roxo no rosto.');

  // ── como se move
  const legHurt = open.filter((w) => (LEG_SIDE[w.region] && (w.type === 'fracture' || w.severity > 0.4))).sort((a, b) => b.severity - a.severity)[0];
  const legGone = i.amputations.find((a) => LEG_SIDE[a]);
  if (legGone) add(70, 'Move-se com dificuldade, se apoiando no que encontra.');
  else if (legHurt) add(70, `Manca da perna ${LEG_SIDE[legHurt.region]}.`);
  const armHurt = open.find((w) => ARM_SIDE[w.region] && (w.type === 'fracture' || w.severity > 0.5));
  if (armHurt) add(55, `Segura o braço ${ARM_SIDE[armHurt.region]} junto ao corpo, protegendo-o.`);

  // ── dor
  const painNow = open.reduce((s, w) => s + w.pain * (w.bandaged ? 0.7 : 1), 0);
  const medicated = (n.painkillerUntil ?? 0) > now;
  if (!medicated && painNow > 70) add(65, 'Contrai o rosto de dor a cada movimento.');
  else if (!medicated && painNow > 35) add(30, 'Mexe-se com cuidado, como quem sente dor.');

  // ── doenças: só sintomas, nunca o nome
  const zi = i.conditions.find((c) => c.kind === 'zombie_infection');
  const zs = zi?.stage ?? 0;
  if (zs >= 4) add(92, 'Murmura coisas sem sentido; o olhar está vidrado e as veias escuras marcam a pele.');
  else if (zs === 3) add(78, 'Parece confuso e não consegue fixar o olhar em ninguém.');
  else if (zs === 2) add(62, 'Está suando frio, com os olhos injetados de febre.');
  else if (zs === 1 && i.observerMedicine >= 3) add(50, 'Um olho treinado nota calafrios discretos e uma febre começando.');
  if (i.conditions.some((c) => c.kind === 'respiratory')) add(42, 'Tosse com frequência, uma tosse funda e catarrenta.');
  if (i.conditions.some((c) => c.kind === 'food_poisoning' || c.kind === 'waterborne')) add(44, 'Tem o rosto esverdeado e segura a barriga de vez em quando.');
  if (i.conditions.some((c) => c.kind === 'wound_infection')) add(48, i.observerMedicine >= 2 ? 'Um dos ferimentos está vermelho, inchado e com cheiro ruim.' : 'Há um cheiro ruim vindo de um dos ferimentos.');

  // ── frio e calor
  if (n.bodyTemp < 35.5) add(66, 'Treme de frio, com os lábios arroxeados.');
  else if (n.bodyTemp < 36.2) add(25, 'Esfrega os braços tentando se esquentar.');
  else if (n.bodyTemp > 38.3 && zs < 2) add(46, 'O rosto está afogueado e brilhando de suor.');

  // ── sono, fome, sede, fôlego
  if (n.sleepiness > 90) add(58, 'Mal consegue manter os olhos abertos.');
  else if (n.sleepiness > 75) add(48, 'Parece não dormir há dias: olheiras fundas, o olhar perdido.');
  else if (n.sleepiness > 55) add(20, 'Tem cara de noite mal dormida.');
  if (n.hunger > 85) add(56, 'A fome está estampada no rosto encovado; as mãos tremem.');
  else if (n.hunger > 65) add(28, 'Tem o rosto abatido de quem não come direito faz tempo.');
  if (n.thirst > 80) add(54, 'Os lábios estão rachados e secos.');
  else if (n.thirst > 60) add(22, 'Passa a língua nos lábios secos com frequência.');
  if (n.stamina < 15) add(38, 'Está ofegante, tentando recuperar o fôlego.');

  // ── cabeça
  if (n.stress > 85) add(52, 'Os olhos não param quietos; parece a um passo de desabar.');
  else if (n.stress > 65) add(26, 'Está com os nervos à flor da pele e se sobressalta com qualquer barulho.');
  if ((n.drunk ?? 0) > 50) add(40, 'Cambaleia e cheira forte a álcool.');
  else if ((n.drunk ?? 0) > 20) add(18, 'Tem um cheiro de bebida no hálito.');
  if ((n.nicotine ?? 0) > 40) add(15, 'Mexe nos bolsos sem parar, como quem procura um cigarro.');
  if ((n.alcohol ?? 0) > 40) add(16, 'As mãos tremem e há um ar de ressaca no rosto.');

  // ── roupa
  if (!i.slots.has('boots')) add(24, 'Anda com os pés descalços, sujos e machucados.');
  if (!i.slots.has('shirt') && !i.slots.has('jacket')) add(23, 'Está sem camisa, com o tronco à mostra.');

  // desacordado: só o que se vê num corpo caído (nada de mancar, olhar, nervosismo…)
  if (n.unconscious) for (let k = out.length - 1; k >= 0; k--) if (out[k].p < 80) out.splice(k, 1);
  out.sort((a, b) => b.p - a.p);
  const lines = [...new Set(out.map((o) => o.t))].slice(0, 6);
  if (!lines.length) lines.push('Parece estar bem, dentro do possível.');
  return lines;
}
