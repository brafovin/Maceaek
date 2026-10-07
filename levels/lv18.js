import { DARK_ALL } from './util.js';

// Poziom 18 – „Zegar”.
// Układ (x – wschód, z – południe; gracz zaczyna na południu i patrzy na północ):
//   start (z 0..8) – przepaść G1 – wyspa (z -30..-10) z przyciskiem A i podestem z przyciskiem B –
//   przepaść G2 – niski murek – dziedziniec (z -62..-44) z przyciskiem C; na jego północnej ścianie drzwi, za nimi wyjście.
// Drzwi są otwarte tylko wtedy, gdy biegną WSZYSTKIE TRZY zegary (C 30 s, B 7,5 s, A 5 s od zejścia z przycisku).
// Na wyspę i na dziedziniec da się wejść wyłącznie portalami; jedyne portalowalne powierzchnie to 5 białych płytek.
// Pomysł: jedna para portali służy trzy razy – (1) jako most start → wyspa, (2) jako wahadło wyspa ↔ dziedziniec
// (żeby włączyć najdłuższy zegar C), (3) jako skrót do drzwi w sprincie po ostatnim zegarze A.
// Płytkę przy drzwiach (P2b, nisko) widać tylko z wysokiego podestu (7 m, ponad murkiem 4,4 m); wylot na wyspie jest niski,
// więc ani peryskop, ani lot nie pozwalają jej zobaczyć wcześniej. Wabik P2a (wysoko, daleko na zachodzie) jest za daleko od drzwi.
// W rogu dziedzińca jest dołek z kwasem: śmierć wraca na start z postawionymi portalami (brak soft-locku, gdy oba stoją na dziedzińcu).
const T_A = 5.0;      // przycisk A (wyspa, na dole) – najkrótszy zegar, włączany na końcu
const T_B = 7.5;      // przycisk B (podest)
const T_C = 30;       // przycisk C (dziedziniec) – najdłuższy zegar, włączany pierwszy

export default {
  name: 'Zegar',
  hint: 'Trzy zegary muszą biec naraz, a piechotą nie zdążysz. Nie wszystko widać z dołu.',
  spawn: { x: 0, y: 0, z: 5, yaw: 0 },
  exit: { x: 30, y: 0, z: -68 },
  build(L) {
    L.room(-28, 34, -72, 8, 22, DARK_ALL);
    // pełne boki korytarza (start, przepaści, wyspa) i północna zabudowa
    L.box(-28, -8, -44, -10, 22, 8, 'dark');
    L.box(10, -8, -44, 34, 22, 8, 'dark');
    L.box(-28, -8, -72, 24, 22, -62, 'dark');
    L.box(24, -8, -64, 28, 22, -62, 'dark');
    L.box(32, -8, -64, 34, 22, -62, 'dark');
    L.box(28, 4, -64, 32, 22, -62, 'dark');
    L.box(24, 8, -72, 34, 22, -64, 'dark');            // niski sufit sali wyjścia

    // start, przepaść G1, wyspa, przepaść G2, murek
    L.floor(-10, 10, 0, 8, 'dark');
    L.pit(-10, 10, -10, 0);
    L.floor(-10, 10, -30, -10, 'dark');
    L.pit(-10, 10, -42, -30);
    L.box(-10, -8, -44, 10, 4.4, -42, 'dark');
    L.floor(-25, 34, -72, -44, 'dark');                // dziedziniec i sala wyjścia
    // dołek z kwasem w rogu dziedzińca: wyjście z sytuacji, gdy oba portale stoją na dziedzińcu (śmierć = powrót na start)
    L.floor(-28, -25, -72, -53, 'dark');
    L.floor(-28, -25, -49, -44, 'dark');
    L.pit(-28, -25, -53, -49);
    L.sign('KWAS', 'powrót na start', 3.6, 1.6, -25.5, 2.2, -44.05, Math.PI);

    // podest (7 m) ze schodami od zachodu (krótkie, 0.5 m stopień i głębokość – nie zasłaniają niskiej płytki I3)
    L.box(-10, 0, -30, 10, 7, -25, 'dark');
    for (let i = 1; i <= 14; i++) L.box(-10, 0, -25, -5, 0.5 * i, -25 + 0.5 * (15 - i), 'dark');
    // poręcz (kratka – strzał przelatuje) przy północnej krawędzi podestu
    L.box(-10, 7, -30, 10, 7.8, -29.7, 'grate');
    // słup zasłaniający wschodnią płytkę przed startem
    L.box(2, 0, -16, 10, 6, -10.5, 'dark');

    // białe płytki (jedyne portalowalne powierzchnie)
    L.box(-10, 0, 1.5, -9.6, 3.6, 6.5, 'white');        // start (zachodnia ściana)
    L.box(-10, 0, -17, -9.6, 3.0, -11.5, 'white');      // wyspa, nisko, od zachodu (wylot na poziomie podłogi)
    L.box(9.6, 0, -23, 10, 2.6, -17, 'white');          // wyspa, przy przycisku A, od wschodu
    L.box(0, 0, -62, 8, 2.6, -61.6, 'white');           // dziedziniec, nisko, przy północnej ścianie
    L.box(-24, 5.5, -62, -16, 9.5, -61.6, 'white');     // dziedziniec, wysoko, daleko na zachodzie

    // przyciski czasowe i drzwi
    L.button('A', 3, -20, { timer: T_A });
    L.button('B', 6, -27.5, { y: 7, timer: T_B });
    L.button('C', -14, -54, { timer: T_C });
    L.door(['A', 'B', 'C'], 28, 0, -64, 32, 4, -62);

    // tablice
    L.sign('ZEGARY', 'trzy przyciski muszą biec naraz', 9, 2.7, 0, 1.8, -41.9, 0);
    L.sign('A: 5 s', 'przycisk na wyspie', 3.6, 1.8, 9.95, 4.4, -20, Math.PI / 2);
    L.sign('B: 7,5 s', 'przycisk na podeście', 3.6, 1.8, 9.95, 9.8, -27.5, Math.PI / 2);
    L.sign('C: 30 s', 'przycisk na dziedzińcu', 4, 2, -14, 4.4, -61.95, 0);
    L.sign('WYJŚCIE ►', 'drzwi na końcu dziedzińca', 16, 4.2, 6, 13.5, -61.95, 0);
    L.sign('DRZWI', 'zamykają się po zejściu z przycisków', 8, 2, 30, 6.5, -61.95, 0);
  },
  solve(T) {
    // 1. most na wyspę: niebieski na starcie, pomarańczowy wysoko na wyspie
    T.shoot(0, -9.6, 1.8, 4);
    T.shoot(1, -9.6, 1.8, -14);
    T.assert(T.walkThrough(0), 'nie przeszedłem na wyspę');
    T.land(8);
    // 2. na podest – stąd widać dziedziniec ponad murkiem
    T.walkTo(-7.5, -16, 6);
    T.walkTo(-7.5, -27.5, 8);
    T.walkTo(0, -25.8, 6);
    // 3. oba portale z podestu: wyjście na dziedzińcu (niebieski), wejście przy przycisku A (pomarańczowy)
    T.shoot(0, 4, 1.2, -61.6);
    T.shoot(1, 9.6, 1.2, -20);
    T.assert(T.portal(0).active && T.portal(0).pos[2] < -61 && T.portal(1).pos[0] > 9, 'portale w złych miejscach');
    // 4. ten sam portal służy najpierw jako przeprawa na dziedziniec: najdłuższy zegar (C)
    T.walkTo(6, -23.5, 4);                    // zeskok z podestu
    T.land(4);
    T.assert(T.walkThrough(1, { run: true }), 'nie wszedłem w portal przy A');
    T.walkTo(-14, -54, 10, true);
    T.wait(0.2);
    T.assert(T.buttonPressed('C'), 'przycisk C niewciśnięty');
    T.assert(T.walkThrough(0, { run: true }), 'nie wróciłem z dziedzińca');
    // 5. średni zegar (B) na podeście
    T.walkTo(-7.5, -17, 8);
    T.walkTo(-7.5, -27.5, 8);
    T.walkTo(6, -27.5, 8);
    T.wait(0.2);
    T.assert(T.buttonPressed('B'), 'przycisk B niewciśnięty');
    // 6. zeskok, najkrótszy zegar (A) i sprint przez portal do drzwi
    T.walkTo(6, -23.5, 4);
    T.land(4);
    T.walkTo(3, -20, 6);
    T.assert(T.buttonPressed('A'), 'przycisk A niewciśnięty');
    T.assert(T.walkThrough(1, { run: true }), 'nie wszedłem w portal przy przyciskach');
    T.walkTo(30, -60, 6, true);
    T.walkTo(30, -68, 6, true);
  },
};
