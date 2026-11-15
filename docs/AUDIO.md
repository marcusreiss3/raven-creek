# Áudio

**Todas as músicas e efeitos já estão incluídos**, sintetizados por código (sem amostras de terceiros, então sem licença a respeitar).
O gerador está em `scripts/audio/` (veja o README de lá para refazer ou ajustar). Para trocar algum som por um de sua preferência,
basta colocar um OGG com o mesmo nome no caminho abaixo ou enviar pelo painel **Admin → Assets → audio**.

O gerenciador faz *crossfade* de ~1,8 s entre músicas, troca a trilha por local (`musicKey` de cada local, editável no painel),
muda para `combat` ao iniciar um confronto, `road` em viagens, `wounded` quando o personagem está perdendo muito sangue e `death` na morte.
Há também um canal de **ambiente em loop**: chuva (abafada em lugares fechados) e vento ao ar livre, conforme o clima.
Volume de música/efeitos e "silenciar" ficam salvos. Nada toca antes do primeiro clique/tecla (regra de autoplay dos navegadores).

Onde cada efeito toca: tiros por tipo de arma (`gunshot_pistol/rifle/shotgun`), tiros vindos de locais vizinhos (`gunshot_distant`),
ataque de infectado (`zombie_attack`), porta ao entrar/sair de lugares fechados, coração com estresse muito alto, curativo ao tratar,
motor ao dar partida, e os de interface.

## Arquivos esperados

**Música** — `client/public/assets/audio/music/<chave>.ogg`
`main_menu`, `explore_calm`, `city_abandoned`, `hospital`, `forest`, `road`, `danger`, `combat`, `horde`, `wounded`, `death`, `base`

**Efeitos** — `client/public/assets/audio/sfx/<chave>.ogg`
`rain`, `wind`, `footsteps`, `door_open`, `door_close`, `ui_click`, `ui_open`, `ui_error`, `zombie_groan`, `zombie_attack`,
`gunshot_pistol`, `gunshot_rifle`, `gunshot_shotgun`, `melee_hit`, `melee_miss`, `pain`, `bandage`, `eat`, `drink`, `engine_start`, `engine_fail`,
`chat_message`, `notification`, `heartbeat`, `gunshot_distant`

## Se quiser trocar por sons gravados (pesquisado em nov/2026 — confirme a licença na página no momento do download)

Prefira **CC0** (domínio público, sem atribuição). Para CC-BY/OGA-BY, registre os créditos num `CREDITS.md`. Evite GPL e qualquer licença "não comercial" se houver chance de monetizar.
Nunca use música comercial sem autorização.

**Efeitos (CC0)**
- **Kenney** (kenney.nl) — os pacotes de áudio são CC0: *RPG Audio* (passos, armas, portas), *Interface Sounds* (100 sons de UI), *UI Audio*, *Impact Sounds*.
- **Freesound** (freesound.org) — use o filtro de licença **Creative Commons 0** na busca (chuva, vento, gemidos, motores, tiros). CC-BY ali exige crédito.

**Música / ambiências (OpenGameArt — a licença varia por item)** — candidatas marcadas como CC0 nas páginas consultadas:
- *Horror Atmosphere* — SubspaceAudio (CC0) → `explore_calm`, `city_abandoned`
- *Horror Loop* — TinyWorlds (CC0) → `danger`
- *Ambient Horror Track 01* — CleytonKauffman (CC0, loop) → `main_menu`
- *Dark Cavern Ambient* — Paul Wortmann (CC0, loop) → `hospital` ou esgotos
- *Abandoned Passages (horror ambience loop)* (CC0) → `hospital`
- *Horror Cliché* — Indieteur (CC0) → `horde` / `combat`
- *Tragic ambient main menu* — brandon75689 (dupla licença OGA-BY 3.0 / CC0) → `death`

Atenção: *Dark Ambience Loop* (Iwan Gabovitch) aparece no OpenGameArt como **CC-BY 3.0 / GPL** — exige crédito; não é CC0.

Converta para OGG com: `ffmpeg -i entrada.wav -c:a libvorbis -q:a 5 saida.ogg`.
