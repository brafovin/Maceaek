import { DARK_ALL } from './util.js';

// Poziom 24 – „Odwrócone drzwi”
//
// Jedna długa hala, trzy szklane przegrody, trzy drzwi (wszystko widać z miejsca startu):
//
//   S  hala startowa (z 26 … 6):    spawn, kostka K1, szklana kabina z przyciskiem A
//   D1 drzwi S|M  – otwarte, gdy wciśnięty A LUB B                 (mode any)
//   M  środkowa hala (z 5 … -13.6): kostka K2, przycisk B, nad nim biała łata na suficie (MC)
//   D2 drzwi M|E  – otwarte, gdy NIE wciśnięty ani A, ani B        (any + invert)
//   E  hala wyjściowa (z -14.8 … -29.6): przycisk C, biała łata w podłodze (EF)
//   D3 drzwi E|X  – otwarte, gdy wciśnięte B ORAZ C                (all)
//   X  komora z zielonym polem wyjścia
//
// Zasady: D1 i D2 reagują na te same przyciski, ale odwrotnie – nigdy nie są otwarte naraz.
// Jedyne portalowalne miejsca w całej hali: łata MC (sufit nad B) i łata EF (podłoga w E).
// MC widać z M oraz przez kratkę w przegrodzie M|E (z głębi E), EF tylko z E. Portal w EF + portal w MC
// = „zsyp”: kostka wrzucona w podłogę E spada na przycisk B w M (z góry), gracz też może tamtędy wrócić.
const H = 7;                // wysokość hali
const DOOR_H = 2.3;         // wysokość drzwi (niska, żeby nie dało się przejść górą po kostce zaklinowanej w otworze)
const HALF = 0.65;          // połowa szerokości otworu drzwi
const PW = 0.6;             // połowa grubości filarów przy drzwiach
const GRATE_Y = 3.0;        // powyżej – kratka w przegrodzie M|E (strzał z E w łatę MC)

const MC = { x0: 10.8, x1: 13.2, z0: -5.2, z1: -2.8 };     // łata sufitowa nad B
const PW = { x0: -16, x1: -15, z0: -28.4, z1: -21.6, y1: 4.6 };   // łata ścienna w E (wlot zsypu)

export default {
  name: 'Odwrócone drzwi',
  hint: 'Jedne drzwi otwiera to samo, co drugie zamyka. Kostka potrafi trzymać przycisk, ale do niektórych przycisków nie da się podejść – a wrzucić coś można też z góry.',
  spawn: { x: 0, y: 0, z: 24, yaw: 0 },
  exit: { x: 0, y: 0, z: -36 },
  build(L) {
    L.room(-16, 16, -42, 26, H, DARK_ALL);

    // ---- podłoga: cała ciemna (nie przyjmuje portali) ----
    L.floor(-16, 16, -42, 26, 'dark');

    // ---- łata PW: biały pas na zachodniej ścianie hali E (wlot zsypu) ----
    L.box(PW.x0, 0, PW.z0, PW.x1, PW.y1, PW.z1, 'white');

    // ---- przegrody: filary, nadproże, drzwi ----
    const gate = (zc, dx, ids, opt, xFrom, xTo) => {
      const z0 = zc - PW, z1 = zc + PW;
      L.box(xFrom, 0, z0, dx - HALF, H, z1, 'dark');
      L.box(dx + HALF, 0, z0, xTo, H, z1, 'dark');
      L.box(dx - HALF, DOOR_H, z0, dx + HALF, H, z1, 'dark');
      return L.door(ids, dx - HALF, 0, zc - 0.2, dx + HALF, DOOR_H, zc + 0.2, opt);
    };
    // P1: S|M  (szkło całą wysokość)
    gate(5.6, -12, ['A', 'B'], { mode: 'any' }, -16, -9);
    L.box(-9, 0, 5.4, 16, H, 5.8, 'glass');
    // P2: M|E  (szkło do GRATE_Y, wyżej kratka)
    gate(-14.2, -12, ['A', 'B'], { mode: 'any', invert: true }, -16, -9);
    L.box(-9, 0, -14.4, 16, GRATE_Y, -14.0, 'glass');
    L.box(-9, GRATE_Y, -14.35, 16, H, -14.05, 'grate');
    // P3: E|X  (szkło po bokach drzwi, ściany boczne komory X)
    gate(-30.2, 0, ['B', 'C'], { mode: 'all' }, -3.3, 3.3);
    L.box(-8, 0, -30.4, -3.3, H, -30.0, 'glass');
    L.box(3.3, 0, -30.4, 8, H, -30.0, 'glass');
    L.box(-16, 0, -42, -8, H, -29.6, 'dark');
    L.box(8, 0, -42, 16, H, -29.6, 'dark');

    // ---- kabina A (szklana ściana zachodnia i północna, otwarta na południe) ----
    L.box(7.7, 0, 12.4, 8.1, H, 21, 'glass');
    L.box(7.7, 0, 12.0, 16, H, 12.4, 'glass');

    // ---- łata na suficie nad B ----
    L.box(MC.x0, H - 0.4, MC.z0, MC.x1, H, MC.z1, 'white');

    // ---- przyciski i kostki ----
    L.button('A', 12, 17);
    L.button('B', 12, -4, { r: 1.8 });
    L.button('C', 10, -20, { r: 1.3 });
    L.cube(-3, 0, 19);     // K1 (S)
    L.cube(-4, 0, -1);     // K2 (M)
  },
  solve(T) {
    const g = T.game;
    const W = Math.PI / 2;                                  // patrzenie na zachód
    // --- 1. K1 na przycisk A (kabina): D1 się otwiera ---
    T.grab(0);
    T.walkTo(10, 23.2, 20);
    T.walkTo(12, 18.9, 8);
    T.face(0, 0); T.wait(0.6);
    T.drop(); T.wait(1.2);
    T.assert(T.buttonPressed('A'), 'A niewciśnięty');
    // --- 2. do M, K2 na przycisk B ---
    T.walkTo(11, 23.2, 8);
    T.walkTo(-12, 11, 25);
    T.walkTo(-12, 2, 10);
    T.grab(1);
    T.walkTo(12, -0.5, 25);
    T.walkTo(12, -2.1, 5);
    T.face(0, 0); T.wait(0.6);
    T.drop(); T.wait(1.3);
    T.assert(T.buttonPressed('B'), 'B niewciśnięty');
    // --- 3. z powrotem do S po K1 (D1 trzyma teraz B) ---
    T.walkTo(-12, 3, 25);
    T.walkTo(-12, 10, 10);
    T.walkTo(11, 23.2, 25);
    T.grab(0);
    T.walkTo(11, 23.2, 25);
    T.walkTo(-12, 11, 25);
    T.assert(g.doors[0].box.disabled, 'D1 powinny być otwarte (B)');
    T.walkTo(-12, 1.0, 10);
    T.walkTo(-8, 0, 10);
    T.face(0, 0); T.wait(0.5);
    T.drop(); T.wait(1.0);
    // --- 4. niebieski portal na łatę MC (sufit nad B) ---
    T.shoot(0, 12, 6.6, -4);
    // --- 5. K2 z B zdjąć: A i B puste -> D2 otwarte; K2 do E na przycisk C ---
    T.grab(1);
    T.walkTo(11, -6, 10);
    T.walkTo(-12, -6, 25);
    T.walkTo(-12, -9, 5);
    T.assert(g.doors[1].box.disabled, 'D2 powinny być otwarte');
    T.walkTo(-12, -20, 10);
    T.walkTo(8, -20, 25);
    T.face(-W, 0); T.wait(0.6);
    T.drop(); T.wait(1.3);
    T.assert(T.buttonPressed('C'), 'C niewciśnięty');
    // --- 6. pomarańczowy portal na łatę EF ---
    T.shoot(1, -9, 0, -26);
    // --- 7. po K1 do M i z powrotem ---
    T.walkTo(-12, -20, 25);
    T.walkTo(-12, -9, 10);
    T.walkTo(-12, -4, 10);
    T.grab(0);
    T.walkTo(-12, -9, 10);
    T.walkTo(-12, -20, 10);
    // --- 8. wrzucić K1 w EF: spada na B ---
    const o = T.portal(1).pos;
    T.walkTo(-6, -21, 25);
    T.walkTo(o[0] + 2.2, o[2], 10);
    T.face(W, 0); T.wait(0.6);
    T.drop(); T.wait(2.0);
    T.assert(T.buttonPressed('B') && T.buttonPressed('C'), 'B i C powinny być wciśnięte');
    // --- 9. wyjście przez D3 ---
    T.walkTo(0, -26, 25);
    T.walkTo(0, -36, 15);
  },
};
