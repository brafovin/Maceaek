# Maceaek

Prototyp gry 3D z działem portalowym – 10 poziomów logicznych („Komora testowa”).

## Sterowanie

| Klawisz | Akcja |
| --- | --- |
| `W` `A` `S` `D` | poruszanie się |
| mysz | rozglądanie się |
| LPM | niebieski portal |
| PPM | pomarańczowy portal |
| `Spacja` / `Shift` | skok / bieg |
| `R` | restart poziomu (usuwa portale) |
| `N` / `P` | następny / poprzedni poziom |
| `Esc` | pauza |

Białe panele przyjmują portale, ciemne płyty – nie. Na każdym poziomie trzeba dotrzeć do zielonego pola.
Kwas w dołach cofa Cię na start poziomu (portale zostają).

## Poziomy

1. **Wysoka półka** – portal na podłodze i drugi wysoko na ścianie
2. **Kwas** – portal na drugi brzeg przepaści
3. **Wyspy** – przestawianie portali z wyspy na wyspę
4. **Sufit** – ciemna ściana blokuje drogę, ale sufit nie
5. **Szczelina** – strzał przez wąską szczelinę
6. **Pęd** – wysokość zamienia się w prędkość (zanim wejdziesz na górę, przygotuj wyjście)
7. **Winda** – skok w dół wyrzuca Cię wyżej, niż zacząłeś
8. **Wieża** – to samo, ale dwa razy
9. **Pętla** – studnia bez dna daje prędkość, a portal można przestawić w locie
10. **Finał** – prędkość i wysokość naraz

Wybór poziomu jest w menu pauzy (`Esc`); `N` / `P` – następny / poprzedni, `R` – restart poziomu.

## Uruchomienie

Gra to statyczna strona (`game.js` – silnik, `levels.js` – poziomy, three.js w `vendor/`), wystarczy dowolny serwer HTTP:

```sh
python3 -m http.server 8000   # i otwórz http://localhost:8000
```

Blokada kursora wymaga `localhost` albo HTTPS.
