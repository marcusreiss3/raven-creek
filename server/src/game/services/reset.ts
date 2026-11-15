/**
 * Resets feitos pela administração.
 *
 *  • resetCharacters: apaga todo o progresso dos jogadores (personagens, inventários, corpos, mortos que levantaram,
 *    viagens, combates, tarefas, facções, bases e cachorros adotados). O mundo (loot já saqueado, infectados, hordas,
 *    obras da comunidade, mistérios, mural) continua como está. Contas de usuário são mantidas.
 *  • resetWorld: tudo do reset de personagens + o mundo volta ao estado inicial (reservas e infectados dos locais,
 *    itens no chão, armários, veículos, fogueiras, hordas, obras, mistérios, mural, chat e relógio no dia 1, 8h).
 *    Configurações, locais/rotas, tabelas de loot, itens, eventos e tipos de zumbi editados no painel são mantidos.
 */
import { sql } from 'drizzle-orm';
import { db } from '../../db/index.js';

const PLAYER_PROGRESS = [
  `DELETE FROM prologue_sessions`, // Dia 1: grupos, participantes e mensagens vão junto (cascade)
  // itens de jogadores e de corpos/estoques de base/mortos que levantaram
  `DELETE FROM items WHERE owner_type IN ('character', 'risen')`,
  `DELETE FROM items WHERE owner_type = 'container' AND owner_id IN (SELECT id::text FROM containers WHERE kind IN ('corpse', 'base_storage'))`,
  `DELETE FROM containers WHERE kind IN ('corpse', 'base_storage')`,
  `DELETE FROM risen`,
  `DELETE FROM travels`,
  `DELETE FROM combats`,
  `DELETE FROM jobs`,
  `DELETE FROM base_structures`,
  `DELETE FROM bases`,
  `DELETE FROM faction_invites`,
  `DELETE FROM faction_members`,
  `DELETE FROM factions`,
  `UPDATE community_projects SET controller_faction_id = NULL`,
  `DELETE FROM companions WHERE owner_character_id IS NOT NULL OR status = 'owned'`,
  `UPDATE vehicles SET driver_id = NULL, running = false, owner_character_id = NULL, faction_id = NULL`,
  `DELETE FROM game_logs`,
  `DELETE FROM characters`,
];

const WORLD_STATE = [
  `DELETE FROM items`,
  `DELETE FROM containers`,
  `DELETE FROM vehicles`,
  `DELETE FROM campfires`,
  `DELETE FROM hordes`,
  `DELETE FROM community_projects`,
  `DELETE FROM mystery_fragments`,
  `DELETE FROM mysteries`,
  `DELETE FROM mural_posts`,
  `DELETE FROM companions`,
  `DELETE FROM chat_messages`,
  `DELETE FROM event_log`,
  `DELETE FROM scheduled_events`,
  `UPDATE location_loot ll SET reserve = ll.max_reserve, zombies = round(l.danger * 9), last_regen_at = now(), times_searched = 0 FROM locations l WHERE l.id = ll.location_id`,
];

/** Recarrega caches em memória depois de mexer no banco por fora dos serviços. */
async function reloadCaches() {
  const { loadAll } = await import('./config.js');
  const { loadWorld } = await import('./world.js');
  const { loadFires } = await import('./nature.js');
  const { ensureProjects, loadProjects } = await import('./projects.js');
  await ensureProjects(); await loadProjects(); await loadFires(); await loadAll(); await loadWorld();
}

export async function resetCharacters() {
  const counts = await db.transaction(async (tx) => {
    const { rows } = await tx.execute(sql`SELECT count(*)::int AS n FROM characters`);
    for (const q of PLAYER_PROGRESS) await tx.execute(sql.raw(q));
    return { characters: Number((rows[0] as any).n) };
  });
  await reloadCaches();
  const { _resetPrologueMemory } = await import('./prologue.js'); _resetPrologueMemory();
  return counts;
}

export async function resetWorld() {
  const counts = await db.transaction(async (tx) => {
    const { rows } = await tx.execute(sql`SELECT count(*)::int AS n FROM characters`);
    for (const q of [...PLAYER_PROGRESS, ...WORLD_STATE]) await tx.execute(sql.raw(q));
    // relógio do mundo: dia 1, 8h, céu limpo
    const world = { baseGameMinutes: 8 * 60, baseRealMs: Date.now(), weather: 'clear', weatherChangedAtGameMinutes: 8 * 60 };
    await tx.execute(sql`INSERT INTO game_config (key, value) VALUES ('world', ${JSON.stringify(world)}::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`);
    return { characters: Number((rows[0] as any).n) };
  });
  // O seed é idempotente: recria armários fixos, veículos abandonados e reservas que faltarem (sem contas de demonstração).
  const { seed } = await import('../../seed/index.js');
  await seed({ demo: false });
  await reloadCaches();
  const { _resetPrologueMemory } = await import('./prologue.js'); _resetPrologueMemory();
  return counts;
}
