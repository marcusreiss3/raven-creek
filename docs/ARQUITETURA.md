# Arquitetura e decisões técnicas

## Princípio: o servidor decide tudo

O cliente só **pede** ações (`socket.emit('action', {type, payload})`). Cada tipo de ação tem um esquema Zod; payloads
desconhecidos ou malformados são rejeitados. O servidor verifica estado, posição, permissões e recursos, calcula o resultado
(RNG no servidor) e devolve o novo estado. Não existe ação que altere energia, inventário, localização ou saúde diretamente.

## Stack e ajustes em relação à sugestão

| Sugestão | Escolha | Por quê |
|---|---|---|
| React + TS + Tailwind | ✔ (Vite, Tailwind v4, Zustand) | Como pedido. Zustand mantém o estado do jogo simples e reativo. |
| Node.js | ✔ Express 5 + Socket.IO 4 | |
| PostgreSQL | ✔ | Transações, `SELECT … FOR UPDATE`, `SKIP LOCKED` e *advisory locks* são a base anti-duplicação. |
| Prisma | **Drizzle ORM** | Drizzle gera SQL previsível, suporta `FOR UPDATE`/updates condicionais de forma direta (essenciais para concorrência), não precisa baixar binários de engine e tem migrações em SQL versionadas (`server/drizzle`). |
| Redis para filas/eventos | **Fila persistida no Postgres** (+ Redis opcional) | Ações demoradas (vasculhar, construir) viram linhas na tabela `jobs`; viagens e combates são calculados por *timestamps* persistidos. Isso sobrevive a reinícios sem depender de persistência do Redis. O Redis é usado só como adapter opcional do Socket.IO para várias instâncias. |
| PixiJS no tabuleiro | **DOM/CSS grid** | Arenas de 16×11 casas com poucas unidades: o DOM dá clique, *hover*, acessibilidade e animações CSS sem custo extra. Se as arenas crescerem muito, o componente `CombatScreen` é o único ponto a trocar. |

## Concorrência e anti-duplicação

- **Mutex por chave** no processo (`withLock('char:ID')`) + **`SELECT … FOR UPDATE`** na transação: ações do mesmo personagem são serializadas mesmo com várias abas/instâncias.
- **Transferências de itens** usam update condicional por `version` e dono atual: dois jogadores pegando o mesmo item → só um vence (testado).
- **Consumo** é `UPDATE … SET quantity = quantity - n WHERE quantity >= n RETURNING` → impossível consumir duas vezes (testado).
- Dois personagens (entregar item, tratar outro) são travados **em ordem de id** para evitar *deadlock*.
- **Jobs** são retirados com `FOR UPDATE SKIP LOCKED`; ao iniciar, jobs "running" órfãos voltam a "pending" e são idempotentes (conferem `busyAction.jobId`).
- **Tick do mundo** só roda na instância que obtém `pg_try_advisory_lock`.
- Rate limit: HTTP (express-rate-limit), ações de socket (20/5s por usuário) e chat (configurável).

## Tempo e persistência

- **Necessidades, ferimentos, doenças e infecção** evoluem a partir de `lastTickAt`; o tick recalcula em passos de até 10 min, então
  um servidor que ficou parado recupera o atraso (limitado a 48 h). Desconectado, todo o "tempo do corpo" (fome, sede, sono, ferimentos, sangramento, infecção, doenças) corre a 50% (`needs.offlineBodyTimeMultiplier`, configurável); viagens seguem na velocidade normal.
- **Viagens**: `elapsed = elapsedMs + (agora − lastProgressAt)`. Fechar o navegador não pausa nada. Encontros que exigem decisão
  pausam a viagem (status `awaiting_decision`) até alguém do grupo decidir — recarregar não ignora o perigo.
- **Relógio do mundo**: minutos de jogo derivados de (`baseGameMinutes`, `baseRealMs`, `timeScale`). Mudar a escala preserva a hora atual.
  A escala do relógio é independente das durações reais de viagens e ferimentos.

## Combate

Fase simultânea dos jogadores (cada um com PA próprios e prazo) → fase dos infectados (IA no servidor) → nova rodada.
Prazo esgotado: quem não agiu entra em **defesa**; após N prazos seguidos (configurável), o personagem passa a **recuar sozinho até a saída** —
um jogador desconectado nunca trava a partida. O estado do combate é JSON persistido com versão; cada ação trava a linha do combate.

Dano não é barra de HP: cada acerto em sobrevivente vira um **ferimento por região** (tipo e gravidade dependem da arma/zumbi e da proteção da roupa
naquela região). Disparo forte na cabeça sem proteção balística pode matar na hora. Zumbis têm "corpo" e limiar de abate na cabeça; pernas destruídas os fazem rastejar.

## Configuração centralizada

Nenhum percentual de jogo fica espalhado no código:
- `game_config.game` — balanceamento (tempo, necessidades, exploração, viagem, ferimentos, infecção, amputação, doenças, habilidades, combate, PVP, permadeath, hordas, clima, chat);
- tabelas `loot_tables`, `event_defs`, `zombie_types`, `item_defs`, `recipes`, `location_loot`.
Tudo editável no painel; alterações sensíveis geram `admin_logs`.

## Salas de tempo real

`user:<id>` (estado privado), `loc:<id>` (cena e chat local), `travel:<grupo>` (chat de viagem), `combat:<id>`, `faction:<id>`, `radio:<freq>`, `staff`.
A função `syncRooms` mantém cada socket nas salas certas sempre que o estado do personagem muda.
