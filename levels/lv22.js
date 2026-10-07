import { DARK_ALL } from './util.js';

// Poziom 22 – „Przeprawa kostki”.
//
//   A  hala startowa: przepaść (kwas), za nią platforma z kostką na przycisku X; przycisk trzyma drzwi D1.
//      Biała ściana WS za przepaścią i łatka PA pod kostką to jedyne portalowalne miejsca po tej stronie
//      (start też ma tylko białą łatkę podłogi – reszta jest ciemna).
//   W1 przegroda: drzwi D1 + kurtyna F1 w jednym otworze (zachód), szyba (wschód)
//   E  komora środkowa: podest PE z przyciskiem P; przegroda przy zachodniej ścianie zasłania linię wzroku
//      D4 → D1 (inaczej z C, stojąc w D4, można by trafić w PA i pominąć cały środek)
//   W2 przegroda: okno O2 z drzwiami D3 i kurtyną F2 (D3 trzyma przycisk P na podeście PE – czyli kostka),
//      oraz drzwi służbowe D4 z kurtyną F4 (przyciski czasowe U w E i V w C – droga powrotna, nie okno).
//      Na północnej ścianie W2, wysoko, łatka H (widać ją tylko z C).
//   C  komora końcowa: przycisk Y, drzwi D2 do wyjścia (szyba z widokiem na wyjście)
//
// Zasada: kurtyna zabiera portale gracza i kostkę, ale nie zatrzymuje strzału. Kostka (nie niesiona)
// przechodzi tylko przez portal postawiony POD nią – wpada w podłogę – a oba końce portali trzeba
// postawić już po przejściu przez kurtynę. Jedyne miejsce, w które z C da się strzelić tak, by kostka
// trafiła do C, to łatka H – ale kostka leży w E, a okno O2 jest zamknięte drzwiami D3. Otwiera je
// wyłącznie kostka leżąca na przycisku P na podeście PE (gracz nie może być w dwóch miejscach naraz,
// a przejście służbowe D4 nie daje widoku na podest). Kostka musi więc: przejść A→E portalem,
// zostać przeniesiona na P, i dopiero stamtąd – przez okno, które sama trzyma otwarte – wylecieć
// portalem pod sobą na H do C.
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
const PAD_S = { x0: -6, x1: 6, z0: 14, z1: 22 };        // jedyna portalowalna podłoga na platformie startowej
const X1 = { x: -11.2, z: -1.5 };                       // przycisk X i start kostki
const PAD_A = { x0: -14, x1: -8, z0: -5, z1: 1.5 };     // łatka pod kostką (widać ją z E przez otwór)
const PAD_E = { x0: 7, x1: 13, z0: -19, z1: -13 };      // podest w E (widać go z C przez okno O2)
const P1 = { x: 10.5, z: -17.4 };                         // przycisk P na podeście: trzyma okno D3
const O1 = { x0: -12.5, x1: -9.9 };                     // otwór drzwi D1
const O2 = { x0: 4, x1: 13 };                           // okno z kurtyną F2
const O4 = { x0: -12.8, x1: -10.2 };                    // przejście służbowe D4
const Z1 = { x: -11.2, z: -9.6 };                       // przycisk ratunkowy w E, tuż za D1
const W1B = { x: -11.2, z: -3.8 };                      // przycisk powrotny w A, tuż przed D1 (gdy kostka została w E)
const U1 = { x: -11.5, z: -17.6 };                      // przycisk D4 po stronie E
const V1 = { x: -11.5, z: -24.4 };                      // przycisk D4 po stronie C
const Y = { x: 10, z: -28 };                            // przycisk Y
const D2 = { x0: -1.5, x1: 1.5 };                       // drzwi wyjścia

export default {
  name: 'Przeprawa kostki',
  hint: 'Kurtyna zabiera portale i kostkę. Zastanów się, co da się zrobić po jednej stronie, czego nie zrobisz z drugiej.',
  spawn: { x: 0, y: 0, z: 20, yaw: 0 },
  exit: { x: 9, y: 0, z: -42 },
  build(L) {
    L.room(-14, 14, -48, 24, H, DARK_ALL);

    // ---- podłogi ----
    floorWithPatches(L, -14, 14, 12, 24, [PAD_S]);              // platforma startowa (tylko łatka jest biała)
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
    L.door(['X', 'Z', 'W'], O1.x0, 0, -7, O1.x1, LINT, -6, { mode: 'any' });
    L.fizzler(O1.x0, 0, -7.7, O1.x1, LINT, -6.2);

    // ---- W2: okno O2 (drzwi D3 + kurtyna F2), przejście służbowe D4 (+ kurtyna F4), wysoka łatka H ----
    // południowa połowa ściany (od strony E)
    L.box(-14, 0, -21, O4.x0, H, -20, 'dark');
    L.box(O4.x0, LINT, -21, O4.x1, H, -20, 'dark');
    L.box(O4.x1, 0, -21, O2.x0, H, -20, 'dark');
    L.box(O2.x0, LINT, -21, O2.x1, H, -20, 'dark');
    L.box(O2.x1, 0, -21, 14, H, -20, 'dark');
    // północna połowa (od strony C)
    L.box(-14, 0, -22, O4.x0, LINT, -21, 'dark');
    L.box(O4.x1, 0, -22, O2.x0, LINT, -21, 'dark');
    L.box(O2.x0, LINT, -22, O2.x1, H, -21, 'dark');
    L.box(O2.x1, 0, -22, 14, H, -21, 'dark');
    L.box(O4.x0, LINT, -22, O4.x1, H, -21, 'dark');
    L.box(-14, LINT, -22, -12, H, -21, 'dark');
    L.box(-12, LINT, -22, -2, H, -21, 'white');                 // H
    L.box(-2, LINT, -22, O2.x0, H, -21, 'dark');
    L.door('P', O2.x0, 0, -21, O2.x1, LINT, -20);               // D3: okno otwiera kostka na przycisku P
    L.fizzler(O2.x0, 0, -21.85, O2.x1, LINT, -20.15);           // F2
    L.door(['U', 'V'], O4.x0, 0, -21, O4.x1, LINT, -20, { mode: 'any' });   // D4
    L.fizzler(O4.x0, 0, -21.85, O4.x1, LINT, -20.15);           // F4

    // ---- E: przegroda przy zachodniej ścianie – zasłania linię wzroku D4 → D1 (z C nie da się wycelować w PA) ----
    L.box(-14, 0, -14.5, -8.5, H, -13.5, 'dark');

    // ---- W3: drzwi D2 do wyjścia, szyba (widok na wyjście) ----
    L.box(-14, 0, -36, D2.x0, H, -34, 'dark');
    L.box(D2.x0, LINT, -36, D2.x1, H, -34, 'dark');
    L.box(D2.x1, 0, -36, 6, H, -34, 'dark');
    L.box(6, 0, -36, 13, 5, -34, 'glass');
    L.box(6, 5, -36, 13, H, -34, 'dark');
    L.box(13, 0, -36, 14, H, -34, 'dark');
    L.door('Y', D2.x0, 0, -36, D2.x1, LINT, -34);

    // ---- przyciski i kostka ----
    L.button('X', X1.x, X1.z, { r: 0.9 });
    L.button('Z', Z1.x, Z1.z, { r: 0.9, timer: 4 });       // ratunkowy: otwiera D1 od strony E na 4 s
    L.button('W', W1B.x, W1B.z, { r: 0.8, timer: 5 });      // ratunkowy: otwiera D1 od strony A na 5 s
    L.button('P', P1.x, P1.z, { r: 0.9 });                  // trzyma okno D3 (stoi na nim kostka)
    L.button('U', U1.x, U1.z, { r: 0.8, timer: 5 });        // przejście służbowe D4 (E → C)
    L.button('V', V1.x, V1.z, { r: 0.8, timer: 5 });        // przejście służbowe D4 (C → E)
    L.button('Y', Y.x, Y.z, { r: 1.2 });
    L.cube(X1.x, 0, X1.z);

    // ---- dekoracje: ramki otworów, filary ----
    const fr = 0.12;
    // otwór D1/F1 od strony E (ściana północna – ciemna)
    L.box(O1.x0 - 0.4, 0, -8 - fr, O1.x0, H, -8, 'door');
    L.box(O1.x1, 0, -8 - fr, O1.x1 + 0.4, H, -8, 'door');
    L.box(O1.x0, LINT, -8 - fr, O1.x1, H, -8, 'door');
    // otwór D1 od strony A – tylko zachodnia strona i nadproże (wschodnia to portalowalna biała ściana)
    L.box(O1.x0 - 0.4, 0, -6, O1.x0, H, -6 + fr, 'door');
    L.box(O1.x0, LINT, -6, O1.x1, H, -6 + fr, 'door');
    // O2 od strony E (ściana południowa W2 – ciemna) i od strony C (północna – przy otworze ciemna)
    L.box(O2.x0 - 0.4, 0, -20, O2.x0, H, -20 + fr, 'door');
    L.box(O2.x1, 0, -20, O2.x1 + 0.4, H, -20 + fr, 'door');
    L.box(O2.x0, LINT, -20, O2.x1, H, -20 + fr, 'door');
    L.box(O2.x0 - 0.4, 0, -22 - fr, O2.x0, H, -22, 'door');
    L.box(O2.x1, 0, -22 - fr, O2.x1 + 0.4, H, -22, 'door');
    L.box(O2.x0, LINT, -22 - fr, O2.x1, H, -22, 'door');
    // D4 z obu stron
    L.box(O4.x0 - 0.4, 0, -20, O4.x0, LINT, -20 + fr, 'door');
    L.box(O4.x1, 0, -20, O4.x1 + 0.4, LINT, -20 + fr, 'door');
    L.box(O4.x0, LINT - 0.4, -20, O4.x1, LINT, -20 + fr, 'door');
    L.box(O4.x0 - 0.4, 0, -22 - fr, O4.x0, LINT, -22, 'door');
    L.box(O4.x1, 0, -22 - fr, O4.x1 + 0.4, LINT, -22, 'door');
    L.box(O4.x0, LINT - 0.4, -22 - fr, O4.x1, LINT, -22, 'door');
    // drzwi wyjścia od strony C
    L.box(D2.x0 - 0.4, 0, -34, D2.x0, H, -34 + fr, 'door');
    L.box(D2.x1, 0, -34, D2.x1 + 0.4, H, -34 + fr, 'door');
    L.box(D2.x0, LINT, -34, D2.x1, H, -34 + fr, 'door');
    // filary
    for (const [x, z] of [[-11, 17], [11, 17], [12.4, -9.5], [-13.2, -29.5], [12.4, -32.5], [-12, -40], [-12, -46], [12, -46]]) {
      L.box(x - 0.7, 0, z - 0.7, x + 0.7, H, z + 0.7, 'dark');
    }

    // ---- tablice ----
    L.sign('DRZWI TRZYMA PRZYCISK', 'zdejmij kostkę – zamkną się', 5, 1.2, (O1.x0 + O1.x1) / 2, 6.6, -5.85, 0);
    L.sign('CEL: KOSTKA NA PRZYCISKU', 'czerwony przycisk leży za dwiema kurtynami', 7, 1.4, 7.7, 7.6, -5.85, 0);
    L.sign('KURTYNA', 'okno otwiera przycisk na podeście', 6, 1.1, (O2.x0 + O2.x1) / 2, 5.5, -19.85, 0);
    L.sign('KURTYNA', 'zabiera portale i kostki', 4, 1, (O2.x0 + O2.x1) / 2, 5.5, -22.15, Math.PI);
    L.sign('PRZEJŚCIE SŁUŻBOWE', 'przycisk obok otwiera drzwi na 5 s', 4.4, 1.1, -13.95, 3.4, U1.z, Math.PI / 2);
    L.sign('PRZEJŚCIE SŁUŻBOWE', 'przycisk obok otwiera drzwi na 5 s', 4.4, 1.1, -13.95, 3.4, V1.z, Math.PI / 2);
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

    // 3. z komory E: portal pod kostką (przez otwarte drzwi) i drugi na podeście PE.
    //    Kostka wylatuje z podestu i spada z powrotem do tego samego portalu – pętla PA↔PE.
    const c = T.cube(0).pos;
    T.shoot(0, c.x, 0, c.z - 0.4);
    T.walkTo(2, -13);
    T.shoot(1, 8.4, 0, -14.5);
    T.wait(1);
    T.assert(Math.abs(c.x - 8.8) < 3 && (c.z < -10 || c.z > -3), 'kostka powinna krążyć w pętli: ' + JSON.stringify(c));

    // 4. przerwanie pętli: gdy kostka jest po stronie E, przestaw pomarańczowy portal w inne miejsce podestu
    for (let i = 0; i < 400 && !(c.z < -10 && c.y > 0.3); i++) T.run(0.01, {});
    T.shoot(1, 11, 0, -14.2);
    T.wait(1.5);
    T.assert(c.z < -10 && c.y < 1, 'kostka powinna leżeć na podeście: ' + JSON.stringify(c));

    // 5. kostka na przycisk P – otwiera okno D3
    T.grab(0);
    T.walkTo(P1.x, P1.z + 1.9);
    T.face(0, 0);
    T.wait(0.8);
    T.drop();
    T.wait(1);
    T.assert(T.buttonPressed('P'), 'kostka powinna trzymać okno D3: ' + JSON.stringify(c));

    // 6. przejście przez okno z kurtyną F2 do komory C (portale znikają)
    T.walkTo(6, -15);
    T.walkTo(6, -18.7);
    T.walkTo(7, -18.7);
    T.walkTo(7, -26, 10);
    T.assert(!T.portal(0).active && !T.portal(1).active, 'kurtyna F2 powinna zabrać portale');
    T.assert(T.buttonPressed('P'), 'okno powinno być nadal otwarte');

    // 7. z C: portal na wysokiej łatce H i portal pod kostką leżącą na przycisku P (przez okno)
    T.walkTo(7, -24.5);
    T.shoot(1, -7, 7, -22);
    T.shoot(0, c.x, 0, c.z - 0.4);
    T.wait(3);
    T.assert(c.z < -22 && c.y < 1, 'kostka powinna być w C: ' + JSON.stringify(c));

    // 8. kostka na przycisk Y, wyjście
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
