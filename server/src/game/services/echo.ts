/**
 * Tiros que todo mundo ouve: um disparo num confronto ecoa nos locais vizinhos (uma conexão de distância).
 * Quem está lá recebe uma linha narrativa no chat local e o som de tiro distante. Há um intervalo mínimo por local
 * de origem para um tiroteio não virar spam.
 */
import { eq } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import type { CombatState } from '../combat/engine.js';
import { systemEmote } from './chat.js';
import { cfg } from './config.js';
import { emitToLocation } from './realtime.js';
import { connectionsFrom, getLocation } from './world.js';

const lastEcho = new Map<string, number>();

const SINGLE: Record<string, string> = {
  pistol: 'Um disparo seco ecoa',
  rifle: 'O estampido de um rifle ecoa',
  shotgun: 'O estrondo de uma espingarda ecoa',
};

/** Locais de onde o som parte: o local do confronto, ou as duas pontas da estrada numa emboscada em viagem. */
async function originsOf(s: CombatState): Promise<string[]> {
  if (s.context.type === 'location' && s.context.locationId) return [s.context.locationId];
  if (s.context.type === 'travel' && s.context.travelGroupId) {
    const [t] = await db.select({ fromId: schema.travels.fromId, toId: schema.travels.toId }).from(schema.travels).where(eq(schema.travels.groupId, s.context.travelGroupId)).limit(1);
    if (t) return [t.fromId, t.toId];
  }
  return s.context.locationId ? [s.context.locationId] : [];
}

export async function echoGunshots(s: CombatState, shots: number, skill?: string) {
  const cooldownMs = Number((cfg().combat as any).gunshotEchoCooldownSeconds ?? 40) * 1000;
  if (cooldownMs < 0) return; // valor negativo desliga o recurso
  const origins = await originsOf(s);
  const now = Date.now();
  // quem está no mesmo local, mas fora do tabuleiro, ouve de perto (o cliente ignora se a pessoa estiver no confronto)
  if (s.context.type === 'location' && s.context.locationId) emitToLocation(s.context.locationId, 'world:sound', { key: `gunshot_${SINGLE[skill ?? ''] ? skill : 'pistol'}`, gain: 0.6, near: true });
  for (const origin of origins) {
    if (now - (lastEcho.get(origin) ?? 0) < cooldownMs) continue;
    lastEcho.set(origin, now);
    const from = getLocation(origin)?.name ?? 'algum lugar próximo';
    const onRoad = s.context.type === 'travel';
    const text = shots > 1
      ? `Vários tiros ecoam ao longe, vindos ${onRoad ? 'da estrada perto de' : 'de'} ${from}.`
      : `${SINGLE[skill ?? ''] ?? 'Um tiro ecoa'} ao longe, vindo ${onRoad ? 'da estrada perto de' : 'de'} ${from}.`;
    for (const cn of connectionsFrom(origin)) {
      if (origins.includes(cn.other)) continue;
      await systemEmote(cn.other, text);
      emitToLocation(cn.other, 'world:sound', { key: 'gunshot_distant', gain: 0.8, from });
    }
  }
}
