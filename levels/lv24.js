import { DARK_ALL } from './util.js';

// Poziom 24 – „Odwrócone drzwi”
//
// Jedna długa hala, trzy szklane przegrody, trzy drzwi – wszystko widać z miejsca startu:
//
//   S  hala startowa (z 26 … 6,8):      spawn, kostka K1, szklana kabina z przyciskiem A
//   D1 drzwi S|M – otwarte, gdy wciśnięty A LUB B                       (mode any)
//   M  środkowa hala (z 4,4 … -13):     kostka K2, przycisk B (duży), nad nim biała łata sufitowa MC
//   D2 drzwi M|E – otwarte, gdy NIE wciśnięty ani A, ani B              (any + invert)
//   E  hala wyjściowa (z -15,4 … -29,6): przycisk C, biała łata EF w podłodze (za płotkiem)
//   D3 drzwi E|X – otwarte, gdy wciśnięte B ORAZ C                      (all)
//   X  komora z zielonym polem wyjścia
//
// D1 i D2 reagują na te same przyciski, ale odwrotnie – nigdy nie są otwarte naraz. Przycisk potrafi
// trzymać kostka, więc: kostka na A wpuszcza do M, ale blokuje D2; żeby ją zabrać, ktoś inny musi
// przytrzymać D1 przyciskiem B; a B z kolei zamyka D2 – więc do wyjścia (B i C naraz) kostkę na B
// trzeba dostarczyć już z drugiej strony drzwi: portal EF (podłoga E) + MC (sufit nad B) to „zsyp”.
//
// Portalowalne są tylko dwie bryły: MC (sufit nad B, widać z M i przez kratkę z głębi E) oraz EF (podłoga E).
// Pozostałe powierzchnie są ciemne. Przegrody to szkło (blokuje strzał i rzut), nad szkłem w M|E kratka.
//
// Łata EF jest duża (6×6 m) celowo: gracz wskakujący w otwór przy krawędzi łaty jest wypychany na łatę, nie w pustkę
// (silnik liczy otwór z tolerancją, więc przy małej łacie zdarzały się upadki i śmierć). Płotek ma prześwit od wschodu.
// Łata MC jest cienką płytą tuż pod sufitem: kostka rzucona w górę nie dosięga płaszczyzny portalu (środek ≤ 6,6 < 6,8).
//
// Rozwiązanie (≥ 19 odrębnych czynności) – patrz solve().
const H = 7;                // wysokość hali
const DOOR_H = 2.3;         // wysokość drzwi – niska, żeby kostka zaklinowana w otworze nie dała się przejść górą
const HALF = 0.75;          // połowa szerokości otworu drzwi (1,5 m)
const PIER = 1.2;           // połowa grubości filarów (śluza): dwoje drzwi w jednym otworze, 1,5 m od siebie
const DGAP = 0.75;          // odległość każdych drzwi od osi przegrody
const GRATE_Y = 3.0;        // powyżej – kratka w przegrodzie M|E (strzał z E w łatę MC)

const MC = { x0: 10.8, x1: 13.2, z0: -5.2, z1: -2.8 };                      // łata sufitowa nad B
const EF = { x0: -13, x1: -6, z0: -29.5, z1: -22.5 };                           // łata podłogowa w E (wlot zsypu) – duża, żeby gracz wskakujący w otwór był wypychany na łatę, nie w pustkę
const MC_Y = H - 0.2;                                                         // spód łaty MC (cienka płyta tuż pod sufitem: kostka rzucona w górę nie dosięgnie płaszczyzny portalu)

export default {
  name: 'Odwrócone drzwi',
  hint: 'Jedne drzwi otwiera to samo, co drugie zamyka, a kostka potrafi przytrzymać przycisk za Ciebie.',
  spawn: { x: 0, y: 0, z: 24, yaw: 0 },
  exit: { x: 3.5, y: 0, z: -36 },
  build(L) {
    L.room(-16, 16, -42, 26, H, DARK_ALL);

    // ---- podłoga: ciemna; jedyny portalowalny kawałek to łata EF w hali E, otoczona niskim płotkiem ----
    L.floor(-16, 16, EF.z1, 26, 'dark');
    L.floor(-16, 16, -42, EF.z0, 'dark');
    L.floor(-16, EF.x0, EF.z0, EF.z1, 'dark');
    L.floor(EF.x1, 16, EF.z0, EF.z1, 'dark');
    L.floor(EF.x0, EF.x1, EF.z0, EF.z1, 'floor');
    // Wewnętrzna ramka z kratki (h 0,95 m): portal musi się zmieścić w jej środku, więc nigdy nie stanie przy krawędzi łaty
    // (tuż przy krawędzi wpadnięcie w otwór bywało wypychane bokiem w ciemną podłogę). Prześwit od wschodu – wejście w otwór.
    const RI = 1.25, RT = 0.3, RH = 0.95;
    const rx0 = EF.x0 + RI, rx1 = EF.x1 - RI, rz0 = EF.z0 + RI, rz1 = EF.z1 - RI;
    const cz = (EF.z0 + EF.z1) / 2;
    L.box(rx0, 0, rz0, rx1, RH, rz0 + RT, 'grate');
    L.box(rx0, 0, rz1 - RT, rx1, RH, rz1, 'grate');
    L.box(rx0, 0, rz0 + RT, rx0 + RT, RH, rz1 - RT, 'grate');
    L.box(rx1 - RT, 0, rz0 + RT, rx1, RH, cz - 0.8, 'grate');
    L.box(rx1 - RT, 0, cz + 0.8, rx1, RH, rz1 - RT, 'grate');

    // ---- łata na suficie nad B ----
    L.box(MC.x0, MC_Y, MC.z0, MC.x1, H, MC.z1, 'white');

    // ---- przegrody: filary, nadproże, drzwi ----
    // śluza: dwoje drzwi (te same przyciski) w odstępie 1,5 m – kostka zaklinowana w jednych nie utrzyma drugich
    const gate = (zc, dx, ids, opt, xFrom, xTo) => {
      const z0 = zc - PIER, z1 = zc + PIER;
      L.box(xFrom, 0, z0, dx - HALF, H, z1, 'dark');
      L.box(dx + HALF, 0, z0, xTo, H, z1, 'dark');
      L.box(dx - HALF, DOOR_H, z0, dx + HALF, H, z1, 'dark');
      L.door(ids, dx - HALF, 0, zc - DGAP - 0.2, dx + HALF, DOOR_H, zc - DGAP + 0.2, opt);
      L.door(ids, dx - HALF, 0, zc + DGAP - 0.2, dx + HALF, DOOR_H, zc + DGAP + 0.2, opt);
    };
    // P1: S|M (szkło na całą wysokość)
    gate(5.6, -12, ['A', 'B'], { mode: 'any' }, -16, -9);
    L.box(-9, 0, 5.4, 16, H, 5.8, 'glass');
    // P2: M|E (szkło do GRATE_Y, wyżej kratka)
    gate(-14.2, -12, ['A', 'B'], { mode: 'any', invert: true }, -16, -9);
    L.box(-9, 0, -14.4, 16, GRATE_Y, -14.0, 'glass');
    L.box(-9, GRATE_Y, -14.35, 16, H, -14.05, 'grate');
    // P3: E|X – szklana ściana z drzwiami (zielone pole widać z całej hali)
    const D3X = -4;
    L.box(-8, 0, -30.4, D3X - HALF, H, -30.0, 'glass');
    L.box(D3X + HALF, 0, -30.4, 8, H, -30.0, 'glass');
    L.box(D3X - HALF, DOOR_H, -30.4, D3X + HALF, H, -30.0, 'glass');
    L.door(['B', 'C'], D3X - HALF, 0, -30.4, D3X + HALF, DOOR_H, -30.0, { mode: 'all' });
    L.box(-16, 0, -42, -8, H, -29.6, 'dark');
    L.box(8, 0, -42, 16, H, -29.6, 'dark');

    // ---- ramki z pasów ostrzegawczych wokół drzwi (tylko ozdoba, poza otworem) ----
    const frame = (zFace, dir, dx) => {
      const z0 = dir > 0 ? zFace : zFace - 0.1, z1 = dir > 0 ? zFace + 0.1 : zFace;
      L.box(dx - HALF - 0.22, 0, z0, dx - HALF, DOOR_H + 0.22, z1, 'door');
      L.box(dx + HALF, 0, z0, dx + HALF + 0.22, DOOR_H + 0.22, z1, 'door');
      L.box(dx - HALF, DOOR_H, z0, dx + HALF, DOOR_H + 0.22, z1, 'door');
    };
    frame(5.6 + PIER, +1, -12); frame(5.6 - PIER, -1, -12);
    frame(-14.2 + PIER, +1, -12); frame(-14.2 - PIER, -1, -12);
    frame(-30.0, +1, D3X); frame(-30.4, -1, D3X);
    // cokoły przy szklanych przegrodach (żeby szkło było widoczne)
    L.box(-9, 0, 5.6 - PIER, 16, 0.3, 5.6 + PIER, 'door');
    L.box(-9, 0, -14.2 - PIER, 16, 0.3, -14.2 + PIER, 'door');

    // ---- kabina A (szklana ściana zachodnia i północna, otwarta na południe) ----
    L.box(7.7, 0, 12.4, 8.1, H, 21, 'glass');
    L.box(7.7, 0, 12.0, 16, H, 12.4, 'glass');

    // ---- kabina B (szklana ściana zachodnia i południowa, otwarta na północ – jak A): nie da się trafić kostką w B z daleka ----
    L.box(7.6, 0, -9.0, 8.0, H, 0.4, 'glass');
    L.box(7.6, 0, -9.4, 16, H, -9.0, 'glass');

    // ---- przyciski i kostki ----
    L.button('A', 12, 17);
    L.button('B', 12, -4, { r: 1.8 });
    L.button('C', 10, -20, { r: 1.3 });
    L.cube(-3, 0, 19);     // K1 (S)
    L.cube(-4, 0, -1);     // K2 (M)

    // ---- tablice ----
    const PI = Math.PI;
    L.sign('A LUB B', 'otwarte, gdy wciśnięty A albo B', 3.4, 1.1, -12, 4.2, 5.6 + PIER + 0.02, 0);
    L.sign('A LUB B', 'otwarte, gdy wciśnięty A albo B', 3.4, 1.1, -12, 4.2, 5.6 - PIER - 0.02, PI);
    L.sign('ANI A, ANI B', 'otwarte, gdy oba puste', 3.4, 1.1, -12, 4.2, -14.2 + PIER + 0.02, 0);
    L.sign('ANI A, ANI B', 'otwarte, gdy oba puste', 3.4, 1.1, -12, 4.2, -14.2 - PIER - 0.02, PI);
    L.sign('B ORAZ C', 'otwarte, gdy oba wciśnięte', 3.4, 1.1, D3X, 3.9, -29.95, 0);
    L.sign('WYJŚCIE', null, 8, 2.2, 3.5, 4.0, -41.95, 0);
    L.sign('A', 'przycisk', 2.2, 1.1, 15.95, 2.2, 17, PI / 2);
    L.sign('B', 'przycisk', 2.2, 1.1, 15.95, 2.2, -4, PI / 2);
    L.sign('C', 'przycisk', 2.2, 1.1, 15.95, 2.2, -20, PI / 2);
  },
  solve(T) {
    const g = T.game;
    const W = Math.PI / 2;                                  // patrzenie na zachód (yaw)
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
    T.walkTo(6, 1.5, 25);
    T.walkTo(12, 1.5, 10);
    T.walkTo(12, -2.1, 5);
    T.face(0, 0); T.wait(0.6);
    T.drop(); T.wait(1.3);
    T.assert(T.buttonPressed('B'), 'B niewciśnięty');
    // niebieski portal na łatę MC (sufit nad B) – stąd widać ją z góry, prawie na wprost
    T.shoot(0, 12, MC_Y, -4);
    // --- 3. z powrotem do S po K1 (D1 trzyma teraz B), K1 do M ---
    T.walkTo(12, 1.5, 5);
    T.walkTo(-12, 3, 25);
    T.walkTo(-12, 10, 10);
    T.walkTo(11, 23.2, 25);
    T.grab(0);
    T.walkTo(11, 23.2, 25);
    T.walkTo(-12, 11, 25);
    T.assert(g.doors[0].box.disabled && g.doors[1].box.disabled, 'D1 powinny być otwarte (B)');
    T.walkTo(-12, 1.0, 10);
    T.walkTo(-8, 0, 10);
    T.face(0, 0); T.wait(0.5);
    T.drop(); T.wait(1.0);
    // --- 4. K2 z B zdjąć: A i B puste -> D2 otwarte; K2 do E na przycisk C ---
    T.walkTo(-8, 0, 10);
    T.walkTo(6, 1.5, 10);
    T.walkTo(11, 1.2, 10);
    T.grab(1);
    T.walkTo(11, 1.5, 10);
    T.walkTo(-12, -6, 25);
    T.walkTo(-12, -9, 5);
    T.assert(g.doors[2].box.disabled && g.doors[3].box.disabled, 'D2 powinny być otwarte');
    T.walkTo(-12, -20, 10);
    T.walkTo(8, -20, 25);
    T.face(-W, 0); T.wait(0.6);
    T.drop(); T.wait(1.3);
    T.assert(T.buttonPressed('C'), 'C niewciśnięty');
    // --- 5. po K1 do M i z powrotem ---
    T.walkTo(-12, -20, 25);
    T.walkTo(-12, -9, 10);
    T.walkTo(-12, -4, 10);
    T.grab(0);
    T.walkTo(-12, -9, 10);
    T.walkTo(-12, -20, 10);
    // --- 6. pomarańczowy portal na łatę EF (strzał ponad płotkiem, z bliska) i wrzucenie K1: spada z sufitu na B ---
    T.walkTo(-4.6, -21, 25);
    T.walkTo(-4.6, -26, 10);
    T.walkTo(-7.0, -26, 10);
    T.shoot(1, -9.5, 0, -26);
    const o = T.portal(1).pos;
    T.creep(o[0] + 2.2, o[2]);
    T.face(W, 0); T.wait(0.6);
    T.drop(); T.wait(2.0);
    T.assert(T.buttonPressed('B') && T.buttonPressed('C'), 'B i C powinny być wciśnięte');
    // --- 7. wyjście przez D3 ---
    T.walkTo(-4, -26, 25);
    T.walkTo(-4, -34, 15);
    T.walkTo(3.5, -36, 15);
  },
};
