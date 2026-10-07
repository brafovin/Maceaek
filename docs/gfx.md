# Grafika świata (gfx.js, bake.js, textures.js)

Świat to prostopadłościany osiowe, więc oświetlenie jest **wypalane przy wczytaniu poziomu** do kolorów wierzchołków.
Materiały świata to `MeshBasicMaterial({ map, vertexColors: true })` – zero obliczeń świetlnych w fragment shaderze,
dzięki czemu rysowanie przez portale (do 7 przejść na klatkę) jest tanie.

## Pliki

| Plik | Co to |
| --- | --- |
| `gfx.js` | `createGfx(THREE, renderer, scene)`: materiały `MATS`, mgła, lampy, rejestr świateł, `bake`, światło dla kostek, presety jakości |
| `bake.js` | `LightField` (ambient × AO + światła punktowe z cieniami, promienie vs AABB) i `bakeWorld` (siatka ścian, wyrzucanie ukrytych komórek, UV) |
| `textures.js` | proceduralne tekstury 512 px/kafel (deterministyczne, `rng32`), atlasy 2×2 wariantów dla paneli białych / podłogi / ciemnych płyt |
| `tests/gfx.mjs` | testy: czas wypalania, wywołania rysowania, raycast na proxy, presety jakości, światło kostek, wycieki geometrii |

## Przepływ

1. `LevelAPI.room` woła `gfx.addLamp(x, h, z)`, `LevelAPI.pit` woła `gfx.addPit(...)` (rejestr źródeł światła).
2. Po `levelDef.build(LevelAPI)` `loadLevel` woła `gfx.bake(bakeContext())`:
   * źródła: lampy sufitowe (białe, z cieniami), kwas (zielone punkty nad powierzchnią), pole wyjścia (zielone), drzwi (pomarańczowa poświata),
   * każda ściana każdej bryły jest dzielona siatką 1 m (high) / 2 m (medium, low) **oraz we współrzędnych wszystkich brył** (brak szczelin T),
   * wyrzucane są komórki zasłonięte przez inne bryły, zdublowane (współpłaszczyznowe) i „zewnętrzne” (strona ścian pokoju zwrócona w pustkę),
   * dla wierzchołków: `ambient × AO + Σ lampy` (AO: 6/10/16 promieni półsferycznych, cienie: 1 promień do każdego źródła),
   * z komórek powstaje **jedna siatka na rodzaj powierzchni** (białe, podłoga, ciemne, szkło, kratka) + osobna siatka każdych drzwi (animowana przez `game.js`),
   * oryginalne meshe brył (`worldMeshes`) zostają jako **niewidoczne proxy do raycastu** (`visible = false`, dalej `userData.box`) – kolizje, strzał i portale działają jak wcześniej,
   * lampy: jedna siatka paneli + jedna addytywna poświata na suficie.
3. W trybie `?test=1` bez `render=1` (`game.noRender`) wypalanie jest pomijane (tylko czyszczenie rejestru).

UV są we współrzędnych świata (kafel 2 m, kratka 1 m), więc sąsiednie bryły mają ciągłą siatkę; wariant paneli w atlasie wybiera
hash (numer kafla, ściana, płaszczyzna), więc ten sam kafel ma ten sam wariant niezależnie od brył. Drzwi mają jedną teksturę rozciągniętą na ścianę.

## API (`game.gfx`)

* `gfx.MATS` – jak dawniej: `{ mat, portalable, tile, shootThrough }` dla `white|floor|dark|door|glass|grate`.
* `gfx.addLamp(x, h, z)`, `gfx.addPit(x0, x1, z0, z1)` – rejestr świateł (wołane z `LevelAPI`).
* `gfx.bake(ctx)` – `ctx = { boxes, meshes, exit, render, add(obj), remove(obj) }`; `gfx.rebake()` – to samo z ostatnim kontekstem; `gfx.clear()` – czyści rejestr.
* `gfx.lightAt(x, y, z, out)` – kolor światła `{r,g,b}` (liniowy) z tej samej sumy świateł/AO co wypalony świat.
* `gfx.updateDynamics(cubes, dt)` – co kilka klatek liczy `lightAt` dla kostek i płynnie ustawia `material.color` (kostka dostaje przy pierwszym wywołaniu własny `MeshBasicMaterial` z cieniowaniem ścian).
* `gfx.stats` – `{ textureMs, bakeMs, cells, triangles, vertices, drawCalls, lights }` ostatniego wypalania.
* `gfx.QUALITY`, `gfx.quality`, `gfx.applyQuality(name)`.

## Presety jakości (`game.setQuality(name)` / `game.getQuality()`)

Zapis w `localStorage['maceaek.quality']`, domyślnie `high`. `setQuality` zmienia: `pixelRatio` (maks.), `MAX_DEPTH` portali, rozmiary
render targetów portali (poziom 0 / głębsze), MSAA, anizotropię tekstur i gęstość wypalania (siatka, liczba promieni AO, cienie) – bieżący poziom jest wypalany ponownie (kilkadziesiąt ms).

| | pixelRatio | głębokość | RT 0 / głębsze | MSAA | wypalanie |
| --- | --- | --- | --- | --- | --- |
| low | 1 | 1 | 0.5 / 0.35 | 0 | siatka 2 m, 6 promieni, bez cieni |
| medium | 1.25 | 2 | 0.75 / 0.5 | 2 | siatka 2 m, 10 promieni, cienie |
| high | 1.75 | 2 | 1.0 / 0.5 | 4 | siatka 1 m, 16 promieni, cienie |

## Dostrajanie wyglądu

* `bake.js`: `AMB` (ambient na kierunek), `shade` (AO: `ao`, wpływ AO na światło bezpośrednie: `lamp`), `shoulder` (miękkie ścięcie jasności).
* `gfx.js`: `LAMP_E0` i promień `R0` lamp (w `collectLights`), kolory/natężenie kwasu, wyjścia i drzwi, `FogExp2` (kolor, gęstość).
* `textures.js`: `drawWhite/drawFloor/drawDark/drawDoor/drawGlass/drawGrate` – każdy wariant (`k`) to osobny kafel atlasu.

Uwaga dla twórców poziomów: powierzchnie widoczne tylko z „pustki” (strona zewnętrzna ścian pokoju) są wyrzucane z siatki; poziom bez sufitu
(`L.room` zawsze go dodaje) nie powinien polegać na bryłach, których żaden promień nie trafia w inną bryłę.
