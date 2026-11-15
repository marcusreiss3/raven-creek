-- Dia 1: cada mensagem "com referência" chega no máximo uma vez para cada personagem
-- (evita repetição depois de reiniciar o servidor ou de uma transação repetida).
CREATE UNIQUE INDEX IF NOT EXISTS "pe_ref" ON "prologue_events" ("character_id", ("payload"->>'ref')) WHERE "payload" ? 'ref';
