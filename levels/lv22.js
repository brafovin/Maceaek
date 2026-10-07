import { DARK_ALL } from './util.js';

// Poziom 22 – „Przeprawa kostki”.
//
//   A  hala startowa: przepaść (kwas), za nią platforma z kostką na przycisku X; przycisk trzyma drzwi D1.
//      Biała ściana WS za przepaścią i łatka PA pod kostką to jedyne portalowalne miejsca po tej stronie.
//   W1 przegroda: drzwi D1 + kurtyna F1 w jednym otworze (zachód), szyba (wschód)
//   E  komora środkowa: podest PE na podłodze i łatka CE na suficie (widać je tylko z E)
//   W2 przegroda: otwór O2 z kurtyną F2; na jej północnej ścianie, wysoko, łatka H (widać ją tylko z C)
//   C  komora końcowa: przycisk Y, drzwi D2 do wyjścia (szyba z widokiem na wyjście)
//
// Zasada: kurtyna zabiera portale gracza i kostkę, ale nie zatrzymuje strzału. Kostka (nie niesiona)
// przechodzi tylko przez portal postawiony POD nią – wpada w podłogę – a oba końce portali trzeba
// postawić już po przejściu przez kurtynę. Strzelać można tylko w to, co widać z miejsca, w którym
// się stoi, a łatki w E i C są tak ustawione, że z poprzedniej komory ich nie widać (sprawdzone
// próbkowaniem promieni z całej objętości sąsiedniej komory, także ze „spojrzeń” przez portale).
// Dlatego kostka jedzie dwoma skokami: A→E (sufit CE) i E→C (wysoka łatka H), a między nimi trzeba ją
// ręcznie przenieść na podest PE – jedyne miejsce w E widoczne z C.
const H = 10;          // wysokość hali
const LINT = 4.2;      // dolna krawędź nadproży (drzwi, kurtyny)

// podłoga z prostokątnymi łatkami portalowalnymi na ciemnym tle (łatki nie nakładają się, leżą w środku)
function floorWithPatches(L, x0, x1, z0, z1, patches) {
  const xs = [...new Set([x0, x1, ...patches.flatMap(p => [p.x0, p.x1])])].sort((a, b) => a - b);
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i], b = xs[i + 1];
    const cover = patches.filter(p => p.x0 <= a && p.x1 >= b).sort((p, q) => p.z0 - q.z0);
    let z = z0;
    for (const p of cover) {
      if (p.z0 > z) L.floor(a, b, z, p.z0, 'dark');
      L.floor(a, b, p.z0, p.z1, 'floor');
      z = p.z1;
    }
    if (z < z1) L.floor(a, b, z, z1, 'dark');
  }
}

// współrzędne ważnych miejsc (używane też w solve)
const X1 = { x: -11.2, z: -1.5 };                       // przycisk X i start kostki
const PAD_A = { x0: -14, x1: -8, z0: -5, z1: 1.5 };     // łatka pod kostką (widać ją z E przez otwór)
const PAD_E = { x0: 7, x1: 13, z0: -19, z1: -13 };      // podest w E (widać go z C przez otwór O2)
const CE = { x0: 0, x1: 4, z0: -13, z1: -9.5 };         // łatka na suficie E, blisko przegrody W1
const O1 = { x0: -12.5, x1: -9.9 };                     // otwór drzwi D1
const O2 = { x0: 4, x1: 13 };                           // otwór kurtyny F2
const Y = { x: 10, z: -28 };                            // przycisk Y
const D2 = { x0: -1.5, x1: 1.5 };                       // drzwi wyjścia

export default {
  name: 'Przeprawa kostki',
  hint: 'Kurtyna zabiera portale i kostkę, ale strzał przez nią przelatuje. Zastanów się, co da się zrobić po jednej stronie, czego nie zrobisz z drugiej.',
  spawn: { x: 0, y: 0, z: 20, yaw: 0 },
  exit: { x: 9, y: 0, z: -42 },
  build(L) {
    L.room(-14, 14, -48, 24, H, DARK_ALL);

    // ---- podłogi ----
    L.floor(-14, 14, 12, 24, 'floor');                         // platforma startowa
    L.pit(-14, 14, 3, 12);                                      // przepaść 9 m
    floorWithPatches(L, -14, 14, -6, 3, [PAD_A]);               // platforma przy drzwiach
    floorWithPatches(L, -14, 14, -48, -6, [PAD_E]);             // E, C i wyjście

    // ---- W1: drzwi D1 + kurtyna F1 (zachód), biała ściana WS, szyba (wschód) ----
    L.box(-14, 0, -8, O1.x0, H, -6, 'dark');
    L.box(O1.x0, LINT, -8, O1.x1, H, -6, 'dark');
    L.box(O1.x1, 0, -8, 2.5, H, -7, 'dark');
    L.box(O1.x1, 0, -7, 2.5, H, -6, 'white');                   // WS: wyjście portalu przy przeprawie przez przepaść
    L.box(2.5, 0, -8, 13, 5, -6, 'glass');
    L.box(2.5, 5, -8, 13, H, -6, 'dark');
    L.box(13, 0, -8, 14, H, -6, 'dark');
    L.door('X', O1.x0, 0, -7, O1.x1, LINT, -6);
    L.fizzler(O1.x0, 0, -7.55, O1.x1, LINT, -7.45);

    // ---- W2: otwór O2 z kurtyną F2; wysoka łatka H na północnej ścianie ----
    L.box(-14, 0, -21, O2.x0, H, -20, 'dark');
    L.box(O2.x0, LINT, -22, O2.x1, H, -20, 'dark');
    L.box(O2.x1, 0, -22, 14, H, -20, 'dark');
    L.box(-14, 0, -22, O2.x0, LINT, -21, 'dark');
    L.box(-14, LINT, -22, -12, H, -21, 'dark');
    L.box(-12, LINT, -22, -2, H, -21, 'white');                 // H
    L.box(-2, LINT, -22, O2.x0, H, -21, 'dark');
    L.fizzler(O2.x0, 0, -21.05, O2.x1, LINT, -20.95);

    // ---- W3: drzwi D2 do wyjścia, szyba (widok na wyjście) ----
    L.box(-14, 0, -36, D2.x0, H, -34, 'dark');
    L.box(D2.x0, LINT, -36, D2.x1, H, -34, 'dark');
    L.box(D2.x1, 0, -36, 6, H, -34, 'dark');
    L.box(6, 0, -36, 13, 5, -34, 'glass');
    L.box(6, 5, -36, 13, H, -34, 'dark');
    L.box(13, 0, -36, 14, H, -34, 'dark');
    L.door('Y', D2.x0, 0, -36, D2.x1, LINT, -34);

    // ---- E: łatka na suficie ----
    L.box(CE.x0, H - 0.5, CE.z0, CE.x1, H, CE.z1, 'white');

    // ---- przyciski i kostka ----
    L.button('X', X1.x, X1.z, { r: 0.9 });
    L.button('Y', Y.x, Y.z, { r: 1.2 });
    L.cube(X1.x, 0, X1.z);

    // ---- dekoracje: ramki otworów, pasy ostrzegawcze przed kurtynami, filary ----
    const fr = 0.12;
    // otwór D1/F1 od strony E (ściana północna – ciemna)
    L.box(O1.x0 - 0.4, 0, -8 - fr, O1.x0, LINT + 0.5, -8, 'door');
    L.box(O1.x1, 0, -8 - fr, O1.x1 + 0.4, LINT + 0.5, -8, 'door');
    L.box(O1.x0, LINT, -8 - fr, O1.x1, LINT + 0.5, -8, 'door');
    // otwór D1 od strony A – tylko zachodnia strona i nadproże (wschodnia to portalowalna biała ściana)
    L.box(O1.x0 - 0.4, 0, -6, O1.x0, LINT + 0.5, -6 + fr, 'door');
    L.box(O1.x0, LINT, -6, O1.x1, LINT + 0.5, -6 + fr, 'door');
    // O2 od strony E (ściana południowa W2 – ciemna) i od strony C (północna – przy otworze ciemna)
    L.box(O2.x0 - 0.4, 0, -20, O2.x0, LINT + 0.5, -20 + fr, 'door');
    L.box(O2.x1, 0, -20, O2.x1 + 0.4, LINT + 0.5, -20 + fr, 'door');
    L.box(O2.x0, LINT, -20, O2.x1, LINT + 0.5, -20 + fr, 'door');
    L.box(O2.x0 - 0.4, 0, -22 - fr, O2.x0, LINT + 0.5, -22, 'door');
    L.box(O2.x1, 0, -22 - fr, O2.x1 + 0.4, LINT + 0.5, -22, 'door');
    L.box(O2.x0, LINT, -22 - fr, O2.x1, LINT + 0.5, -22, 'door');
    // drzwi wyjścia od strony C
    L.box(D2.x0 - 0.4, 0, -34, D2.x0, LINT + 0.5, -34 + fr, 'door');
    L.box(D2.x1, 0, -34, D2.x1 + 0.4, LINT + 0.5, -34 + fr, 'door');
    L.box(D2.x0, LINT, -34, D2.x1, LINT + 0.5, -34 + fr, 'door');
    // pasy ostrzegawcze na podłodze przed kurtynami (ciemna podłoga, niski stopień)
    L.box(O1.x0, 0, -9.2, O1.x1, 0.03, -8.6, 'door');
    L.box(O2.x0, 0, -19.9, O2.x1, 0.03, -19.3, 'door');
    L.box(O2.x0, 0, -22.7, O2.x1, 0.03, -22.1, 'door');
    // filary
    for (const [x, z] of [[-11, 17], [11, 17], [-12.2, -17], [12.4, -9.5], [-12.2, -27], [12.4, -32.5], [-12, -40], [-12, -46], [12, -46]]) {
      L.box(x - 0.7, 0, z - 0.7, x + 0.7, H, z + 0.7, 'dark');
    }

    // ---- tablice ----
    L.sign('DRZWI TRZYMA PRZYCISK', 'zdejmij kostkę – zamkną się', 5, 1.2, (O1.x0 + O1.x1) / 2, 6.6, -5.85, 0);
    L.sign('CEL: KOSTKA NA PRZYCISKU', 'czerwony przycisk leży za dwiema kurtynami', 7, 1.4, 7.7, 7.6, -5.85, 0);
    L.sign('KURTYNA', 'zabiera portale i kostki', 4, 1, (O2.x0 + O2.x1) / 2, 6.6, -19.85, 0);
    L.sign('WYJŚCIE', 'kostka na przycisku otwiera drzwi', 5, 1.1, 0, 6.6, -33.85, 0);
  },
  solve(T) {
    const pl = T.game.player;
    const mid = (a, b) => (a + b) / 2;

    // 1. przeprawa przez przepaść: wyjście na białej ścianie za przepaścią, wejście pod nogami
    T.shoot(1, -4, 2.5, -6);
    T.shoot(0, 0, 0, 16.5);
    T.walkTo(0, 18.5); T.face(0, 0);
    T.walkThrough(0);
    T.land(10);
    T.wait(0.5);
    T.assert(pl.pos.z < 3 && pl.onGround, 'powinienem stać za przepaścią: ' + JSON.stringify(T.st()));

    // 2. przejście przez drzwi (kostka trzyma przycisk) i kurtynę F1 – portale znikają
    T.walkTo(-3, -4.5);
    T.walkTo(mid(O1.x0, O1.x1), -4.5);
    T.walkTo(mid(O1.x0, O1.x1), -11, 10);
    T.assert(!T.portal(0).active && !T.portal(1).active, 'kurtyna powinna zabrać portale');
    T.assert(T.buttonPressed('X'), 'kostka powinna trzymać drzwi');

    // 3. z komory E: portal pod kostką (przez otwarte drzwi) i portal na suficie
    const c = T.cube(0).pos;
    T.shoot(0, c.x, 0, c.z - 0.4);
    T.shoot(1, mid(CE.x0, CE.x1), H, mid(CE.z0, CE.z1));
    T.wait(3);
    T.assert(c.x > CE.x0 - 3 && c.x < CE.x1 + 3 && c.z > CE.z0 - 3 && c.z < CE.z1 + 3 && c.y < 1, 'kostka powinna wylądować pod łatką sufitową: ' + JSON.stringify(c));

    // 4. kostka na podest PE, potem przez kurtynę F2 do C (portale znikają)
    T.grab(0);
    const pz = mid(PAD_E.z0, PAD_E.z1);
    T.walkTo(mid(PAD_E.x0, PAD_E.x1), pz + 1.9);
    T.face(0, 0);
    T.wait(0.8);
    T.drop();
    T.wait(1);
    T.assert(c.x > PAD_E.x0 + 1 && c.x < PAD_E.x1 - 1 && c.z > PAD_E.z0 + 1 && c.z < PAD_E.z1 - 1 && c.y < 1, 'kostka powinna leżeć na podeście: ' + JSON.stringify(c));
    T.walkTo(5.5, -13);
    T.walkTo(5.5, -18.7);
    T.walkTo(8, -18.7);
    T.walkTo(8, -26, 10);
    T.assert(!T.portal(0).active && !T.portal(1).active, 'kurtyna F2 powinna zabrać portale');

    // 5. z C: portal pod kostką leżącą na podeście i portal na wysokiej łatce H
    T.walkTo(7, -24.5);
    T.shoot(0, c.x, 0, c.z - 0.4);
    T.walkTo(-2, -27);
    T.shoot(1, -7, 7, -22);
    T.wait(3);
    T.assert(c.z < -22 && c.y < 1, 'kostka powinna być w C: ' + JSON.stringify(c));

    // 6. kostka na przycisk Y, wyjście
    T.grab(0);
    T.walkTo(Y.x, Y.z + 1.9); T.face(0, 0);
    T.wait(0.8);
    T.drop();
    T.wait(1.2);
    T.assert(T.buttonPressed('Y'), 'przycisk Y niewciśnięty');
    T.walkTo(0, -31);
    T.walkTo(0, -39);
    T.walkTo(9, -42);
  },
};
