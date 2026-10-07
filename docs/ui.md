# Interfejs (ui.js)

HUD, ekran tytułowy, pauza, wybór poziomu, ustawienia i ekrany ukończenia. Styl: `ui.css`, markup HUD: `index.html`.
`ui.js` jest osobnym modułem ładowanym po `game.js`; z silnikiem rozmawia tylko przez `window.game`.

## Zdarzenia silnika (`game.events`, `EventTarget`; dane w `e.detail`)

| zdarzenie | kiedy | detail |
| --- | --- | --- |
| `levelstart` | `loadLevel` i `restartLevel` | `{index, name, hint, restart?}` (`restart: true` przy restarcie) |
| `levelcomplete` | gracz stanął na wyjściu | `{index, time, deaths, cubeResets}` |
| `death` | śmierć w kwasie | `{cause, deaths}` |
| `toast` | każde `toast(msg, ms, kind?)` w game.js | `{msg, ms, kind}` – `kind`: `info` / `warn` / `success` (domyślnie zgadywany z treści) |
| `pause` / `resume` | `setActive(false/true)` (utrata/zdobycie pointer lock) | – |
| `lockerror` | `pointerlockerror` | – |

## Dodatki w `game`

* `game.lookTarget()` → `{type:'cube', dist}` lub `null` (ta sama logika co `pickCube`, nic nie podnosi; `null` gdy coś trzymasz).
* `game.levelTime` – czas poziomu w sekundach (liczony w `physicsStep`, tylko gdy gra aktywna i poziom nieukończony; zerowany w `loadLevel`/`restartLevel`). `mech.deaths` i `mech.cubeResets` są teraz zerowane razem z nim (liczą się per poziom).
* `game.settings = {sensitivity, invertY}` – czytane w `mousemove` (`sensitivity` w rad/px, domyślnie 0.0022). `game.baseFov` – podstawowe FOV (ustawia `camera.fov`).
* `game.autoNext` (domyślnie `true`) – ui.js ustawia `false`, więc po ukończeniu poziomu pokazywany jest ekran zamiast automatycznego przejścia. W trybie `manual` (testy) nic się nie zmienia.
* `game.isActive()`, `game.requestLock()`, `game.doneSet`, `game.events`.
* `toast(msg, ms, kind)` w game.js tylko emituje zdarzenie – elementu `#toast` już nie ma.

## Ustawienia (`localStorage['maceaek.settings']`)

`sens` (0.2–3×), `invertY`, `fov` (60–110), `showTimer`, `showHints`, `showLegend`, a także `volume`, `muted`, `quality` –
te trzy są zapisywane i stosowane **tylko po zmianie przez gracza**, a ich kontrolki pokazują się tylko wtedy, gdy istnieje
`audio.js` (`audio.setVolume/getVolume/setMuted/isMuted/play('ui-click')`, import dynamiczny z try/catch) albo `game.setQuality/getQuality`.
Pozostałe klucze localStorage: `maceaek.stats` (najlepszy czas, zgony, resety kostek per poziom), `maceaek.last` (poziom do „Kontynuuj”), `maceaek.done` (game.js).

## Tryb testowy

Z `?test=1` ui.js pokazuje sam HUD (bez ekranów, karty wstępnej i audio) – zachowanie testów silnika bez zmian.

## API do debugowania

`window.ui`: `show(name)`, `hide()`, `showIntro()`, `pushToast(msg, ms, kind)`, `settings()`, `stats`, `state()` → `{screen, inGame}`.

## Testy

`node tests/ui.mjs --port 8123 [--shots katalog]` – przepływy ekranów, ustawienia, ukończenie poziomu, brak błędów konsoli;
zapisuje zrzuty ekranu każdego ekranu (domyślnie `/tmp/maceaek-ui`). Brak `audio.js` (404) nie jest traktowany jako błąd.
