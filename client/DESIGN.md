# Raven Creek — design system

## O que estava genérico (levantamento das telas antigas)
- Todo painel era o mesmo retângulo cinza-escuro com borda fina; inventário, corpo, chat, base e admin pareciam a mesma tela.
- Rótulos em CAIXA ALTA espaçada em todo lugar, Inter no corpo do texto — cara de painel administrativo.
- Emojis fazendo papel de ícone (estações, cachorro, mistérios, mortos, facções, memorial).
- Inventário em lista de texto, sem ícone de item; barras de necessidade iguais, distinguidas só por cor.
- Botões, chips e campos sem material nenhum: nada lembrava o mundo do jogo.

## Direção
Duas propostas consideradas:
1. **Diário de campo** — tudo em papel envelhecido, anotação à mão, carimbos.
2. **Equipamento improvisado** — chapa pintada de verde-oliva, lona, fita crepe escrita a pincel atômico, letreiro em estêncil, luz âmbar de rádio.

**Escolhida: equipamento improvisado.** Os cenários são noites azul-escuras pintadas; papel claro em toda a interface brigaria com eles e cansaria a vista em horas de chat. Chapa e lona escuras emolduram a cena sem competir, e o âmbar do rádio e da fogueira é a única luz quente — o mesmo calor que os cenários já usam nas janelas e postes. O papel não some: fica reservado para o que **é** papel no mundo (bilhetes, mural, diário, mapa), e por isso esses objetos se destacam.

## Paleta (variáveis no `@theme` de `src/index.css`)
| Nome | Hex | Uso |
|---|---|---|
| Lona | `#1b1d16` | superfícies base (painéis, barras) |
| Chapa | `#2f3326` | elementos elevados: botões, cabeçalhos, slots |
| Fita crepe | `#d8c79a` | etiquetas, chips, títulos sobre papel |
| Âmbar de rádio | `#f0a73a` | foco, seleção, luz, “você” |
| Sangue seco | `#bf3a2f` | perigo, ferimento, infectado |
| Musgo | `#8aa45e` | seguro, saúde, ação principal |
| Osso (texto) | `#ebe4d0` | texto principal sobre escuro |
| Papel | `#e6dbbd` | objetos de papel |

A escala `ink-*` foi retintada para verde-oliva acastanhado (em vez de cinza neutro); `amber-450`, `moss-*` e `blood-*` mantêm o significado, com tons novos.

## Tipografia (fontes livres, servidas em `public/fonts`)
- **Big Shoulders Stencil Display** (700/800) — nome do local, títulos de painel, cartões de título da cena. É o letreiro pintado em caixote: só em títulos, em caixa normal (sem caixa alta forçada).
- **Big Shoulders Display** (600/700) — botões e números de medidores. Mesma família, sem estêncil, para não cansar.
- **Atkinson Hyperlegible Next** (400/700, itálico) — todo texto corrido, chat e rótulos. Desenhada para legibilidade; o chat é lido por horas.
- **Kalam** (400/700) — manuscrita, só em fita crepe e papel (etiquetas, bilhetes, mural, diário).

Escala: 12 / 13.5 / 15 / 18 / 24 / 34 / 54 px. Texto corrido 15px, entrelinha 1.5. Rótulos 12–13px em caixa normal, cor `ink-400`. Números com `tabular-nums`.

## Ícones
- **Mundo, itens, estados**: [game-icons.net](https://game-icons.net) (CC BY 3.0), silhuetas preenchidas, via `<GameIcon name="…"/>` (`src/components/GameIcon.tsx`). O mapa de nomes fica em `src/components/gameIcons.ts` (gerado por `scripts/gen-icons.mjs`).
- **Controles de interface** (fechar, buscar, mais/menos): lucide-react, traço fino.
- Nenhum emoji na interface nem nas mensagens do servidor. Emblemas de facção são símbolos SVG (`emblem:*`).

## Superfícies
- `panel` — lona: textura de ruído sutil, borda escura, costura tracejada interna.
- `panel-plate` — chapa: degradê de luz de cima, rebites nos cantos (modais e cabeçalhos).
- `panel-paper` — papel: bilhetes, mural, diário, mapa.
- `tape` — fita crepe com texto manuscrito (chips, etiquetas de título).
- `btn` — placa de metal pintada com um canto chanfrado; variantes `btn-moss` (ação principal), `btn-danger`, `btn-ghost`.
- Sombras só para separar camadas (cena → interface → modal), nunca decorativas.

## Movimento
- Um momento coreografado por tela: o nome do local entra como letreiro pintado; painéis abrem deslizando da borda como uma prancheta.
- 150–260 ms, só `transform`/`opacity`. `prefers-reduced-motion` desliga tudo que não é essencial.

## Acessibilidade
- Texto ≥ 4,5:1 sobre o fundo (osso sobre lona ≈ 14:1; `ink-400` sobre lona ≈ 6:1; âmbar sobre lona ≈ 8:1).
- Foco visível em âmbar (`:focus-visible`, 2px, afastado 2px).
- Botões só com ícone têm `aria-label`; estados (perigo, infecção, abstinência) sempre com ícone **e** texto, nunca só cor.
- Alvos de clique ≥ 32×32 px; `Esc` fecha painéis e modais; foco preso dentro do modal.
