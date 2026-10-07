# Maceaek

Gra 3D z działem portalowym w przeglądarce (three.js, bez bundlera) – 30 poziomów logicznych („Komora testowa”):
od prostych skoków przez portal, przez pęd i kostki, po zegary, fizzlery, odbicia w lustrach i finał, który wymaga pomysłu.

## Sterowanie

| Klawisz | Akcja |
| --- | --- |
| `W` `A` `S` `D` | poruszanie się |
| mysz | rozglądanie się |
| LPM | niebieski portal |
| PPM | pomarańczowy portal |
| `Spacja` / `Shift` | skok / bieg |
| `E` | podnieś / odłóż kostkę |
| `Q` lub `F` | rzuć trzymaną kostkę |
| `R` | restart poziomu (usuwa portale) |
| `N` / `P` | następny / poprzedni poziom |
| `H` | wskazówka do poziomu |
| `M` | wyciszenie dźwięku |
| `Esc` | pauza (wybór poziomu, ustawienia: czułość, głośność, jakość grafiki) |

Białe panele przyjmują portale, ciemne płyty – nie. Na każdym poziomie trzeba dotrzeć do zielonego pola.
Kwas w dołach cofa Cię na start poziomu (portale zostają). Strzały przelatują przez portale i kratki, szkło je zatrzymuje.

## Mechaniki

* **Portale** – wejście w jeden wychodzi drugim; zachowują pęd (wysokość zamienia się w prędkość). Widać przez nie drugą stronę (rekurencyjny render), działają na ścianach, podłodze i suficie, także gdy oba są obok siebie na jednej ścianie.
* **Kostki** (`E`) – ważą przyciski, można je nosić, rzucać i przepuszczać przez portale.
* **Przyciski i drzwi** – drzwi otwiera jeden lub kilka przycisków (wszystkie / dowolny / odwrócone), niektóre przyciski działają na zegar.
* **Fizzlery** – świetlne kurtyny, które kasują Twoje portale, a kostkę zwracają na miejsce startu.
* **Szkło i kratki** – widać przez nie; kratka przepuszcza strzał, szkło nie.

## Poziomy

1. **Wysoka półka** – portal na podłodze i drugi wysoko na ścianie
2. **Kwas** – portal na drugi brzeg przepaści
3. **Wyspy** – przestawianie portali z wyspy na wyspę
4. **Sufit** – ciemna ściana blokuje drogę, ale sufit nie
5. **Szczelina** – strzał przez wąską szczelinę
6. **Pęd** – wysokość zamienia się w prędkość
7. **Winda** – skok w dół wyrzuca Cię wyżej, niż zacząłeś
8. **Wieża** – to samo, ale dwa razy
9. **Pętla** – studnia bez dna daje prędkość, a portal można przestawić w locie
10. **Finał** – prędkość i wysokość naraz
11. **Pierwsza kostka** – zabierz kostkę i połóż ją na przycisku
12. **Dwa przyciski** – dwa ciężary, a Ty stoisz tylko na jednym
13. **Kostka w locie** – przycisk za przepaścią, do którego trzeba coś doprowadzić pędem
14. **Łańcuch kostek** – trzy przyciski naraz i drzwi, które współpracują inaczej, niż sugerują litery
15. **Przez fizzler** – kurtyna gasi portale, ale nie pęd
16. **Kratka** – kratka zatrzyma Ciebie, ale nie strzał; szkło odwrotnie
17. **Przez szkło** – portal widzi to, czego nie możesz trafić
18. **Zegar** – trzy zegary muszą biec naraz
19. **Dwa piętra** – portale przecinają grubą płytę między piętrami
20. **Labirynt luster** – najważniejsze łatki widać dopiero oczami portalu
21. **Kaskada** – wysokość daje pęd, a drzwi otwiera ktoś, kto nie musi przez nie przechodzić
22. **Przeprawa kostki** – kurtyna zabiera portale i kostkę
23. **Dźwig** – wysokie okna odsłaniają cel dopiero z lotu
24. **Odwrócone drzwi** – jedne drzwi otwiera to, co drugie zamyka
25. **Okno na świat** – okna wyżej, niż sięga wzrok; co zobaczyłby ktoś, kto tam stoi?
26. **Wieża Babel** – studnia bez dna, zapadnie i osłony otwierane ciężarem kostki
27. **Zamek** – trzy zamki, dwie kostki
28. **Odbicie** – to, czego nie widać stąd, może dosięgnąć cudze oko
29. **Rękawica** – cztery próby jedna po drugiej, każda z innej bajki
30. **Finał ostateczny** – wyjście widać od początku, droga do niego jest ukryta

Wybór poziomu jest w menu pauzy (`Esc`) i na ekranie tytułowym; ustawienia i postęp są zapamiętywane w `localStorage`.

## Uruchomienie

Gra to statyczna strona, wystarczy dowolny serwer HTTP:

```sh
python3 -m http.server 8000   # i otwórz http://localhost:8000
```

Blokada kursora wymaga `localhost` albo HTTPS. Parametr `?level=N` otwiera wybrany poziom; jakość grafiki (niska / średnia / wysoka) ustawisz w menu pauzy.

## Układ projektu

| Plik | Co to |
| --- | --- |
| `index.html`, `ui.js`, `ui.css` | strona, ekran tytułowy, HUD, pauza, wybór poziomu, ustawienia, ekran ukończenia |
| `game.js` | silnik: fizyka gracza, portale (render rekurencyjny), mechaniki, wczytywanie poziomów |
| `gfx.js`, `bake.js`, `textures.js` | grafika: wypalane oświetlenie wierzchołków i AO, mgła, tekstury proceduralne, presety jakości |
| `fx.js`, `fxcore.js`, `fxworld.js`, `fxmodels.js` | efekty: wir portalu (shadery), cząsteczki, model działa, kwas, kostki, przyciski, drzwi, fizzlery |
| `audio.js` | dźwięk syntetyzowany w Web Audio (bez plików audio) |
| `levels/lvNN.js`, `levels/index.js` | poziomy (każdy z własnym skryptem rozwiązania `solve`) |
| `testkit.js` | narzędzia testowe (`window.T`), ładowane tylko z `?test=1` |
| `vendor/` | three.js 0.186 |
| `docs/` | `ENGINE.md` (silnik i tworzenie poziomów), `gfx.md`, `fx.md`, `audio.md`, `ui.md` |

## Testy

Testy działają w prawdziwej przeglądarce (Playwright + Chromium, render programowy) i wymagają serwera na porcie 8123:

```sh
python3 -m http.server 8123 &
node tests/run.mjs                           # automatycznie rozwiązuje wszystkie 30 poziomów
node tests/run.mjs --jitter 0.1 --seeds 5    # to samo z losowym szumem celowania (odporność rozwiązań)
node tests/run.mjs 11 29 -v                  # wybrane poziomy, szczegółowo
node tests/mechanics.mjs                     # kostki, przyciski, drzwi, fizzlery, energia przy teleportacji
node tests/signs.mjs                         # tablice zwrócone w stronę gracza
node tests/gfx.mjs                           # wypalanie, wywołania rysowania, presety, wycieki geometrii
node tests/fx.mjs                            # efekty i hooki mechanik
node tests/audio.mjs                         # dźwięk
node tests/ui.mjs                            # menu, HUD, ekrany ukończenia
```

`tests/shot.mjs` robi zrzuty ekranu poziomu, `tests/try.mjs` uruchamia dowolny fragment kodu `T` na wybranym poziomie.
