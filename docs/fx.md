# Efekty wizualne (moduł „fx”)

Portale, strzał, pistolet, kwas, pole wyjścia, wizualia mechanik i efekty ekranowe są w osobnych plikach.
`game.js` tylko wywołuje je w kilku miejscach (haczyki, lista niżej).

| Plik | Zawartość |
| --- | --- |
| `fx.js` | publiczne API (`import * as fx from './fx.js'`): shader i animacje portali, strzał (pocisk, rozbryzg, nieudany strzał), efekty ekranowe, wykrywanie zdarzeń (lądowanie, kwas), `update`, `init`, `bind` |
| `fxcore.js` | stan wspólny `S`, pula cząstek (`ParticlePool`), decale na ścianach (`ring`), pomocniki `burst`/`glow` |
| `fxworld.js` | kwas, pole wyjścia, kostki, przyciski, drzwi, fizzlery |
| `fxmodels.js` | model i animacja pistoletu (`createGun`) |
| `tests/fx.mjs` | test dymny z renderowaniem (błędy shaderów, limity pul, scenariusze) |

## Zasady wydajności

* Cząstki: dwie pule `InstancedBufferGeometry` (addytywna 1800, zwykła 800) – razem 2 draw calle na widok, bez alokacji na klatkę
  (tablice typowane, usuwanie przez zamianę z ostatnim). Pełna pula to ok. 0.15 ms CPU na klatkę.
* Wszystko rysuje się w scenie głównej, więc efekty widać także przez portale. Żadnych świateł dynamicznych w świecie,
  żadnych cieni, żadnego post-processu. Efekty ekranowe to DOM/CSS + jeden mały canvas 2D (320×180, tylko przy dużej prędkości).
* Pociski to 12 gotowych wstęg (jeden quad, ustawiany w vertex shaderze do kamery) + miękka cząstka jako głowa.
* Pistolet ma ok. 30 siatek, ale rysuje się raz na klatkę (osobna scena `gunScene`).
* Emitery ciągłe (iskry portali, bąble i opary kwasu, cząstki pola wyjścia, iskry fizzlerów) są wyłączane, gdy kamera jest daleko.
* Efekty duże przy ścianach (błyski) są odsunięte od ściany wzdłuż normalnej – cząstka przecinająca ścianę miałaby ostrą krawędź.

## Haczyki w `game.js` / `index.html`

`index.html` – **bez zmian** (nakładka ekranowa jest tworzona w JS tuż za `<canvas>`, pod HUD-em).

`game.js`:
* import `fx`; `fx.init({...})` zaraz po utworzeniu `scene/camera` (przed portalami); `fx.bind({...})` po `window.game = game`
  (ustawia też `game.fx` – przydatne w testach i do ręcznego wywoływania efektów).
* `clearLevel()` → `fx.clearLevel()`; `loadLevel()` → `portals.forEach(p => p.clear(true))` (bez animacji zamykania) i `fx.makePad(exit)`.
* `Portal`: shader z `fx.portalVert/portalFrag`, `fx.portalUniforms`, halo `fx.makeHalo`, `fx.portalGone(this)` w `place()`/`clear()`,
  `uOpen` w `updateScale()`. Przez-portalowe renderowanie (`tMap`, `uUseTex`, `vClip`) bez zmian.
* pistolet: `gunRig = fx.createGun(gunScene)`; `gunRig.fire(color)` w `fire()`, `gunRig.update(dt)` w `updateGun()`.
* `spawnRing()` → `fx.impact()` (miejsce trafienia; kolor `0x9aa4ae` oznacza nieudany strzał), `fx.shot(segs, color, hit)` w `fire()`.
* mechaniki: `fx.cubeMaterial/cubeBuilt`, `fx.buttonBuilt`, `fx.doorBuilt`, `fx.fizzlerMaterial/fizzlerBuilt`, `mechEvent → fx.mechEvent`,
  `fxCubeTeleport → fx.cubeTeleport`, `fxCubeReset → fx.cubeReset`. `mechanicsVisuals` zostało tylko przesuwanie drzwi.
* `frame()`: `fx.update(dt)` (zamiast `updateEffects`), `fx.levelComplete(exit)` przy ukończeniu poziomu, otwieranie portali wolniej (`dt * 3.2`).
* `updateCamera(dt)`: `fx.cameraFx(camera, dt)` (drżenie, kołysanie po lądowaniu, FOV kick); `teleport(P)`: `fx.teleported(P)` (błysk w kolorze wyjścia).

## API

```
fx.init(ctx) / fx.bind(ctx)         – patrz wyżej
fx.update(dt)                       – raz na klatkę (cząstki, pociski, portale, mechaniki, kwas, pad, ekran)
fx.cameraFx(camera, dt)             – drżenie / FOV; dt = 0 nic nie robi (strzał nie zależy od drżenia)
fx.clearLevel()                     – zwalnia wszystko, co zależy od poziomu
fx.shot(segs, color, hit)           – pociski wzdłuż odcinków toru (także przez portale); opóźnia rozbryzg o czas lotu
fx.impact(point, normal, color)     – rozbryzg: kolor portalu = sukces, 0x9aa4ae = nieudany strzał
fx.flash(color, amount, decay)      – błysk całego ekranu (np. w kolorze portalu)
fx.acidSplash(x, z, power)          – rozbryzg kwasu (power 0..1)
fx.levelComplete(exit)              – konfetti, iskry, fala uderzeniowa, błysk
fx.hooks.shotFail(kind) / .impact() – miejsca dla dźwięku: kind 1 = brak miejsca, 2 = powierzchnia nie przyjmuje portali
```

Efekty wykrywane samodzielnie (bez haczyków w `game.js`): lądowanie (po `player.onGround` i prędkości pionowej → kurz, drżenie, ugięcie pistoletu),
śmierć w kwasie (po `mech.deaths` → rozbryzg i zielony błysk), podniesienie/upuszczenie kostki (po `mech.held`).
Kostki są tu także poprawnie synchronizowane z fizyką (`mesh.position = pos`) – wcześniej siatka kostki zostawała w miejscu startu.

## FOV

`fx.cameraFx` poszerza FOV proporcjonalnie do prędkości (do ok. 9° przy spadaniu) i o krótkie „uderzenie” po teleportacji.
Bazą jest `game.baseFov`, jeśli istnieje, a w przeciwnym razie `camera.fov` z chwili startu. **Zmiana FOV w ustawieniach musi ustawiać `game.baseFov`.**

## Kolory i tryb mieszania

Efekty świecące są addytywne – na bardzo jasnej ścianie szybko się „wypalają” do bieli, dlatego fizzler używa zwykłego mieszania
(z kolorem i przezroczystością), a poświaty mają umiarkowaną jasność.
