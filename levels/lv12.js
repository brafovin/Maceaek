import { DARK_ALL } from './util.js';

// Poziom 12 – „Dwa przyciski”
//
// Układ (oś z: start przy +z, wyjście przy -z):
//   z =  22 … -2   podest startowy S: przycisk A (x=9, z=7), biała ściana po lewej (x=-11)
//   z = -2 … -14   przepaść z kwasem (12 m – nie do przeskoczenia)
//   z = -14 … -29  wyspa: kostka leży na przycisku B tuż przed drzwiami (z=-28.25),
//                  szklana ściana (widać wyjście), nad nią wysoko biały pas (jedyna biała
//                  ściana widoczna ze startu), filar, którego biała ściana patrzy od strony S (ukryta)
//   z = -30 … -36  komora z wyjściem za drzwiami
//
// Idea: drzwi wymagają A i B naraz. Drzwi stoją tuż za B, więc to GRACZ musi stać na B
// (stojąc na B wchodzi w drzwi, a one nie zamykają się na graczu). Kostka musi więc wrócić
// z wyspy na A po drugiej stronie przepaści.
export default {
  name: 'Dwa przyciski',
  hint: 'Drzwi otworzą się tylko przy dwóch wciśniętych przyciskach naraz, a przecież sam przy nich zostaniesz. Nie każda ściana, która przyjmie portal, jest widoczna z miejsca, w którym stoisz.',
  spawn: { x: 3.5, y: 0, z: 24, yaw: 0 },
  exit: { x: 4.5, y: 0, z: -33 },
  build(L) {
    L.room(-12, 12, -36, 28, 14, DARK_ALL);
    L.floor(-12, 12, -2, 28, 'dark');          // podest startowy
    L.floor(-12, 12, -36, -14, 'dark');        // wyspa + komora z wyjściem
    L.pit(-12, 12, -14, -2);

    // podest startowy: jedyna biała ściana (do samego sufitu, żeby nic nie mogło na niej leżeć)
    L.box(-12, 0, 0, -11, 14, 6, 'white');
    // szklana przegroda (do sufitu): rzut kostki z wyspy ani z portalu nie doleci do przycisku A
    L.box(-12, 0, 7, 5, 14, 8, 'glass');

    // ściana działowa przed komorą z wyjściem
    L.box(-12, 0, -30, -1.6, 5, -29, 'glass');
    L.box(1.6, 0, -30, 12, 5, -29, 'glass');
    L.box(-1.6, 3.2, -30, 1.6, 5, -29, 'dark');           // nadproże
    L.box(-12, 5, -30, 12, 14, -29.5, 'dark');            // tył pasa
    L.box(-12, 5, -29.5, 12, 14, -29, 'white');           // jedyny biały pas widoczny z S
    L.door(['A', 'B'], -1.6, 0, -30, 1.6, 3.2, -29, { mode: 'all' });

    // filar na wyspie: biała ściana patrzy w stronę drzwi (niewidoczna z podestu)
    L.box(5, 0, -24, 9, 14, -19, 'dark');
    L.box(5, 0, -25, 9, 14, -24, 'white');

    // przyciski i kostka
    L.button('A', 8, 19);
    L.button('B', 0, -28.25);
    L.cube(0, 0, -28.25);

    // tablice
    L.sign('WYJŚCIE', 'oba przyciski naraz', 5.4, 1.4, 0, 4.1, -28.95, 0);
    L.sign('B', 'przycisk', 2.2, 1.1, -3.6, 1.8, -28.95, 0);
    L.sign('A', 'przycisk', 2.4, 1.2, 11.95, 1.9, 19, Math.PI / 2);
  },
  solve(T) {
    const pl = T.game.player;
    // 1) przejście przez lukę w przegrodzie i dwa portale: niebieski wysoko na białym pasie nad szkłem,
    //    pomarańczowy na białej ścianie po lewej
    T.walkTo(8.5, 12, 15);
    T.walkTo(8.5, 3, 15);
    T.shoot(0, 0, 8, -29);
    T.shoot(1, -11, 1.5, 3);
    // 2) przez pomarańczowy na wyspę (lądujesz z góry)
    T.assert(T.walkThrough(1), 'nie przeszedłem przez pomarańczowy');
    T.land(8);
    T.assert(pl.pos.z < -20, 'nie jestem na wyspie');
    // 3) wyjście z wyspy wymaga przestawienia niebieskiego: ukryta biała ściana filaru
    T.walkTo(6.5, -27.6, 10);
    T.shoot(0, 7, 1.5, -25);
    // 4) kostka z przycisku B
    T.grab(0);
    T.assert(T.game.mech.held, 'kostka powinna być w rękach');
    // 5) z kostką z powrotem na podest
    T.assert(T.walkThrough(0), 'nie przeszedłem przez niebieski');
    T.land(4);
    // 6) kostka na przycisk A (za przegrodą, daleko od przepaści)
    T.walkTo(8.5, 5, 15);
    T.walkTo(8, 12, 15);
    T.walkTo(8, 17, 15);
    T.face(Math.PI, 0);
    T.wait(0.6);
    T.drop();
    T.wait(1.2);
    T.assert(T.buttonPressed('A'), 'przycisk A niewciśnięty');
    // 7) z powrotem na wyspę, tym razem już bez kostki
    T.walkTo(8.5, 12, 15);
    T.walkTo(8.5, 4, 15);
    T.assert(T.walkThrough(1), 'nie przeszedłem przez pomarańczowy (drugi raz)');
    T.land(4);
    // 8) stań na B – drzwi się otwierają – wyjście
    T.walkTo(0, -28.1, 10);
    T.wait(0.5);
    T.assert(T.buttonPressed('B'), 'przycisk B niewciśnięty');
    T.walkTo(0, -31.5, 10);
    T.walkTo(4.5, -33, 10);
  },
};
