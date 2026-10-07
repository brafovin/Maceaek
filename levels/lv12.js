import { DARK_ALL } from './util.js';

// Poziom 12 – „Dwa przyciski”
//
// Układ (oś z: start przy +z, wyjście przy -z; podłogi i sufit ciemne – portale tylko na 3 białych bryłach):
//   z = 26 … -2    podest startowy S: spawn (3.5, 23), przycisk A (9, 20) we wnęce za szklaną przegrodą
//                  (x=5…6, z 12…26), daleko od przepaści; niska (3 m) biała ściana po lewej
//                  (x=-11, z 0…12) – jedyna biała ściana po stronie startu
//   z = -2 … -14   przepaść z kwasem (12 m) i bariera z siatki (do sufitu) na brzegu wyspy
//   z = -14 … -29  wyspa, dwie części rozdzielone niską (4,3 m) szklaną ścianą działową z=-24,2…-24
//                  z przejściem x -10…-7:
//                  - tylna część (z -29 … -24): kostka leży na przycisku B tuż przed drzwiami (z=-28.25),
//                    szklana ściana z oknem na wyjście, nad nią biały pas y 5…8 (jedyna biała ściana wyspy
//                    widoczna ze startu); tu lądujesz po wejściu w pomarańczowy portal
//                  - przednia część (z -24 … -14.3): filar x 5…9, jego biała ściana (z=-21.5) patrzy w stronę
//                    drzwi i jest dostępna tylko z przedniej części, po przejściu przez lukę w ścianie działowej
//   z = -30 … -36  komora z wyjściem za drzwiami
//
// Rozwiązanie: portale (niebieski na pasie, pomarańczowy na białej ścianie startu) -> tylna część wyspy ->
// luką do przedniej -> niebieski na ukrytą ścianę filaru -> luką z powrotem, kostka z B -> luką do filaru ->
// niebieski -> start -> kostka na A (daleko) -> znów na wyspę (wylot przy filarze, luką do tylnej części) ->
// stań na B (drzwi wymagają A i B naraz, a drzwi stoją tuż za B: stojąc na B wchodzisz w ich obrys, więc nie
// zamkną się na graczu) -> wyjście.
//
// Zabezpieczenia:
// - niska ściana startu + przegroda przy A: rzut kostki z wyspy przez portal nie doleci do A;
// - bariera z siatki do sufitu na brzegu wyspy: z wyspy nie dosięgniesz kwasu (śmierć odsyła na start – to byłby
//   darmowy powrót bez ukrytej ściany), nie przerzucisz kostki ani nie przeskoczysz przepaści;
// - kwas na starcie nic nie daje: kostka upuszczona przy śmierci wraca na B;
// - nie da się wspiąć na kostce (w powietrzu nie można jej upuścić), podłogi i sufit są ciemne;
// - strzał ze startu przez własny pomarańczowy portal nie trafi w filar: biały pas jest tylko na y 5…8, a
//   szklana ściana działowa (5 m, blokuje strzał) leży 4,8 m od pasa, więc promień wylatujący z pasa
//   albo uderza w szkło, albo przelatuje nad nią zbyt wysoko, by trafić w filar nisko (przetestowane
//   ponad 26 tys. losowych strzałów: 0 portali na filarze). Ścianę filaru widać przez szkło, ale strzelić w nią
//   można dopiero po przejściu przez lukę.
export default {
  name: 'Dwa przyciski',
  hint: 'Drzwi otworzą się tylko przy dwóch wciśniętych przyciskach naraz, a Ty potrafisz stać tylko na jednym. Nie każda ściana, która przyjmie portal, jest widoczna z miejsca, w którym stoisz.',
  spawn: { x: 3.5, y: 0, z: 23, yaw: 0 },
  exit: { x: 4.5, y: 0, z: -33 },
  build(L) {
    L.room(-12, 12, -36, 26, 14, DARK_ALL);
    L.floor(-12, 12, -2, 26, 'dark');          // podest startowy
    L.floor(-12, 12, -36, -14, 'dark');        // wyspa + komora z wyjściem
    L.pit(-12, 12, -14, -2);

    // podest startowy: jedyna biała ściana, niska (3 m) – portal może powstać tylko nisko, więc rzut kostki
    // z wyspy przez portal nigdy nie doleci do A (portal wysoko dałby kostce długi lot)
    L.box(-12, 0, 0, -11, 3, 12, 'white');
    // przegroda przy A: wnęka (x 6…12, z 12…26) otwarta od strony z<12 – kostka rzucona z portalu nie wleci do niej
    L.box(5, 0, 12, 6, 14, 26, 'glass');
    // bariera z siatki na brzegu wyspy, aż do sufitu (niska dałaby się przelecieć z kostką pod stopami albo
    // przeskoczyć ze stosu): nie da się ani wpaść w kwas z kostką w rękach (silnik przenosi ją na start),
    // ani przenieść kostki nad przepaścią; strzał przelatuje przez siatkę
    L.box(-12, 0, -14.3, 12, 14, -14, 'grate');

    // ściana działowa przed komorą z wyjściem
    L.box(-12, 0, -30, -1.6, 5, -29, 'glass');
    L.box(1.6, 0, -30, 12, 5, -29, 'glass');
    L.box(-1.6, 3.2, -30, 1.6, 5, -29, 'dark');           // nadproże
    L.box(-12, 5, -30, 12, 14, -29.5, 'dark');            // tył pasa
    L.box(-12, 5, -29.5, 12, 8, -29, 'white');            // jedyny biały pas widoczny z S (y 5…8)
    L.box(-12, 8, -29.5, 12, 14, -29, 'dark');            // reszta pasa nieprzyjmująca portali
    L.door(['A', 'B'], -1.6, 0, -30, 1.6, 3.2, -29, { mode: 'all' });

    // niska szklana ściana działowa z przejściem x -10…-7 (blokuje strzał z pasa na filar)
    L.box(-12, 0, -24.2, -10, 5, -24, 'glass');
    L.box(-7, 0, -24.2, 12, 5, -24, 'glass');

    // filar na przedniej części wyspy: biała ściana patrzy w stronę drzwi (niewidoczna z podestu)
    L.box(5, 0, -20.5, 9, 14, -19, 'dark');
    L.box(5, 0, -21.5, 9, 14, -20.5, 'white');

    // przyciski i kostka
    L.button('A', 9, 20);
    L.button('B', 0, -28.25);
    L.cube(0, 0, -28.25);

    // tablice
    L.sign('WYJŚCIE', 'oba przyciski naraz', 5.4, 1.4, 0, 4.1, -28.95, 0);
    L.sign('B', 'przycisk', 2.2, 1.1, -3.6, 1.8, -28.95, 0);
    L.sign('A', 'przycisk', 2.4, 1.2, 11.95, 1.9, 20, -Math.PI / 2);
  },
  solve(T) {
    const pl = T.game.player;
    const gap = (zFrom, zTo) => { T.walkTo(-8.5, zFrom, 10); T.walkTo(-8.5, zTo, 10); };
    // 1) dwa portale z miejsca startu: niebieski na białym pasie nad szkłem (jedyna biała ściana widoczna
    //    po drugiej stronie), pomarańczowy na białej ścianie po lewej
    T.shoot(0, 0, 6.5, -29);
    T.shoot(1, -11, 1.5, 3);
    // 2) przez pomarańczowy na wyspę (lądujesz z góry w tylnej części)
    T.assert(T.walkThrough(1), 'nie przeszedłem przez pomarańczowy');
    T.land(8);
    T.assert(pl.pos.z < -24.5, 'nie jestem w tylnej części wyspy');
    // 3) luką do przedniej części, ukryta biała ściana filaru dla niebieskiego
    gap(-26, -23.1);
    T.walkTo(6.5, -22.8, 10);
    T.shoot(0, 7, 1.5, -21.5);
    // 4) kostka z przycisku B (luką z powrotem)
    gap(-23.1, -26);
    T.grab(0);
    T.assert(T.game.mech.held, 'kostka powinna być w rękach');
    // 5) z kostką luką do filaru i przez niebieski na podest
    gap(-26, -23.1);
    const pb = T.portal(0).pos;
    T.walkTo(pb[0], pb[2] - 1.5, 10);
    T.assert(T.walkThrough(0), 'nie przeszedłem przez niebieski');
    T.land(4);
    // 6) kostka na przycisk A (daleko od portali)
    T.walkTo(8, 8, 15);
    T.walkTo(9, 18.1, 15);
    T.face(Math.PI, 0);
    T.wait(0.6);
    T.drop();
    T.wait(1.2);
    T.assert(T.buttonPressed('A'), 'przycisk A niewciśnięty');
    // 7) z powrotem na wyspę (wylot przy filarze), tym razem już bez kostki
    T.walkTo(-8, 4, 15);
    T.assert(T.walkThrough(1), 'nie przeszedłem przez pomarańczowy (drugi raz)');
    T.land(4);
    T.assert(pl.pos.z > -24, 'powinienem wylądować w przedniej części');
    // 8) luką do tylnej części, stań na B – drzwi się otwierają – wyjście
    gap(-23.1, -26);
    T.walkTo(0, -28.1, 10);
    T.wait(0.5);
    T.assert(T.buttonPressed('B'), 'przycisk B niewciśnięty');
    T.walkTo(0, -31.5, 10);
    T.walkTo(4.5, -33, 10);
  },
};
