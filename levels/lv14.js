import { DARK_ALL } from './util.js';

// Poziom 14 – „Łańcuch kostek”
//
// Układ (oś z: start przy +z, wyjście przy -z), sala x -16…16, z -45…33, h = 10:
//   z =  33 … 16   brzeg S (start): biała płyta na zachodniej ścianie (jedyny portal przy starcie), kostka K1
//                  i dwie „cele” (wnętrze x 10,4…16) za szklaną ścianą: w celi 1 leży K2, w celi 2 leży K3
//   z =  16 …  4   przepaść z kwasem (12 m), na środku kurtyna fizzlera od dna do sufitu
//   z =   4 … -4   wyspa: filar (białe ściany N i S) oraz DWA przyciski – A i B
//   z =  -4 … -16  przepaść z kwasem (12 m), na środku kurtyna fizzlera od dna do sufitu
//   z = -16 … -33  brzeg N: biała płyta na zachodniej ścianie, przycisk C (na wschodzie, 10 m od drzwi i dalej)
//   z = -33 … -45  komora z wyjściem za drzwiami (ściana działowa 2,4 m ze szklanymi oknami, 1 m przed nią
//                  kurtyna fizzlera na całą szerokość – kostki tam nie dojdą)
//
// Idea: drzwi wyjścia otwierają się dopiero, gdy wciśnięte są A, B i C naraz, a przycisk jest wciśnięty tylko wtedy,
// gdy ktoś (kostka) na nim leży – sam gracz nie przytrzyma żadnego (drzwi zamykają się natychmiast, a C jest daleko).
// Trzy kostki, trzy przyciski, ale okablowanie cel NIE jest drabiną A → B → C:
//   cela 1 (K2) otwiera się, gdy wciśnięty jest B,
//   cela 2 (K3) otwiera się dopiero, gdy wciśnięte są B ORAZ C – a C leży na przeciwległym brzegu N.
// Zatem: K1 → B (otwiera celę 1), K2 → na brzeg N, na C (otwiera celę 2), K3 → A. Kostkę trzeba wysłać
// „daleko”, żeby otworzyć drzwi tuż przy starcie. A i B są na wyspie, do której da się dojść tylko portalem,
// więc jedna para portali jest ciągle przestawiana: płyta S ↔ filar (wyspa) ↔ płyta N ↔ płyta S …
//
// Zabezpieczenia:
//  * kurtyny fizzlera (od dna do sufitu, na całą szerokość) przecinają obie przepaści: kostka rzucona przez
//    przepaść (nawet z biegu, z ~19 m/s) wraca na start, a gracz i tak nie przeskoczy 12 m. Strzał przez kurtynę
//    przelatuje, więc portale można stawiać z drugiego brzegu, i widać przez nią cały poziom (siatka zasłaniała widok);
//  * ściany działowe (cele, komora) mają 2,4 m, a szyby i drzwi są dłuższe niż otwory i wchodzą w sąsiednie filary
//    (cofnięte o 5 cm, więc niewidoczne) – bez „szwów” wypchnięcie z kostki zawsze wraca na stronę, z której przyszedł gracz;
//  * kurtyna fizzlera przed komorą: kostka, która jej dotknie, wraca na start (nie da się podeprzeć drzwi kostką);
//  * wszystkie powierzchnie poza czterema białymi (płyta S, płyta N, ściany N i S filaru) są ciemne/szklane.
// Poziom nie zależy od wysokości skoków ani od układania kostek w stos: liczy się tylko to, że wszystkie trzy kostki
// muszą leżeć na trzech przyciskach naraz, a K3 jest dostępna dopiero po wysłaniu K2 na drugi brzeg.
export default {
  name: 'Łańcuch kostek',
  hint: 'Wyjście chce trzech przycisków naraz, a sam żadnego nie utrzymasz. Cele nie zawsze otwierają się tak, jak sugeruje kolejność liter – sprawdź, co z czym współpracuje.',
  spawn: { x: 0, y: 0, z: 24, yaw: 0 },
  exit: { x: 5.5, y: 0, z: -40 },
  build(L) {
    const H = 10;
    L.room(-16, 16, -45, 33, H, DARK_ALL);

    // podłogi (wszystkie ciemne – portale tylko na białych płytach)
    L.floor(-16, 16, 16, 33, 'dark');            // brzeg S
    L.floor(-5, 5, -4, 4, 'dark');               // wyspa
    L.floor(-16, 16, -45, -16, 'dark');          // brzeg N + komora
    for (const [x0, x1, z0, z1] of [[-16, 16, 4, 16], [-16, 16, -16, -4], [-16, -5, -4, 4], [5, 16, -4, 4]]) {
      L.pit(x0, x1, z0, z1);
      // „siatka” tuż nad dnem: kostka, która spadła w kwas, wraca na start
      L.fizzler(x0, -6, z0, x1, -5.6, z1);
    }
    // bariery z siatki na środku przepaści: od dna do sufitu, na całą szerokość sali.
    // Grube na 2 m: silnik wypycha gracza z nakładającej się kostki „najkrótszą drogą”, więc cienka ściana dałaby się
    // w ten sposób „przeniknąć” (kostka upuszczona w skoku tuż przy ścianie).
    L.fizzler(-16, -6, 9.8, 16, H, 10.2);
    L.fizzler(-16, -6, -10.2, 16, H, -9.8);

    // Ściany działowe (komora, cele) są grube (2,4 m) i zbudowane bez „szwów”: szyby i drzwi są dłuższe niż otwory
    // i wchodzą o 1,3–1,5 m w sąsiednie ciemne filary (cofnięte o 5 cm, więc niewidoczne). Dzięki temu wypchnięcie z
    // kostki zawsze wypycha gracza z powrotem na stronę, z której przyszedł (zob. docs: pushOut w game.js).
    const IN = 0.05, EXT = 1.5, EZ = 1.3;
    // komora z wyjściem: ściana działowa z = -35,4 … -33 (wzdłuż x), szyby x -6,5…-4,5 i 4,5…6,5, drzwi x -1,5…1,5
    const wx = (x0, x1, y0, y1, kind, inset = 0) => L.box(x0, y0, -35.4 + inset, x1, y1, -33 - inset, kind);
    wx(-18, -6.5, -8, H, 'dark');
    wx(6.5, 18, -8, H, 'dark');
    wx(-4.5, -1.5, -8, H, 'dark');
    wx(1.5, 4.5, -8, H, 'dark');
    wx(-18, 18, 3.2, H, 'dark', IN);                                // pas nad szybami i drzwiami (jedna bryła)
    wx(-6.5 - EXT, -4.5 + EXT, 0, 4.4, 'glass', IN);        // szyba lewa (okno x -6,5…-4,5)
    wx(4.5 - EXT, 6.5 + EXT, 0, 4.4, 'glass', IN);                  // szyba prawa (okno x 4,5…6,5)
    L.door(['A', 'B', 'C'], -3, 0, -35.4 + IN, 3, 4.4, -33 - IN, { mode: 'all' });
    L.box(-18, -8, -45, -8, H, -35.4, 'dark');                      // boczne ściany komory
    L.box(8, -8, -45, 18, H, -35.4, 'dark');
    // strażnik: kurtyna fizzlera na całą szerokość sali, 1 m przed ścianą komory – kostka, która jej dotknie, wraca
    // na start, więc przy ścianie komory nie da się stanąć z kostką (żadnych sztuczek z podpieraniem drzwi ani
    // wypychaniem się przez ścianę); gracz przechodzący na wyjście traci portale, ale one są już niepotrzebne
    L.fizzler(-16, 0, -32.05, 16, H, -31.95);

    // biała płyta S (zachodnia ściana) – od góry ciemny pas równo z nią
    L.box(-16, 0, 18, -15, 3.4, 26, 'white');
    L.box(-16, 3.4, 18, -15, H, 26, 'dark');
    // biała płyta N
    L.box(-16, 0, -30, -15, 3.4, -22, 'white');
    L.box(-16, 3.4, -30, -15, H, -22, 'dark');

    // filar na wyspie (do sufitu, żeby nic na nim nie zostało)
    L.box(-4.5, 0, -0.6, -1.5, 3.4, 0.6, 'white');
    L.box(-4.5, 3.4, -0.6, -1.5, H, 0.6, 'dark');

    // przyciski: A i B na wyspie, C na brzegu N
    L.button('A', 3, -1.2);
    L.button('B', 3, 1.8);
    L.button('C', 8, -24);

    // cele (wnętrze x 10,4…16): zachodnia ściana 2,4 m (x 8…10,4) wzdłuż z; cela 1 z 17,6…23,2, przegroda 23,2…26,
    // cela 2 z 26…33; szyby z 17,6…19,4 i 26…27,8, drzwi 1 (A) z 20,8…23,2, drzwi 2 (B) z 29,2…31,6
    const wz = (z0, z1, y0, y1, kind, inset = 0) => L.box(8 + inset, y0, z0, 10.4 - inset, y1, z1, kind);
    L.box(8, 0, 16, 18, H, 17.6, 'dark');            // północna ściana + filar przed oknem 1
    wz(19.4, 20.8, 0, H, 'dark');                    // filar między oknem a drzwiami 1
    L.box(8, 0, 23.2, 18, H, 26, 'dark');            // przegroda cel (+ filary po obu stronach)
    wz(27.8, 29.2, 0, H, 'dark');                    // filar między oknem a drzwiami 2
    wz(31.6, 35, 0, H, 'dark');                      // filar za drzwiami 2 (wchodzi w ścianę sali)
    wz(16, 35, 3.2, H, 'dark', IN);                  // nadproża nad oknami i drzwiami (jedna bryła)
    wz(17.6 - EZ, 19.4 + EZ, 0, 4.4, 'glass', IN); // okno 1
    wz(26 - EZ, 27.8 + EZ, 0, 4.4, 'glass', IN);   // okno 2
    L.door('B', 8 + IN, 0, 20.8 - EZ, 10.4 - IN, 4.4, 23.2 + EZ);
    L.door(['B', 'C'], 8 + IN, 0, 29.2 - EZ, 10.4 - IN, 4.4, 31.6 + EZ, { mode: 'all' });

    L.cube(-5, 0, 22);       // K1 – przy starcie
    L.cube(13.5, 0, 18.7);   // K2 – cela 1 (drzwi A), widoczna przez okno 1
    L.cube(13.5, 0, 26.9);   // K3 – cela 2 (drzwi B), widoczna przez okno 2

    // tablice: litery przy przyciskach (na słupkach do sufitu – żadna kostka nie utknie na górze), cele i drzwi wyjścia – bez opisów, co co otwiera
    L.box(4.3, 0, -2.0, 4.7, H, -1.6, 'dark');
    L.sign('A', 'przycisk', 2.6, 1.8, 4.29, 2.1, -1.8, -Math.PI / 2);
    L.box(4.3, 0, 1.0, 4.7, H, 1.4, 'dark');
    L.sign('B', 'przycisk', 2.6, 1.8, 4.29, 2.1, 1.2, -Math.PI / 2);
    L.box(11.3, 0, -24.2, 11.7, H, -23.8, 'dark');
    L.sign('C', 'przycisk', 2.6, 1.8, 11.29, 2.1, -24, -Math.PI / 2);
    L.sign('CELA 1', '', 3.2, 1.2, 7.99, 5.4, 22, -Math.PI / 2);
    L.sign('CELA 2', '', 3.2, 1.2, 7.99, 5.4, 30.4, -Math.PI / 2);
    // wysoka tablica nad filarem (ciemna, nad portalami) – widoczna od startu: wyjście jest na północy
    L.box(-8, 4.2, -0.6, 2, H, 0.6, 'dark');
    L.sign('WYJŚCIE', 'na północy, za drzwiami', 8.4, 2.4, -3, 5.7, 0.61, 0);
    L.sign('WYJŚCIE', 'drzwi: A + B + C naraz', 9, 2.0, 0, 6.6, -32.99, 0);
    L.sign('WYJŚCIE', 'zielone pole', 7, 2.0, 0, 6.0, -44.99, 0);
  },
  solve(T) {
    const K1 = 0, K2 = 1, K3 = 2;
    // podejdź do portalu od frontu (nie przez filar) i wejdź w niego
    const enter = (i) => {
      const P = T.portal(i);
      T.walkTo(P.pos[0] + P.normal[0] * 2.2, P.pos[2] + P.normal[2] * 2.2);
      T.assert(T.walkThrough(i), 'nie wszedłem w portal ' + i);
      T.wait(0.4);
    };
    // postaw trzymaną kostkę na przycisku (x,z): stań 1,9 m na zachód od niego, patrz na wschód, upuść
    const place = (x, z) => {
      T.walkTo(x - 1.9, z);
      T.face(-Math.PI / 2, 0); T.wait(0.6); T.drop(); T.wait(1);
    };
    // z wyspy (portale: pomarańczowy na filarze, niebieski na płycie S) na brzeg S, do celi (zz = oś drzwi) po kostkę
    // i z powrotem na wyspę
    const fetchToIsland = (i, zz) => {
      enter(1);
      T.walkTo(5, zz); T.walkTo(12, zz);
      T.grab(i);
      T.walkTo(5, zz);
      enter(0);
    };

    // 1. K1 na przycisk B (to on otwiera celę 1): płyta S <-> filar (strona S); trzymana kostka leci z graczem
    T.grab(K1);
    T.shoot(0, -15, 1.4, 22);
    T.shoot(1, -3, 1.5, 0.6);
    enter(0);                                   // jesteś na wyspie z kostką
    place(3, 1.8);
    T.assert(T.buttonPressed('B'), 'przycisk B niewciśnięty');

    // 2. K2 z celi 1 – na drugi brzeg: niebieski portal przestawiony na płytę N, kostka ląduje na C
    fetchToIsland(K2, 22);
    T.walkTo(2, 2.4);
    T.shoot(0, -15, 1.4, -26);
    enter(1);                                   // jesteś na brzegu N z K2
    place(8, -24);
    T.assert(T.buttonPressed('C'), 'przycisk C niewciśnięty');

    // 3. z brzegu N z powrotem na S: pomarańczowy portal na płytę S (niebieski zostaje na płycie N)
    T.walkTo(-9, -22);
    T.shoot(1, -15, 1.4, 22);
    enter(0);                                   // brzeg S; cela 2 (B + C) jest otwarta
    T.walkTo(5, 30.4); T.walkTo(12, 30.4);
    T.grab(K3);
    T.walkTo(5, 30.4);
    T.walkTo(-9, 24);
    T.shoot(0, -3, 1.5, 0.6);                   // niebieski na filar, pomarańczowy zostaje na płycie S
    enter(1);                                   // wyspa z K3
    place(3, -1.2);
    T.assert(T.buttonPressed('A') && T.buttonPressed('B') && T.buttonPressed('C'), 'nie wszystkie przyciski wciśnięte');

    // 4. na brzeg N i do wyjścia: pomarańczowy na płytę N, wejście w niebieski (filar)
    T.walkTo(2, 2.4);
    T.shoot(1, -15, 1.4, -26);
    enter(0);
    T.walkTo(0, -30);
    T.walkTo(0, -37, 10);
    T.walkTo(5.5, -40, 10);
  },
};
