# Grafika świata (gfx.js, bake.js, textures.js)

Świat to prostopadłościany osiowe, więc oświetlenie jest **wypalane przy wczytaniu poziomu** do kolorów wierzchołków.
Materiały świata to `MeshBasicMaterial({ map, vertexColors: true })` – zero obliczeń świetlnych w fragment shaderze,
dzięki czemu rysowanie przez portale (do 7 przejść na klatkę) jest tanie.

## Pliki

| Plik | Co to |
| --- | --- |
| `gfx.js` | `createGfx(THREE, renderer, scene)`: materiały `MATS`, mgła, lampy, rejestr świateł, `bake`, światło dla kostek, presety jakości |
| `bake.js` | `BoxGrid` (jednorodna siatka okluzorów, DDA), `LightField` (ambient × AO + światła punktowe z cieniami, promienie vs AABB) i `bakeWorld` (siatka ścian, wyrzucanie ukrytych komórek, UV) |
| `textures.js` | proceduralne tekstury 512 px/kafel (deterministyczne, `rng32`), atlasy 2×2 wariantów dla paneli białych / podłogi / ciemnych płyt |
| `tests/gfx.mjs` | testy: czas wypalania, wywołania rysowania, raycast na proxy, presety jakości, światło kostek, wycieki geometrii |

## Przepływ

1. `LevelAPI.room` woła `gfx.addLamp(x, h, z)`, `LevelAPI.pit` woła `gfx.addPit(...)` (rejestr źródeł światła).
2. Po `levelDef.build(LevelAPI)` `loadLevel` woła `gfx.bake(bakeContext())`:
   * źródła: lampy sufitowe (białe, z cieniami), kwas (zielone punkty nad powierzchnią), pole wyjścia (zielone), drzwi (pomarańczowa poświata),
   * każda ściana każdej bryły jest dzielona siatką 1 m (high) / 2 m (medium, low) **oraz we współrzędnych wszystkich brył** (brak szczelin T),
   * wyrzucane są komórki zasłonięte przez inne bryły, zdublowane (współpłaszczyznowe) i „zewnętrzne” (strona ścian pokoju zwrócona w pustkę),
   * dla wierzchołków: `ambient × AO + Σ lampy` (AO: 6/10/16 promieni półsferycznych, cienie: 1 promień do każdego źródła; promienie idą po siatce przyspieszającej, patrz „Wydajność wypalania”),
   * z komórek powstaje **jedna siatka na rodzaj powierzchni** (białe, podłoga, ciemne, szkło, kratka) + osobna siatka każdych drzwi (animowana przez `game.js`),
   * oryginalne meshe brył (`worldMeshes`) zostają jako **niewidoczne proxy do raycastu** (`visible = false`, dalej `userData.box`) – kolizje, strzał i portale działają jak wcześniej,
   * lampy: jedna siatka paneli + jedna addytywna poświata na suficie.
3. W trybie `?test=1` bez `render=1` (`game.noRender`) wypalanie jest pomijane (tylko czyszczenie rejestru).

UV są we współrzędnych świata (kafel 2 m, kratka 1 m), więc sąsiednie bryły mają ciągłą siatkę; wariant paneli w atlasie wybiera
hash (numer kafla, ściana, płaszczyzna), więc ten sam kafel ma ten sam wariant niezależnie od brył. Drzwi mają jedną teksturę rozciągniętą na ścianę.

## Wydajność wypalania

Pomiar (Chromium headless, ciepłe, mocno obciążona maszyna): poziom 29 (150 tys. trójkątów) 4,2–4,6 s → ok. 0,4 s (high) i 0,25–0,35 s (medium); suma 30 poziomów (high) 15,2 s → 2,9 s.
Główne zabiegi (`bake.js`):

* **`BoxGrid`** – jednorodna siatka (komórki ok. 4,5 m) z listami okluzorów; promienie AO, cieni i „zewnętrzności” przechodzą ją algorytmem DDA i testują tylko bryły z komórek na trasie
  (z „znaczkami” zamiast powtórnych testów, z wcześniejszym końcem przy pierwszym trafieniu dla cieni). Wyniki są **identyczne bit w bit** z przeglądem wszystkich brył.
  Ta sama siatka (na bryłach litych) obsługuje test „komórka zasłonięta/zdublowana” w `bakeWorld`.
* **Pamięć podręczna cienia** – `LightField.blockedL` najpierw sprawdza bryłę, która ostatnio zasłoniła dane światło (sąsiednie wierzchołki mają zwykle ten sam cień); też dokładne.
* **Lista świateł na ścianę** – do `shade` trafiają tylko światła przed płaszczyzną ściany i w zasięgu odcięcia od jej prostokąta (reszta i tak odpadała na tych samych warunkach).
* **Podpowiedzi (`bake.hint`, w metrach; 0 = wyłączone, wtedy wynik jest dokładnie taki jak bez optymalizacji)** – wierzchołki siatki ściany mają poziomy (liczba zer na końcu indeksów);
  „grube” (parzyste indeksy) liczone są w całości i zapamiętują widoczność każdego światła oraz AO. Wierzchołek pośredni, którego najbliżsi grubsi sąsiedzi (w promieniu `hint`) są już policzeni
  i **zgadzają się** co do widoczności światła, dziedziczy ją (pomija próbę cienia); AO interpolowane jest liniowo z sąsiadów, jeśli różnią się o mniej niż `aoTol` (0,04).
  Wierzchołki leżące na krawędzi pobliskiej bryły (narożniki, krawędzie otworów) zawsze liczone są dokładnie. Wynik jest deterministyczny; typowy błąd koloru < 0,01, rzadko pojedyncze wierzchołki do ~0,2
  (np. wąska smuga światła przez otwór, której grubi sąsiedzi nie widzą).
* Geometria zapisywana jest od razu do tablic typowanych (`Float32Array`/`Uint32Array`), bufory robocze ścian są współdzielone, parametry promieni przekazywane przez `Float64Array` (bez alokacji liczb przy każdym wywołaniu).

Siatka ścian (komórki 1 m / 2 m oraz podział po współrzędnych wszystkich brył – brak szczelin T) i liczba trójkątów **nie zmieniły się**.

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
| low | 1 | 1 | 0.5 / 0.35 | 0 | siatka 2 m, 6 promieni, bez cieni, `hint` 2,1 |
| medium | 1.25 | 2 | 0.75 / 0.5 | 2 | siatka 2 m, 10 promieni, cienie, `hint` 2,1 |
| high | 1.75 | 2 | 1.0 / 0.5 | 4 | siatka 1 m, 16 promieni, cienie, `hint` 1,5 |

## Dostrajanie wyglądu

* `bake.js`: `AMB` (ambient na kierunek), `shade` (AO: `ao`, wpływ AO na światło bezpośrednie: `lamp`), `shoulder` (miękkie ścięcie jasności).
* `gfx.js`: `LAMP_E0` i promień `R0` lamp (w `collectLights`), kolory/natężenie kwasu, wyjścia i drzwi, `FogExp2` (kolor, gęstość).
* `textures.js`: `drawWhite/drawFloor/drawDark/drawDoor/drawGlass/drawGrate` – każdy wariant (`k`) to osobny kafel atlasu.

Uwaga dla twórców poziomów: powierzchnie widoczne tylko z „pustki” (strona zewnętrzna ścian pokoju) są wyrzucane z siatki; poziom bez sufitu
(`L.room` zawsze go dodaje) nie powinien polegać na bryłach, których żaden promień nie trafia w inną bryłę.
