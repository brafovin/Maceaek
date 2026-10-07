# Silnik i tworzenie poziomów

Gra 3D z działem portalowym, three.js, bez bundlera. Cały świat to prostopadłościany osiowe (AABB).
Ten dokument jest dla osób (i agentów) projektujących poziomy – opisuje fizykę, API i narzędzia testowe.

## Pliki

| Plik | Co to |
| --- | --- |
| `index.html` | strona, HUD, menu |
| `game.js` | silnik: fizyka gracza, portale, render, mechaniki, wczytywanie poziomów |
| `levels/lvNN.js` | jeden poziom = jeden plik (`export default {…}`) |
| `levels/index.js` | lista poziomów w kolejności gry |
| `levels/util.js` | pomocniki (`stairs`, `DARK_ALL`) |
| `testkit.js` | narzędzia testowe (`window.T`) – tylko z `?test=1` |
| `tests/run.mjs` | uruchamia `solve()` poziomów w przeglądarce |
| `tests/mechanics.mjs` | testy mechanik na `tests/fixtures/mech.js` |

Serwer statyczny: `python3 -m http.server 8123` w katalogu repo (zwykle już działa; sprawdź `curl -s localhost:8123/index.html`).
Układ współrzędnych: **x** – wschód (prawo), **y** – góra, **z** – południe. Domyślnie gracz startuje przy dodatnim `z`
i patrzy w stronę `-z` (`yaw = 0`). `yaw = Math.PI` patrzy na `+z`, `yaw = -Math.PI/2` na `+x` (wschód), `yaw = Math.PI/2` na `-x`.
Jednostki: metry.

## Format poziomu

```js
export default {
  name: 'Sufit',                       // ≤ 18 znaków, po polsku
  hint: 'Wskazówka po polsku…',        // 1–2 zdania, nie zdradza rozwiązania wprost
  spawn: { x: 0, y: 0, z: 12, yaw: 0 },// y = wysokość podłoża pod stopami
  exit:  { x: 0, y: 0, z: -18 },       // zielone pole; trzeba na nim stać (promień 1.8 m, |Δy| < 0.3, onGround)
  build(L) { /* patrz niżej */ },
  solve(T) { /* skrypt rozwiązania, patrz niżej */ },
};
```

### API budowy `L`

* `L.room(x0, x1, z0, z1, h, {n,s,e,w,ceil})` – ściany (grubość 2, od y=-8 do h), sufit na wysokości `h` (grubość 2) i lampy. Rodzaje ścian: `'white'` (przyjmuje portale), `'dark'` (nie przyjmuje), `'floor'`.
* `L.floor(x0, x1, z0, z1, kind='floor')` – płyta podłogi, górna ściana na y=0 (grubość 8). Kilka płyt obok siebie = podłoga z dziurami.
* `L.pit(x0, x1, z0, z1)` – dno (ciemne, y=-6) i kwas (y=-5). **Dziurę w podłodze tworzą sąsiednie `floor()`** – `pit()` tylko ją wypełnia. Kwas zabija (gracz wraca na start, portale zostają).
* `L.box(x0,y0,z0,x1,y1,z1, kind)` – dowolna bryła. Rodzaje (`kind`):
  * `white`, `floor` – przyjmują portale; `dark` – nie przyjmuje; `door` – ciemne z pomarańczowymi pasami (tylko dla `L.door`);
  * `glass` – szkło: kolizja, widać przez nie, **blokuje strzał**, nie przyjmuje portali;
  * `grate` – kratka: kolizja, widać przez nią, **strzał przelatuje**, nie przyjmuje portali. Najlepiej cienka (0.3).
* `L.cube(x, y, z)` – kostka (0.8 m); `y` = wysokość podłoża pod nią. Dodawaj po podłodze/platformach, na których leży.
* `L.button(id, x, z, {y=0, r=0.95, timer=0})` – przycisk w podłodze; wciska go gracz stojący na nim albo kostka leżąca na nim. `timer` > 0: po zwolnieniu zostaje wciśnięty jeszcze `timer` sekund.
* `L.door(ids, x0,y0,z0,x1,y1,z1, {mode:'all'|'any', invert})` – drzwi (bryła) otwierane przyciskami; `ids` = id lub tablica; `all` (domyślnie) = wszystkie wciśnięte; `invert` = otwarte, gdy NIE wciśnięte. Drzwi nie zamykają się na graczu ani kostce. Zamknięte drzwi nie przyjmują portali.
* `L.fizzler(x0,y0,z0,x1,y1,z1)` – świetlna kurtyna: gracz, który ją przetnie, traci oba portale; kostka, która ją dotknie, wraca na miejsce startu. Jedna z poziomych wymiarów powinna być cienka (kurtyna jest pogrubiana do 0.7 m).
* `L.sign(text, sub, w, h, x, y, z, ry)` – tablica na ścianie (dekoracja); `ry` obrót wokół y (`0` patrzy na +z, `Math.PI` na -z, `-Math.PI/2` na +x, `Math.PI/2` na -x).
* `stairs(L, x0, x1, zEnd, top, depth)` z `levels/util.js` – schody po 0.5 m wznoszące się w stronę `-z`.

Wskazówki budowy:
* Ściany/podłogi robimy z **dużych** brył – portal (1.3 × 2.3 m) mieści się tylko na jednej ścianie jednej bryły (nie „zszywa” sąsiednich). Bryły węższe niż portal nie przyjmą portalu.
* Ściany stojące osobno miej grube (≥ 1 m). Cienkie są tylko `grate`, `glass`, drzwi.
* Podłoga wszędzie na y = 0, chyba że świadomie robisz podesty z `L.box`.
* Sufit odległy od podłogi o co najmniej 14 m, jeśli gracz ma tam latać; lampy w suficie są dodawane automatycznie przez `room`.
* Nie nakładaj brył tej samej grubości na siebie tam, gdzie widać krawędzie (migotanie) – ale współpłaszczyznowe sąsiadujące bryły są OK.

## Fizyka gracza (stałe)

| | |
| --- | --- |
| rozmiar | AABB 0.6 × 1.8 × 0.6; oczy 1.62 m nad stopami |
| chód / bieg (Shift) | 6 / 10 m/s, w powietrzu sterowanie ~2.5× słabsze (nie hamuje – pęd zachowany) |
| skok | v = 8.4 m/s, g = 24 → wysokość **1.47 m** (wejście na podest ≤ 1.4 m), czas w powietrzu 0.7 s, skok z biegu ≈ 7 m |
| stopnie | auto-wejście ≤ 0.55 m |
| prędkość spadania | v = √(2·24·h); maks. 55 m/s |
| tarcie na ziemi | silne (zatrzymanie w ~0.3 s) |
| kwas | y < -5.4 → respawn |

## Portale

* Niebieski = LPM (indeks 0), pomarańczowy = PPM (indeks 1). Strzał tym samym kolorem przestawia portal. Tylko gdy **oba** istnieją, działają.
* Rozmiar: owal 1.3 m × 2.3 m (półosie 0.65 × 1.15). Ściana: portal ma pionową oś „up” = świat do góry. Podłoga/sufit: oś „up” portalu = **kierunek patrzenia w chwili strzału**, zaokrąglony do osi (±x lub ±z). To ważne dla kierunku wylotu (patrz niżej) – zwykle strzelaj oba portale patrząc w tę samą stronę.
* Strzał musi trafić powierzchnię `portalable`. Portal jest przesuwany, by w całości zmieścił się na ścianie bryły; nie powstanie, jeśli ściana jest za mała, przed portalem (0.4 m) jest bryła („Za mało miejsca”), albo nakładałby się na drugi portal.
* Portale na ścianie blisko podłogi (dół < 1.3 m nad podłogą) są **przyklejane do podłogi**, żeby dało się do nich wejść.
* **Strzał przelatuje przez portale** (do 5 razy): jeśli promień trafi w otwór aktywnego portalu, wylatuje z drugiego. Dzięki temu można stawiać portale w miejscach niewidocznych z pozycji gracza. Uwaga: dwa portale naprzeciw siebie, patrząc w jeden, dają pętlę (po 5 przeskokach strzał przepada).
* Wejście: wystarczy, że **środek ciała** (oś) jest w owalu powiększonym o ~30% (łatwo trafić), a oczy przekroczą płaszczyznę portalu od przodu. Portal na ścianie: ściana-gospodarz jest „dziurawa” dla gracza tylko w otworze.
* Podłoga/sufit: wpadasz, gdy środek jest nad otworem; poziomy pęd jest tłumiony, żeby nie „przebiegać” dziury bokiem.
* **Wylot**: pęd (prędkość) jest obracany tak jak portal; składowa wzdłuż normalnej wyjścia jest co najmniej **3.5 m/s** (żeby zawsze wylecieć). Przy wejściu w portal ze „spadania” prędkość = √(2·24·h) – i to jest główne źródło energii w łamigłówkach. Kierunek poziomy: składowa wzdłuż osi „up” portalu jest zachowana, składowa wzdłuż „right” odwracana → **jeśli oba portale mają tę samą oś „up”, kierunek ruchu wzdłuż niej się zachowuje**.
* Widok: kamera obraca się razem z portalem, przechył (roll) wygasa w ~0.3 s. Po teleportacji kamera chwilę „dojeżdża” (camOffset) – dlatego w testach po `T.shoot` zerujemy offset (`T.aim` to robi).
* Portale nie znikają same – tylko przez `R` (restart), fizzler, albo przestawienie.

## Kostki

* `E` podnosi kostkę, na którą patrzysz (do 3.4 m, nie przez ścianę, nie tę, na której stoisz); `E` ponownie upuszcza; `Q`/`F` rzuca (13 m/s do przodu). Trzymana kostka wisi 1.9 m przed oczami; jeśli utknie > 2.8 m od celu, upada.
* Kostka ma fizykę AABB: grawitacja, kolizje ze światem i z innymi kostkami (można je układać w stos), tarcie na ziemi. Gracz **nie** może jej pchać, ale może na niej stać (wysokość 0.8 → daje łatwy dostęp do półek do 2.2 m) i nie może przez nią przejść.
* Kostka przechodzi przez portale: swobodna – gdy jej środek przekroczy płaszczyznę portalu w otworze (zachowuje pęd, min. 2.5 m/s wylotu); **trzymana** – razem z graczem (ląduje przed nim po teleportacji).
* Kostka wpadająca do kwasu albo dotykająca fizzlera wraca na miejsce startu. `R` resetuje wszystko.

## Testowanie poziomu

Każdy poziom ma `solve(T)` – deterministyczny skrypt, który przechodzi poziom tak, jak zrobiłby to człowiek.
Wywołanie: `node tests/run.mjs --lvmod /levels/lv12.js` (jeden poziom z pliku, bez wpisywania do `index.js`) lub `node tests/run.mjs 12` (po wpisaniu do `levels/index.js`).
Opcje: `-v` (szczegóły), `--jitter 0.1 --seeds 5` (szum celowania; wymagane ≥ 4/5), `--render` (z renderowaniem, wolniej).
Uruchomienie ręczne z podglądem: `http://localhost:8123/index.html?test=1&render=1&lvmod=/levels/lv12.js` (w skrypcie Playwright: ekran przez `page.screenshot`).

Szybkie eksperymenty (szukanie obejść, próby rozwiązań) – `tests/try.mjs`:
`node tests/try.mjs --lvmod /levels/lv12.js moj.js [--jitter 0.1 --seed 3]`, gdzie `moj.js` zawiera jedną funkcję `(T) => { …; return T.st(); }`;
wypisuje zwróconą wartość, czy wyjście osiągnięte, liczbę śmierci i resetów kostek.
Zrzuty ekranu (z renderowaniem) – `tests/shot.mjs`:
`node tests/shot.mjs --lvmod /levels/lv12.js --pos 0,0,12 --yaw 0 --pitch -0.1 --out /tmp/a.png [--setup skrypt.js]`
(`--pos` = pozycja stóp; `--setup` – opcjonalna funkcja `(T)=>{…}` wykonywana przed zrzutem, np. postawienie portali; można powtórzyć `--pos/--yaw/--pitch/--out` dla wielu ujęć). Obraz obejrzyj narzędziem Read.

Przy `?test=1` fizyka jest krokowana ręcznie (`game.step`, krok 1/120 s), więc **nic nie dzieje się „samo”** – czas płynie tylko w `T.run/T.wait/T.land/T.walkTo…`.

### `T` – pomocniki

| | |
| --- | --- |
| `T.shoot(i, x,y,z)` | celuje w punkt i strzela portalem `i` (0 = niebieski, 1 = pomarańczowy); **rzuca wyjątek, gdy portal nie powstał** |
| `T.aim(x,y,z)`, `T.face(yaw, pitch)` | tylko ustawia patrzenie |
| `T.walkTo(x, z, maxSec, run)` | idzie (W) do punktu; kończy w promieniu 0.25 m **lub gdy dotrze do wyjścia**; patrz uwagi niżej |
| `T.creep(x, z)` | dochodzi do punktu powoli (z hamowaniem) – do cichego wejścia w portal |
| `T.run(sec, {KeyW:1, ShiftLeft:1, Space:1, KeyA:1…}, until)` | trzyma klawisze `sec` s; domyślnie przerywa po dotarciu do wyjścia |
| `T.wait(sec)`, `T.land(maxSec)` | czeka / spada do lądowania |
| `T.jump()` | skok (pojedynczy krok z Space) |
| `T.walkThrough(i, {run})` | idzie w portal `i` aż do teleportacji; zwraca true/false |
| `T.portal(i)` | `{active,pos,normal,up}` – **czytaj faktyczne pozycje portali** zamiast liczyć na stałe współrzędne (jitter przestawia portal!) |
| `T.grab(i)` | podchodzi do kostki `i`, patrzy na nią, podnosi; `T.drop()`, `T.throwCube()`, `T.cube(i)`, `T.buttonPressed(id)` |
| `T.tp(x,y,z)` | teleport „oszukańczy” – tylko do ustawienia sceny w testach pomocniczych, **nie w `solve`** |
| `T.assert(cond,msg)`, `T.st()`, `T.game` | asercje, stan gracza, dostęp do silnika (`T.game.player`, `.portals`, `.cubes`, `.mech`) |

Uwagi o skryptowaniu (ciężko zdobyte):
* `walkTo` kończy zwrócony kierunek patrzenia „w stronę celu” – **przed `run` ustaw `T.face(yaw, 0)`**.
* Po teleportacji obraca się `yaw` i prędkość; nie trzymaj W dalej „bezmyślnie” – możesz wrócić w kwas. Używaj `run(…, until)` z warunkiem.
* Żeby zobaczyć powierzchnię tuż za krawędzią podestu (np. podłogę niżej), **podejdź do samej krawędzi** – inaczej krawędź zasłoni cel.
* Spadanie na podłogę-portal: gracz wchodzi, gdy jego tor lotu przetnie podłogę w owalu; lot z biegu jest daleki (10 m/s × 0.6 s ≈ 6 m!). Schodź z krawędzi powoli (`creep`) albo celuj portalem tam, gdzie wyląduje gracz.
* Gdy wchodzisz w portal na podłodze zaraz po skoku/zejściu, w skrypcie najlepiej: podejść → `T.release()` → małe kroki.
* Odczyt `T.st().done` (= stoisz na wyjściu) działa dopiero, gdy gracz **stoi** (onGround).
* Dryf poziomy podczas długiego spadania (pętla studni) koryguj tłumieniem prędkości w skrypcie (`pl.vel.x *= 0.98`) albo klawiszami.

## Zasady projektowania (trudne, ale uczciwe)

1. **Jedna centralna sztuczka** na poziom (nowy pomysł, mechanika albo kombinacja), potem dodatkowe kroki. Trudność ma wynikać z myślenia, nie z precyzji celowania.
2. **Brak łatwych obejść.** Przemyśl, jakie powierzchnie są portalowalne i widoczne z każdego miejsca (sufit! ściany boczne! podłoga za przepaścią! wnętrza przez kratki/szkło!). Nieużywane powierzchnie rób `dark`. Sprawdź skok z biegu (7 m), stos kostek (+0.8 m), strzał przez portal.
3. **Brak ślepych zaułków**: każdy stan, do którego da się dojść, ma wyjście albo wymaga tylko `R` świadomie (np. kostka spadła w kwas → sama wraca; kostka na wyspie, do której nie da się wrócić → NIE dopuszczaj).
4. **Tolerancja**: rozwiązanie musi przechodzić z `--jitter 0.1 --seeds 5` (≥ 4/5). Skrypt ma czytać faktyczne pozycje portali (`T.portal`) i używać `walkThrough/creep`, a nie zakładać dokładne współrzędne.
5. **Czytelność**: gracz musi móc „zobaczyć” problem. Wskazówka (`hint`) kieruje myśleniem, nie podaje rozwiązania. Tablice (`L.sign`) opcjonalnie.
6. **Rozmiar**: sala ≤ 80 × 80 × 40 m; ścian w sumie < 150 brył.
7. Nazwa i `hint` po polsku, poprawne ogonki.
