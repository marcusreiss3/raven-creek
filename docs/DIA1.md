# Dia 1: o prólogo ao vivo pelo celular

Uma sessão de cerca de **2 horas**, num horário marcado, em que cada personagem vive o primeiro dia do apocalipse a partir
do trabalho. Tudo acontece pelo **celular** (mensagens, notícias, rede social, ligações, alertas) e as decisões são votadas
pelo grupo, sem precisar de mestre. Quem chega depois perde a sessão e entra quando ela acaba.

## Como rodar
1. Painel de administração → **Controle do jogo** → marque **"Fazer o Dia 1 na próxima abertura"** e escolha o ritmo.
2. Em **Abertura e fichas**, agende o horário de abertura.
3. 15 minutos antes, quem tem ficha aprovada vê a **sala de espera**. Na hora, o Dia 1 começa sozinho com quem estiver lá.
4. Durante a sessão, o mesmo painel mostra os grupos ao vivo e tem o botão **Encerrar o Dia 1 agora**.
   Também dá para usar **Começar agora** (entra quem estiver conectado ou na sala de espera).

No fim, cada um recebe a **crônica** do que viveu e as **marcas** (que ficam no diário). Só nos atos 4 e 5 dá para morrer.
Os lugares por onde a história passou ficam saqueados (os estoques caem para cerca de um terço).

## Onde fica o roteiro
`server/src/game/content/dia1/`
- `tracks/*.ts`: trilhas por profissão (polícia, hospital, militares, fábrica, civis) e os pontos de encontro (`h_*.ts`).
- `timeline.ts`: o que chega no celular de todo mundo ao mesmo tempo (notícias, alertas, sinal caindo).
- `ambient.ts`: a "vida ambiente" para quem está esperando (mensagens da família, barulhos ao longe).
- `marks.ts`: as marcas que o personagem leva para o resto do jogo.
- `types.ts`: o formato de cada cena, explicado.

Depois de mexer, rode `npx vitest run tests/zz-dia1.test.ts` na pasta `server`: ele confere o roteiro (cenas que não
levam a lugar nenhum, itens inexistentes…) e simula 15 jogadores do começo ao fim.

## Raven Rede e imagens
No celular, a Raven Rede e o RC Agora mostram as mesmas postagens para todos: dá para curtir, comentar e ver os
comentários dos outros jogadores (precisa de internet: sinal 3 ou mais). As imagens das postagens ficam em
`client/public/assets/dia1/social/`; os prompts para gerar cada uma estão em `docs/DIA1_IMAGENS.md`.

## Sair do trabalho (livre pelo mapa)
A qualquer momento (fora de um confronto), o jogador pode tocar em **Sair do trabalho**. Ele larga o posto (marca
"Largou o posto"), a história do grupo segue sem ele e ele fica **livre pelo condado**: anda pelo mapa (Mapa / "Daqui
dá para ir a"), mas sem vasculhar. Os recursos vêm dos eventos.
- **Eventos de local**: ao chegar no hospital, farmácia, FoodMax, posto, escola, igreja, oficina do Hank ou Avenida
  Willow, acontece o evento daquele lugar: uma versão antes da queda (atos 1–2) e outra depois (atos 3–5).
- **Eventos globais**: de tempos em tempos (a cada ~5 a 8 min), onde a pessoa estiver: gente desesperada, ataques,
  assaltantes, tiroteio, achados, a horda.
- As decisões são individuais, mas o texto muda quando há outros sobreviventes no mesmo lugar.
- Enquanto um evento está acontecendo, não dá para viajar. Ferimentos valem; morte só nos atos 4 e 5.
- Roteiro em `server/src/game/content/dia1/livre.ts`.
