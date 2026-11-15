# Gerador de áudio do Raven Creek

Todas as músicas e efeitos em `client/public/assets/audio/` foram **sintetizados por estes scripts**: nada foi copiado de
bancos de som, então não há licença de terceiros a respeitar. Pode substituir qualquer arquivo por um de sua preferência
(mesmo nome, formato OGG): o jogo usa o que estiver na pasta.

## Requisitos
Python 3 com `numpy` e `scipy`, e o `ffmpeg` no PATH.

```bash
pip install numpy scipy
```

## Gerar de novo
Rode a partir desta pasta:

```bash
python sfx.py   ../../client/public/assets/audio/sfx
python phone.py ../../client/public/assets/audio/sfx            # sons do celular do Dia 1
python music.py ../../client/public/assets/audio/music            # todas as trilhas
python music.py ../../client/public/assets/audio/music combat     # só uma
```

- `synth.py`: blocos de síntese (ruídos, filtros, envelopes, reverb, loop sem emenda).
- `sfx.py`: um função por efeito (`gunshot`, `zombie_groan`, `rain`…). Mude parâmetros e rode de novo.
- `music.py`: cada trilha é um bloco em `build()` com tom, acordes, andamento e camadas.
