/** Validador do roteiro do Dia 1: pega erros de conteúdo antes de alguém jogar. */
import type { Beat, Effect, Track } from './types.js';
import { TRACKS, MARKS, TIMELINE, FREE_TRACKS } from './index.js';
import { ITEM_DEFS, REGIONS } from '../items.js';
import { LOCATIONS } from '../world.js';
import { ZOMBIE_TYPES } from '../zombies.js';
import { ATTRIBUTES, PROFESSIONS, SKILLS } from '../character.js';

export function validateDia1(): { errors: string[]; warnings: string[]; stats: Record<string, number> } {
  const errors: string[] = []; const warnings: string[] = [];
  const items = new Set(ITEM_DEFS.map((d) => d.id));
  const locs = new Set(LOCATIONS.map((l) => l.id));
  const ztypes = new Set(ZOMBIE_TYPES.map((z) => z.id));
  const stats = new Set([...Object.keys(ATTRIBUTES), ...Object.keys(SKILLS)]);
  const marks = new Set(MARKS.map((m) => m.id));
  const hubs = new Set(TRACKS.filter((t) => t.hub).map((t) => t.id));
  let beatsTotal = 0; let msgsTotal = 0; let asksTotal = 0;

  const checkEffects = (t: Track, b: Beat, list: Effect[] | undefined, where: string) => {
    for (const e of list ?? []) {
      if ('item' in e && !items.has(e.item)) errors.push(`${t.id}/${b.id} ${where}: item inexistente "${e.item}"`);
      if ('wound' in e && e.region && !(REGIONS as readonly string[]).includes(e.region)) errors.push(`${t.id}/${b.id} ${where}: região inexistente "${e.region}"`);
      if ('mark' in e && !marks.has(e.mark)) errors.push(`${t.id}/${b.id} ${where}: marca inexistente "${e.mark}"`);
      if ('death' in e && b.act < 4) errors.push(`${t.id}/${b.id} ${where}: morte antes do ato 4`);
    }
  };

  for (const t of [...TRACKS, ...FREE_TRACKS]) {
    const ids = new Set(t.beats.map((b) => b.id));
    if (ids.size !== t.beats.length) errors.push(`${t.id}: ids de batida repetidos`);
    if (!ids.has(t.start)) errors.push(`${t.id}: batida inicial "${t.start}" não existe`);
    if (!locs.has(t.location)) errors.push(`${t.id}: local inicial "${t.location}" não existe`);
    for (const [p, l] of Object.entries(t.startAt ?? {})) if (!locs.has(l)) errors.push(`${t.id}: local de ${p} "${l}" não existe`);
    if (t.free?.at && !locs.has(t.free.at)) errors.push(`${t.id}: local do evento "${t.free.at}" não existe`);
    const ref = (b: Beat, id: string | undefined, what: string) => { if (id && !ids.has(id)) errors.push(`${t.id}/${b.id}: ${what} → "${id}" não existe`); };
    const reach = new Set<string>([t.start]); const queue = [t.start];
    const outs = (b: Beat) => [b.next, b.else, b.combat?.win, b.combat?.lose, ...(b.ask?.options.flatMap((o) => [o.next, o.fail]) ?? [])].filter(Boolean) as string[];
    while (queue.length) { const cur = queue.shift(); const b = t.beats.find((x) => x.id === cur); if (!b) continue; for (const n of outs(b)) if (!reach.has(n)) { reach.add(n); queue.push(n); } }
    for (const b of t.beats) {
      beatsTotal++; msgsTotal += b.say?.length ?? 0; if (b.ask) asksTotal++;
      if (!reach.has(b.id)) warnings.push(`${t.id}/${b.id}: batida inalcançável`);
      if (b.at && !locs.has(b.at)) errors.push(`${t.id}/${b.id}: local "${b.at}" não existe`);
      if (b.if && !b.else) errors.push(`${t.id}/${b.id}: tem condição (if) sem "else"`);
      ref(b, b.next, 'next'); ref(b, b.else, 'else');
      if (b.hub && !hubs.has(b.hub)) errors.push(`${t.id}/${b.id}: ponto de encontro "${b.hub}" não existe`);
      if (b.combat) { ref(b, b.combat.win, 'vitória'); ref(b, b.combat.lose, 'derrota'); for (const z of b.combat.types ?? []) if (!ztypes.has(z)) errors.push(`${t.id}/${b.id}: tipo de zumbi "${z}" não existe`); }
      checkEffects(t, b, b.effects, 'efeitos');
      if (b.ask) {
        const o = b.ask.options;
        if (!o.length) errors.push(`${t.id}/${b.id}: pergunta sem opções`);
        if (b.ask.default && !o.some((x) => x.id === b.ask!.default)) errors.push(`${t.id}/${b.id}: opção padrão "${b.ask.default}" não existe`);
        if (new Set(o.map((x) => x.id)).size !== o.length) errors.push(`${t.id}/${b.id}: opções com id repetido`);
        const pollOrSplit = b.ask.kind === 'poll' || b.ask.split;
        for (const x of o) {
          ref(b, x.next, `opção ${x.id}`); ref(b, x.fail, `falha ${x.id}`);
          if (x.check && !stats.has(x.check.stat)) errors.push(`${t.id}/${b.id}: teste com atributo/habilidade inexistente "${x.check.stat}"`);
          if (pollOrSplit && !x.next && !b.next) errors.push(`${t.id}/${b.id}: opção ${x.id} sem destino`);
          checkEffects(t, b, x.effects, `opção ${x.id}`); checkEffects(t, b, x.failEffects, `falha ${x.id}`);
        }
        if (!pollOrSplit && !b.next && o.some((x) => !x.next)) errors.push(`${t.id}/${b.id}: escolha individual sem destino comum (next)`);
      }
      const exits = !!(b.next || b.ask || b.combat || b.hub || b.end || b.else);
      if (!exits) errors.push(`${t.id}/${b.id}: beco sem saída (sem next/ask/combat/hub/end)`);
    }
  }
  for (const p of PROFESSIONS) if (!TRACKS.some((t) => !t.hub && t.professions.includes(p.id))) warnings.push(`profissão sem trilha própria: ${p.id} (vai para a civil)`);
  for (const e of TIMELINE) for (const m of e.msgs ?? []) if (!m.text) errors.push(`linha do tempo ${e.at}: mensagem vazia`);
  return { errors, warnings, stats: { trilhas: TRACKS.filter((t) => !t.hub).length, encontros: hubs.size, batidas: beatsTotal, mensagens: msgsTotal + TIMELINE.reduce((s, e) => s + (e.msgs?.length ?? 0), 0), perguntas: asksTotal } };
}
