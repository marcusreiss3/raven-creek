# Raven Creek — RPG multiplayer de sobrevivência zumbi

Visual novel multiplayer + profundidade de sobrevivência inspirada em Project Zomboid + RP social estilo Discord.
Servidor **autoritativo** (Node + TypeScript + Socket.IO + PostgreSQL), cliente **React + TypeScript + Tailwind**.

> O que já está pronto e o que está pendente: veja **[docs/STATUS.md](docs/STATUS.md)**.
> Decisões técnicas: **[docs/ARQUITETURA.md](docs/ARQUITETURA.md)** · Artes: **[docs/ASSETS.md](docs/ASSETS.md)** · Áudio: **[docs/AUDIO.md](docs/AUDIO.md)**

---

## 1. Requisitos

- Node.js 20+ (testado com 22)
- PostgreSQL 14+ (ou Docker)
- Opcional: Redis 7 (só para rodar várias instâncias do servidor)

## 2. Primeira execução

```bash
npm run setup                 # instala raiz, server e client
npm run db:up                 # sobe Postgres (+ Redis) via Docker — ou use seu próprio Postgres
cp server/.env.example server/.env   # ajuste DATABASE_URL / JWT_SECRET se necessário
npm run db:migrate            # aplica as migrações (server/drizzle/*.sql)
npm run db:seed               # mundo, itens, loot, zumbis, eventos, admin, contas de demonstração e placeholders
npm run dev                   # servidor em :4000 e cliente em :5173
```

Abra **http://localhost:5173**.

O seed cria a conta **admin** (painel em `#/admin`) e duas contas de demonstração (`alice` e `bruno`).
As senhas vêm do `.env` (`SEED_ADMIN_PASSWORD` e afins; veja `server/.env.example`). **Em produção, defina senhas próprias.**

Para não criar as contas de demonstração: `SEED_DEMO=0 npm run db:seed`. Para apagar tudo e recomeçar: `npm run db:reset`.

## 3. Testando o multiplayer com duas sessões

Cada aba de navegador comum compartilha o mesmo cookie de login, então use **dois perfis isolados**:

1. Janela normal → entre como `alice`.
2. Janela anônima (ou outro navegador) → entre como `bruno`.
3. Ambos começam na **Rua Principal**: vocês se veem na cena, conversam no chat local, usam `/me`, `/roll`.
4. Em Alice, clique no retrato de Bruno → **Acompanhar**. Em Bruno, escolha uma saída e parta: os dois viajam juntos, com chat de viagem.
5. Em `#/admin` (conta admin) → Personagens → **Iniciar confronto** para testar o tabuleiro tático com reforço do outro jogador ("Ajudar").

### Jogando no celular

O jogo tem um layout próprio para celular: barra de estado em cima, abas embaixo (Cena, Conversa, Mochila, Mapa, Mais), painéis em tela cheia, mapa com pinça para aproximar e tabuleiro de combate que rola e acompanha o seu personagem.

1. Deixe o PC e o celular no mesmo Wi-Fi e abra o jogo no PC pelo `INICIAR.bat`.
2. A janela mostra o endereço para o celular (algo como `http://192.168.0.10:5173`); ele também fica em `raven-creek-url.txt`.
3. Abra esse endereço no navegador do celular. Se o Windows perguntar sobre o firewall, permita o Node.js em "Redes privadas".
4. Opcional: no menu do navegador, "Adicionar à tela inicial" cria um atalho com ícone que abre o jogo em tela cheia.

Amigos fora da sua casa precisam de outro jeito de chegar no PC (por exemplo um túnel como Tailscale ou ngrok); a rede local só funciona para quem está no mesmo Wi-Fi.

## 4. Testes automatizados

```bash
npm test
```

Usam o banco `TEST_DATABASE_URL` (é **apagado** a cada execução). Cobrem, entre outros:
dois jogadores no mesmo local (presença e chat via socket real) · desconexão durante viagem · dois jogadores pegando o mesmo item ·
combate com ferimento persistido · evolução de ferimentos no tempo · tentar viajar em combate · item consumido duas vezes ao mesmo tempo ·
payloads manipulados/teleporte/upload falso · acesso não autorizado ao painel · reinício do servidor durante ação agendada ·
esgotamento de recursos · regras de PVP · validação da criação de personagem · auditoria administrativa · motor de combate (diagonais, linha de visão, A*, IA) · infecção · anti-farm de XP.

## 5. Produção (resumo)

```bash
npm run build                 # gera client/dist
NODE_ENV=production npm start # o servidor entrega a API, o socket e o cliente compilado na mesma porta
```

Defina `JWT_SECRET` forte, `CLIENT_ORIGIN` com a URL pública e use HTTPS (o cookie fica `secure` em produção).
Para várias instâncias: `npm --prefix server i @socket.io/redis-adapter redis` e defina `REDIS_URL`. O processamento do mundo
(ticks, viagens, jobs) usa um *advisory lock* do Postgres — só uma instância processa por vez, sem duplicidade.

## 6. Estrutura

```
server/
  src/db/            schema Drizzle, migrações, reset
  src/game/content/  conteúdo inicial: mundo (112 locais), itens, loot, profissões, traços, zumbis, eventos, construções, configuração padrão
  src/game/rules/    regras puras e testáveis: corpo/ferimentos, simulação de necessidades/doenças, viagem, loot, progressão, relógio
  src/game/combat/   motor tático (mapas, linha de visão, A*, ações) e IA dos infectados
  src/game/services/ serviços transacionais: personagens, inventário, sobrevivência/medicina, exploração, viagem, combate, chat, bases, facções, veículos, mundo, agendador
  src/http/          REST (autenticação, criação de personagem, upload, painel admin)
  src/socket/        Socket.IO: salas por local/viagem/combate/facção/rádio, despacho de ações validadas
  tests/             testes Vitest (unitários e de integração)
client/
  src/game/          cena da visual novel, chat, combate, viagem, inventário, corpo, painéis
  src/admin/         painel administrativo
  public/assets/     cenários, arenas, retratos e áudio (substituíveis sem tocar no código)
docs/                arquitetura, assets, áudio, status
```
