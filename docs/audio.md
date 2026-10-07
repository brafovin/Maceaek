# Dźwięk (`audio.js`)

Cały dźwięk jest syntezowany w Web Audio API (oscylatory, filtrowany szum, obwiednie, wygenerowany pogłos) – bez plików dźwiękowych.
Tor: głosy → (PannerNode, gdy podano `pos`) → szyna → `DynamicsCompressor` (limiter) → `master` (głośność użytkownika) → wyjście.
Pogłos (ConvolverNode z wygenerowaną odpowiedzią impulsową) jest wspólny; każdy dźwięk ma własną wysyłkę.

## API

```js
import { audio, gameAudio } from './audio.js';
audio.init()                 // przy pierwszym geście użytkownika; bezpieczne wielokrotnie, no-op w ?test=1 i bez AudioContext
audio.play(name, opts?)      // opts: { pos:[x,y,z] lub {x,y,z}, volume:0..1, rate:0.5..2, delay:s }
audio.setVolume(v) / getVolume()   // 0..1, domyślnie 0.7, zapis: localStorage 'maceaek.volume'
audio.setMuted(b) / isMuted()      // zapis: 'maceaek.muted'; klawisz M w game.js
audio.update(dt, listener)   // co klatkę: listener = { pos:[x,y,z], yaw, pitch, portals? }
audio.ready                  // true po udanym init (kontekst utworzony)
audio.debug()                // diagnostyka (testy): { state, voices, master, peak, portalLoops, names }
```

* Głośność mastera = `volume²` (krzywa percepcyjna); zmiany są wygładzane po stronie audio (`setTargetAtTime`).
* `play()` z nieznaną nazwą tylko ostrzega w konsoli (raz na nazwę). Gdy kontekst jest zawieszony (autoplay), `play()` próbuje go wznowić i pomija dźwięk.
* Limit głosów: 24 (dźwięki mało ważne – kroki, hover, lądowanie, skok, uderzenie kostki – 16); ten sam dźwięk co najmniej 15 ms po poprzednim (kroki 120 ms).
* `update()` ustawia pozycję i orientację słuchacza, a z `listener.portals` (tablica dwóch obiektów `Portal`: `active`, `linked`, `pos`) steruje pozycyjnymi szumami portali (niebieski wyższy i szybszy, pomarańczowy niższy; głośniej, gdy oba portale są połączone).
* Tło pomieszczenia (`hum`) włącza się przy `init()`; `play('hum')` jest dopuszczalne i nic nie robi.

## Nazwy dźwięków

`shoot-blue`, `shoot-orange`, `portal-open-blue`, `portal-open-orange`, `portal-close`, `shot-fail`, `teleport` (`rate`/`volume` z prędkości),
`jump`, `land` (`volume` z prędkości), `step`, `acid-splash`, `button-on`, `button-off`, `door-open`, `door-close`, `cube-pick`, `cube-drop`,
`cube-throw`, `cube-hit`, `cube-reset`, `fizzle`, `level-complete`, `ui-click`, `ui-hover`, `ui-back`, `pause`, `resume`, `hum`.

Nowy dźwięk = nowa funkcja w `SOUNDS` w `audio.js`, np. `nazwa(v) { v.tone({ f: 440, f2: 220, dur: 0.2, peak: 0.3 }); v.noise({ f: 2000, q: 1, dur: 0.05 }); }`
(`v.wet` – udział pogłosu; `v.tone`/`v.noise` – patrz komentarze przy klasie `Voice`). Szczyt pojedynczego dźwięku ~0.2–0.7 przy master = 1.

## `gameAudio` – haczyki z game.js

Cienka warstwa „co zagrać przy zdarzeniu gry”, żeby game.js miał tylko jednolinijkowe wywołania:
`frame(dt, camera, player, portals)`, `shoot(index, portals, fire)` (wywołuje `fire`, zwraca jego wynik), `move(dt, player, wasGround, vyBefore)` (kroki + lądowanie),
`teleport(speed)`, `cubeTeleport(c)`, `cubeHit(c, speed)`, `cubeDrop(c)`, `cubeReset(c)`, `acid(x,y,z,volume?)`, `mech(type, obj)`, `levelStart(portals?)`.

Miejsca wywołań w game.js: import (góra pliku), `physicsStep` (skok, `vyBefore` + `gameAudio.move`, kwas), `teleport`, `cubeTeleport`, `stepCube`,
`respawnCube`, `mechEvent`, `loadLevel`, `restartLevel`, `setActive` (pause/resume), `overlay` click i `pointerlockchange` (`audio.init()`), `mousedown`,
`keydown` (E/Q/M), `frame()` (level-complete, `gameAudio.frame`).

## Testy

`node tests/audio.mjs --port 8123` – Chromium z `--autoplay-policy=no-user-gesture-required`, strona bez `?test=1`: start kontekstu, `play()` każdej nazwy,
głośność/wyciszenie (gain mastera), klawisz M, limit głosów, sprzątanie głosów, poziomy sygnału (brak klipowania), pętle portali, haczyki w grze
(strzał, skok/lądowanie, kroki, kwas, pauza, ukończenie, przyciski/drzwi, uderzenie kostki) oraz no-op w `?test=1`.
