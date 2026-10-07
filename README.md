# Maceaek

Prototyp gry 3D z działem portalowym – mapa testowa („Komora testowa 01”).

## Sterowanie

| Klawisz | Akcja |
| --- | --- |
| `W` `A` `S` `D` | poruszanie się |
| mysz | rozglądanie się |
| LPM | niebieski portal |
| PPM | pomarańczowy portal |
| `Spacja` / `Shift` | skok / bieg |
| `R` | usuń portale |
| `Esc` | pauza |

Białe panele przyjmują portale, ciemne płyty – nie. Cel: dotrzeć do zielonego pola na wysokiej platformie
(w prawym górnym rogu komory). Uwaga na kwas w dole pośrodku.

## Uruchomienie

Gra to statyczna strona (three.js jest w `vendor/`), wystarczy dowolny serwer HTTP:

```sh
python3 -m http.server 8000   # i otwórz http://localhost:8000
```

Blokada kursora wymaga `localhost` albo HTTPS.
