# Artes e placeholders

Todos os arquivos ficam em `client/public/assets/` e são referenciados por **chave**, nunca por código.
Trocar uma imagem = substituir o arquivo com o mesmo nome (ou enviar pelo painel **Admin → Assets**, que também marca o asset como definitivo).
Imagens ausentes caem automaticamente num *fallback*.

`npm --prefix server run assets:placeholders` recria os placeholders que estiverem faltando (nunca sobrescreve sua arte; `-- --force` sobrescreve).

## Resoluções recomendadas

| Tipo | Caminho | Tamanho | Observações |
|---|---|---|---|
| Cenário (visual novel) | `/assets/scenes/<chave>.png` | **1920×1080** (16:9) | Exibido com `object-fit: cover`; mantenha o assunto principal no terço superior/central — os retratos ocupam a parte de baixo. JPG/WEBP enviados pelo painel são convertidos para PNG. |
| Cenário de viagem | `/assets/scenes/road_asphalt_01.png`, `road_dirt_01`, `forest_road_03`… | 1920×1080 | Usado durante o deslocamento (há um leve *pan* lateral). |
| Retrato de jogador | enviado pelo jogador | ~800×1200, PNG transparente | Cintura/peito para cima. O servidor valida PNG real, mínimo 200×250, máximo 4096², re-codifica e remove metadados. |
| Retratos de NPC / padrão | `/assets/portraits/default.png`, `npc_survivor.png` | 600×900 PNG transparente | |
| Arena tática | `/assets/arenas/<chave>.png` | **1024×704** (16×11 casas de 64 px) | Arte de vista de cima gerada por `python3 client/scripts/gen-arenas.py` a partir da geometria de `server/src/game/combat/maps.ts` (paredes, portas, coberturas). Se mudar um mapa, rode o script de novo. Portas e escombros são desenhados por cima pelo jogo (`/assets/arenas/sprites/`). Para trocar por arte própria, mantenha a imagem alinhada à grade de 64 px. |
| Ícones | — | — | Ícones de interface usam a biblioteca Lucide; ícones de itens são pendentes (ver STATUS). |

## Chaves de cenário existentes

Vários locais compartilham o mesmo cenário (ex.: as 10 casas usam `house_interior_01…05`), mas cada instância tem estado próprio.
A lista completa, com quem usa cada imagem, aparece em **Admin → Assets**. Principais chaves:

```
street_city_01, street_city_02, commercial_01, alley_01, parking_01, sewer_01,
police_lobby, police_cells, armory_01, store_interior_01, store_storage, pharmacy_01, supermarket_01,
hospital_exterior, hospital_lobby, hospital_corridor, hospital_ward, hospital_surgery, hospital_morgue, clinic_01,
school_exterior, school_classroom, school_gym, cafeteria_01, restaurant_01, workshop_01, gas_station_01, city_hall_01, church_01,
apartment_hall, apartment_interior_01, apartment_interior_02,
suburb_street_01, playground_01, house_interior_01..05, house_two_story_upstairs, garage_01, backyard_01, basement_01, shed_01, motel_01,
prison_exterior, prison_reception, prison_corridor, prison_guard_room, prison_yard, prison_cell_block, prison_solitary, prison_tower, warehouse_01,
farm_road_01, farmhouse_01, barn_01, field_01, silo_01, orchard_01, farm_store_01, creek_01,
forest_trail_01, forest_road_03, ranger_station, campsite_01, lake_01, cabin_01, deep_woods_01, grove_01,
industrial_gate, factory_floor, office_01, truck_depot, scrapyard_01, substation_01,
military_checkpoint, military_base_01, barracks_01, motor_pool, medical_tent, command_room,
highway_01, crossroads_01, bridge_01, tunnel_01, service_station_01, rest_stop_01, dirt_road_01, chapel_01,
road_asphalt_01, road_asphalt_02, road_dirt_01, main_menu, death_screen
```

Arenas: `hospital_corridor, street, house, prison_yard, forest, parking, road, supermarket, base, gas_station, alley, warehouse, farm, pharmacy, police, church, camp, bridge, sewer, military, restaurant`. Qual arena cada tipo de lugar usa fica em `ARENA_BY_CATEGORY` (`server/src/game/content/world.ts`) e pode ser trocada por local no painel de administração.

Para associar outro cenário a um local: **Admin → Mundo → (local) → Cenário**.
