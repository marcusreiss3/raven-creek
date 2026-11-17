# Status da implementação

Legenda: ✅ funcional e conectado aos demais sistemas · 🟡 parcial (o que falta está descrito) · ⏳ pendente

## Fluxo vertical (pedido principal) — ✅
conta → personagem (com PNG) → localidade → chat multiplayer → deslocamento em tempo real → exploração → encontro → combate tático → ferimento → persistência.
Verificado em navegador com duas contas e coberto por testes automatizados.

## Etapa 1 — Fundação
- ✅ Monorepo, servidor autoritativo, PostgreSQL + migrações versionadas, seed idempotente
- ✅ Contas (bcrypt, cookie httpOnly com JWT versionado: logout/ban invalidam sessões), rate limit
- ✅ Criação de personagem em 5 etapas: identidade, 15 profissões com vantagens concretas, atributos por pontos, 18 características com custo/ganho e exclusões
- ✅ Upload de PNG validado (tipo real por assinatura, dimensões, tamanho), re-codificado; ajuste de escala/posição com pré-visualização
- ✅ Interface de visual novel com gerenciador de camadas (fundo → iluminação/clima → personagens → efeitos → interface)

## Etapa 2 — Mundo multiplayer
- ✅ 112 nós navegáveis em 8 regiões, 118 conexões, 10 casas com interiores reutilizáveis (5 cenários para 10 casas) e sublocais (porões, garagens, quintais, galpões, andar de cima)
- ✅ Presença em tempo real (online/ausente), salas por local, reconexão automática com estado restaurado
- ✅ Chat: local, OOC, `/me`, rolagens (`/roll 2d6`, `/roll medicina`), rádio com frequência (exige rádio), facção, privado, equipe, narração do mestre (`/gm`), histórico persistente, bloqueio, denúncia, remoção pela moderação, silenciar
- ✅ Viagens com duração real (distância, terreno, ferimentos, sobrecarga, estamina, clima, noite sem lanterna, traços, veículo), continuam com o navegador fechado
- ✅ Encontros com probabilidades configuráveis; os que exigem decisão pausam a viagem (enfrentar, passar em silêncio, desviar, voltar)
- ✅ Viagem em grupo ("Acompanhar") com chat próprio; veículo leva seguidores como passageiros
- ✅ Mapa do condado (só destinos conectados — sem teleporte)

## Etapa 3 — Sobrevivência
- ✅ Fome, sede, sono, estamina, energia de exploração, estresse, temperatura corporal, sangue, vitalidade, dor — interagindo entre si
- ✅ Energia de exploração separada da estamina; sem energia o jogador ainda conversa, negocia, organiza e descansa
- ✅ Loot com reservas persistentes por local, regeneração lenta, retornos decrescentes, penalidade por repetir, custo maior para raros, iluminação
- ✅ 92 itens com peso, durabilidade, raridade, empilhamento, compatibilidade (munição por calibre), efeitos; contêineres (armários, corpos, estoques de base)
- ✅ Inventário com arrastar-e-soltar, 11 encaixes de equipamento, filtros, busca, peso/capacidade, entregar/guardar/largar, reparo
- ✅ 12 regiões anatômicas, 11 tipos de ferimento com gravidade, dor, sangramento, contaminação, cicatrização, tratamentos; silhueta interativa
- ✅ Tratamentos: bandagem/trapo, antisséptico, sutura (exige habilidade), tala, analgésicos, antibióticos, kit de primeiros socorros; Medicina e profissão alteram a eficácia; tratar outros personagens
- ✅ Infecção zumbi em 5 estágios, oculta até diagnóstico por médico, velocidade por região mordida
- ✅ Amputação abstrata com consentimento, recursos, habilidade, janela de tempo e chance configuráveis (nunca garantida); consequências permanentes
- ✅ Doenças comuns: intoxicação alimentar, água contaminada, infecção de ferimento, respiratória, zoonose, hipotermia

## Etapa 4 — Combate
- ✅ Arena tática (9 mapas) com paredes, portas, coberturas, obstáculos, terreno difícil, água, saídas
- ✅ 8 direções sem cortar quinas, PA, mover, atacar (corpo a corpo/distância), mirar na cabeça, empurrar, defender, recarregar, trocar arma, abrir/fechar porta, distrair, socorrer aliado, fugir
- ✅ Linha de visão, alcance, cobertura, penalidades de ferimentos e cansaço, consumo de estamina, desgaste de armas, munição
- ✅ IA: A*, perseguição, último ponto conhecido, barulho de disparos atrai e gera reforços, contornar, arrombar portas; 5 comportamentos distintos
- ✅ Turnos com prazo; inatividade → defesa; desconectado → recua sozinho até a saída
- ✅ Ferimentos por região com proteção da roupa; mordidas podem infectar; letalidade (tiro na cabeça, hemorragia, desmaio por dor)
- ✅ Espectadores e reforços de outros jogadores no mesmo local
- ✅ Em vez de morrer na hora, o personagem cai: tem 1–3 min (configurável) para alguém reanimá-lo com um kit de primeiros socorros (infecção zumbi não tem volta)
- 🟡 Arrastar aliado caído — pendente (hoje: socorrer com itens; aliados caídos ficam vulneráveis)

## Etapa 5 — Mundo avançado
- ✅ Profissões e proficiências com XP por prática, retornos decrescentes, teto por hora, decaimento por repetição, livros com limite de nível
- ✅ Fabricação (receitas com conhecimento, ferramentas, habilidade)
- ✅ Bases: reivindicar, 10 construções com materiais/tempo/energia/ferramentas, estoque compartilhado, reparo, gerador com combustível, iluminação, coletor de água e plantação produzindo
- ✅ Facções: criar, convidar, patentes, expulsar, sair, ceder base, chat próprio, registro de atividades
- ✅ Veículos: 6 tipos com combustível/motor/pneus/bateria/lataria/consumo/ruído; partida com chave ou minigame abstrato de risco; peças; dirigir com passageiros; acidentes
- ✅ PVP no mesmo tabuleiro: proteção de novato, proibido atacar desconectados, recarga, mesma facção protegida, reforços escolhendo lado, registros de confronto e de roubo (revistar inconscientes)
- ✅ Hordas migrando pelo mapa, alertas nos locais vizinhos, dano às estruturas de bases
- 🟡 Invasão de base por jogadores (arrombar estoque) — pendente; estoques só abrem para dono/facção
- 🟡 Defesa tática automática quando uma horda chega — pendente; hoje a horda aumenta a ameaça do local e danifica estruturas (o mestre pode iniciar o confronto pelo painel)
- ✅ Porta-malas de veículo com limite de peso (capacidade de carga de cada tipo), acesso restrito à facção dona
- ✅ Tirar peças de um veículo para pôr em outro (pneu, bateria, motor inteiro, combustível com galão vazio), exigindo nível de Mecânica e ferramentas
- ✅ Silenciadores específicos por arma (9mm; .308 para rifle e fuzil), achados ou fabricados (os improvisados gastam rápido): o tiro não atrai infectados nem ecoa
- ✅ Livros levam minutos para ler (personagem ocupado, pode desistir) e marcações no próprio mapa (somem se o mapa for perdido)
- ⏳ Carregadores como itens separados (hoje a munição fica carregada na arma)

## Etapa 6 — Administração e acabamento
- ✅ Painel protegido por cargo (admin, moderador, mestre): visão geral, jogadores (cargo, ban, silenciar), personagens (necessidades, curar, matar, reviver, mover, dar/remover itens, iniciar confronto), mundo (editar locais, cenário, arena, loot, perigo, zumbis, reservas, criar locais e conexões, bloquear rotas), loot com % calculada, eventos (pesos, condições, efeitos, probabilidades efetivas, disparar, programar, histórico), zumbis, itens, hordas, veículos, bases, configurações globais, catálogo de assets com envio e uso, logs, denúncias
- ✅ Todas as ações administrativas sensíveis geram auditoria
- ✅ História (eventos globais): capítulos de lore prontos (`server/src/game/content/chapters.ts`) ou escritos na hora, ativados pelo painel; boletim em tela cheia para todos, diário, rádio e efeitos no mundo
- ✅ Clima e ciclo dia/noite com camadas visuais; lanterna necessária para ler e vasculhar bem no escuro
- ✅ Permadeath configurável, corpo com pertences, reanimação como infectado nomeado, memorial com epitáfio
- ✅ Gerenciador de áudio (crossfade, por local, combate, volumes salvos, autoplay respeitado) — 🟡 **sem arquivos de áudio** (ver AUDIO.md)
- ✅ Tutorial gradual, dicas, notificações, confirmação de ações irreversíveis, atalhos de teclado, diário
- 🟡 Telas pequenas: funciona, mas o layout é pensado para desktop
- ⏳ NPCs sobreviventes interativos (hoje aparecem só em eventos narrativos)
- ⏳ Ícones ilustrados de itens (hoje: texto + ícones de interface)
