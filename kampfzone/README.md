# Kampfzone

Ein Battle-Royale-Spiel im Browser (three.js, ohne Build-Schritt): Du fliegst mit allen anderen Spielern in einem
Linienbus am Heißluftballon über die Karte, springst ab, plünderst Truhen, baust und bearbeitest Deckung, kämpfst
gegen Bots, schwimmst durch Seen und musst vor der schrumpfenden Zone fliehen. Wer als Letztes übrig ist, gewinnt.

## Starten

ES-Module laufen nicht über `file://`, deshalb einen kleinen Webserver im **Repo-Verzeichnis** starten:

```sh
python3 -m http.server 8000
```

und dann <http://localhost:8000/kampfzone/> öffnen. Gespielt wird mit Maus und Tastatur.

## Steuerung

| Taste | Aktion |
| --- | --- |
| `W` `A` `S` `D` | laufen |
| `Shift` | sprinten |
| `X` | schleichen (geduckt, lautlos, schwerer zu entdecken, genauer schießen) |
| `Shift` + `X` | rutschen (aus dem Sprint heraus) |
| `Leertaste` | springen · im Bus: abspringen · im Fall: Gleiter öffnen |
| Maus | umsehen |
| `V` | im Bus: Ansicht innen (Sitzplatz) / außen |
| linke Maustaste | schießen / hacken / bauen / heilen |
| rechte Maustaste | zielen (Scharfschützengewehr: Zielfernrohr) · im Baumodus: Material wechseln · beim Bearbeiten: zurücksetzen |
| `1` | Spitzhacke |
| `2` – `7` | die 6 Inventarplätze (auch Mausrad) |
| `E` | Truhe öffnen / Gegenstand aufheben (bei vollem Inventar: mit dem gewählten Platz tauschen) |
| `R` | nachladen · im Baumodus: Material wechseln (Holz → Stein → Metall) |
| `Q` / `F` / `C` | Wand / Boden / Rampe bauen (Baumodus) |
| `B` | Baumodus an/aus |
| `G` | eigenes Bauteil bearbeiten / Bearbeitung bestätigen |
| `M` | große Karte |
| `Esc` | Pause (Empfindlichkeit, Lautstärke, Schatten, Grafik) |

## Was es gibt

* **HUD:** unten links Leben (grün) und Schild (blau), unten rechts das Inventar mit Spitzhacke + 6 Plätzen,
  darüber Munition und Baumaterial; oben rechts Minikarte, Zonen-Timer, Spieler übrig und Eliminierungen.
* **Battle-Bus:** ein realistischer gelber Linienbus (Fenster, Glastüren, Sitzreihen, Haltestangen, Fahrer,
  Zielanzeige „KAMPFZONE“) hängt an einem Heißluftballon. Alle Spieler sitzen sichtbar darin; die Türen öffnen
  nach 3 Sekunden. Mit `V` wechselst du zwischen Sitzplatz-Ansicht und Außenansicht.
* **Truhen** (golden, funkeln) stehen in den Häusern, in der Kirche, am Straßenrand, im Wald, auf dem Bauernhof
  und auf der Insel. Jede gibt eine gute Waffe mit Munition, oft Heilung und 30 Baumaterial.
  **Auf dem Boden liegen nur schwache Waffen** (grau/grün: Pistole, MP, Schrotflinte, Sturmgewehr).
* **Waffen** in fünf Seltenheiten (Gewöhnlich bis Legendär): Pistole, Maschinenpistole, Sturmgewehr,
  Schrotflinte, Scharfschützengewehr, Raketenwerfer. Kopftreffer machen mehr Schaden.
* **Heilen:** Verband (bis 75 Leben), Medikit, Mini-Schild (bis 50 Schild), Schildtrank.
* **Spitzhacke:** baut alles ab und gibt Material – Bäume → Holz, Felsen → Stein,
  Autos/Ampeln/Mülltonnen/Bürohäuser → Metall, Ziegel- und Putzhäuser/Kirche → Stein, Holzhäuser → Holz.
* **Bauen:** Wand, Boden und Rampe im 4-m-Raster, je 10 Material. Holz baut schwächer, Metall am stärksten.
  Alles (auch die Häuser) kann zerschossen oder abgebaut werden.
* **Bearbeiten (`G`):** Schau auf ein eigenes Bauteil und drück `G`. Wände haben 3 × 3 Kacheln, Böden 2 × 2:
  Kacheln anklicken oder darüberziehen entfernt sie (Tür, Fenster, halbe Wand …), Rampen drehst du per Klick.
  Rechte Maustaste setzt zurück, `G` bestätigt.
* **Bewegung:** Sprinten (`Shift`), Schleichen (`X`, lautlos und für Bots schwer zu entdecken) und Rutschen
  (`X` während des Sprints – kurzer Geschwindigkeitsschub, danach geduckt). Schritte sind zu hören, beim Schleichen nicht.
* **Wasser:** vier Seen (Inselsee, Waldsee, Mühlteich, Fischteich) und ein Fluss. Im tiefen Wasser schwimmst du
  langsam (ohne Waffe), im flachen Wasser watest du. Kein Fallschaden bei Landung im Wasser.
* **Insel im Inselsee:** Leuchtturm mit drehendem Lichtkegel, Fischerhütte, Steg mit Leiter, Ruderboot und Truhen.
  Hinkommen nur schwimmend – oder du baust dir eine Brücke.
* **Stadt:** 11 Gebäude (Büro, Ziegel, Putz, Holz) mit Treppen und mehreren Stockwerken, Straßen mit
  Zebrastreifen, Ampeln mit echten Phasen (Rot, Rot-Gelb, Grün, Gelb), Mülltonnen (grau, blau, gelb, braun, grün),
  Laternen und parkende Autos.
* **Siedlung** im Westen: 8 Häuser mit Satteldach, Gartenzäunen und Mülltonnen an einer Dorfstraße.
* **Bauernhof** im Osten: Wohnhaus, rote Scheune, Silo, Traktor, Heuballen und Weidezaun.
* **Kirche** mit begehbarem Turm (Rampen bis zur Glockenstube), Turmuhren mit der echten Uhrzeit, Kirchenbänken,
  Altar, Buntglasfenstern, Kirchplatz mit Brunnen und kleinem Friedhof.
* **Zone:** schrumpft nach 75 Sekunden zum ersten Mal, danach in Phasen; außerhalb gibt es Sturmschaden.
* **Bots** (9–29, drei Schwierigkeitsstufen) springen ab, plündern, kämpfen auch untereinander, bauen bei Beschuss
  Wände, heilen sich und laufen vor dem Sturm davon.

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `main.js` | Renderer, Eingabe, Kamera, Battle-Bus, Spielablauf, Menüs |
| `map.js` | Karte: Straßen, Gebäude, Kirche, Siedlung, Bauernhof, Insel, Ampeln, Mülltonnen, Natur, Truhen |
| `terrain.js` | Gelände mit Seen, Fluss und Insel, Sandstrand, Wasseroberfläche |
| `bus.js` | der Linienbus mit Ballon, Sitzplätzen und Fahrer |
| `pieces.js` | zerstörbare Teile (Instanz-Pools), Bausystem, Bearbeiten |
| `physics.js` | Kollision (Boxen + Schrägen im Raster), Figurenbewegung, Strahltests |
| `actors.js` | Figuren: Modell, Animation, Schießen, Spitzhacke, Heilen, Schaden, Schleichen, Rutschen, Schwimmen |
| `bots.js` | Gegner-KI |
| `items.js`, `inventory.js`, `loot.js` | Waffen/Gegenstände, Inventar, Truhen und Bodenbeute |
| `zone.js` | Sturm-Zone |
| `hud.js`, `style.css`, `index.html` | Oberfläche |
| `fx.js`, `sfx.js`, `textures.js`, `geo.js` | Effekte, Geräusche (WebAudio), Texturen (Canvas), Geometrie-Helfer |

Test: `node tests/kampfzone.mjs` (braucht den Webserver auf Port 8123 und Playwright).
Für Experimente gibt es `index.html?test=1&auto=1&skipbus=1&seed=7&bots=19`.
