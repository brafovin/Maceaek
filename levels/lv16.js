import { DARK_ALL } from './util.js';

// Poziom 16 – „Kratka”.
// Gmach o dwóch kondygnacjach; wszystkie łatki prowadzące dalej są schowane za kratkami lub szkłem.
//   R1  hala startowa (góra)       – jedyna łatka E1 na zachodniej ścianie,
//   R2  klatka za oknem z kratką   – sufit-łatka C2 (widać ją przez okno), łatka W2 za plecami,
//                                    wschodnia część podłogi to kratownica nad komorą R4 (reszta to lita płyta),
//   R4  komora pod podłogą R2      – wysoka łatka P4 na zachodniej ścianie (widać ją przez kratownicę),
//                                    za przegrodą: sufitowa łatka X nad wlotem tunelu i łatka Y w podłodze tunelu,
//   R3  cela z wyjściem            – łatka W3 nisko na północnej ścianie, widoczna tylko przez okno:
//                                    dolna część okna to szkło (widać, ale strzał nie przechodzi),
//                                    górna to kratka (strzał przechodzi, ale tylko nad parapetem).
// Etapy 1 i 2: portal zostawiony w poprzedniej klatce jest poza zasięgiem (sufit / wysoka ściana),
// więc w każdej klatce trzeba znaleźć niską łatkę, do której da się dojść, i przestawić daleki portal przez kratkę.
// Etap 3: z poziomu oczu nie da się trafić w W3 (parapet szkła). Trzeba „podnieść” strzał: portal Y w podłodze
// tunelu + portal X pod sufitem; strzał w Y wylatuje z sufitu i opada przez kratkę prosto na W3 (peryskop).
// Pułapki projektowe (nie ruszać bez ponownego sprawdzenia, np. symulacją promieni):
//  - długa lita płyta R2 (z -19 do -8) i kratownica dopiero od z=-19: bez tego strzał z R1/R2 „nurkuje” przez kratownicę
//    i okno wprost w W3; parapet szkła 3,6 m i górna krawędź W3 3 m (skok sięga oka na 3,09 m),
//  - przegroda (x -1..0,5) odcina P4 od X i tunelu – bez niej z klatki da się przez P4 postawić portal na X,
//  - Y zaczyna się dopiero od z=-2 (płycej kratownica widzi tunel), tunel ma 16 m, żeby dało się stanąć w odległości ~6 m od Y.
const U = 12;      // wysokość podłogi hal górnych (R1, R2)
const G = 0.3;     // grubość kratki / cienkich płyt

export default {
  name: 'Kratka',
  hint: 'Kratka zatrzyma Ciebie, ale nie strzał. Szkło – odwrotnie.',
  spawn: { x: 0, y: U, z: 16, yaw: 0 },
  exit: { x: 4, y: 0, z: -39 },
  build(L) {
    // wspólna obudowa (R1 + R2 na górze, R4 + R3 pod spodem)
    L.room(-14, 14, -46, 20, U + 12, DARK_ALL);

    // ---- dół: podłoga R4 i R3 ----
    L.box(-14, -8, -46, 14, 0, -8, 'dark');

    // ---- południowy blok: podłoga R1 i południowa ściana R4 (z tunelem technicznym x 3..7, z -8..8) ----
    L.box(-14, -8, -8, 3, 0, 20, 'dark');
    L.box(7, -8, -8, 14, 0, 20, 'dark');
    L.box(3, -8, -8, 7, 0, -2, 'dark');
    L.box(3, -8, -2, 7, 0, 2.5, 'white');                 // Y – łatka w podłodze tunelu
    L.box(3, -8, 2.5, 7, 0, 20, 'dark');
    L.box(-14, 0, -8, 3, U, 20, 'dark');
    L.box(7, 0, -8, 14, U, 20, 'dark');
    L.box(3, 2.5, -8, 7, U, 8, 'dark');
    L.box(3, 0, 8, 7, U, 20, 'dark');
    // ramka wlotu tunelu (dekoracja)
    L.box(2.5, 2.5, -8.12, 7.5, 3, -8, 'door');
    L.box(2.5, 0, -8.12, 3, 3, -8, 'door');
    L.box(7, 0, -8.12, 7.5, 3, -8, 'door');

    // ---- R1: łatka wejściowa E1 na zachodniej ścianie, filary, znaczniki ----
    L.box(-14, U, -3, -13, U + 8, 9, 'white');           // E1
    for (const x of [-8, 8]) for (const z of [4, 13]) L.box(x - 0.8, U, z - 0.8, x + 0.8, U + 12, z + 0.8, 'dark');
    L.box(-4, U, -5.5, 4, U + 0.04, -5.1, 'door');

    // ---- dzielnik R1 | R2 z oknem i kratką ----
    L.box(-14, U, -8, -2.5, U + 12, -6, 'dark');
    L.box(2.5, U, -8, 14, U + 12, -6, 'dark');
    L.box(-2.5, U + 6, -8, 2.5, U + 12, -6, 'dark');
    L.box(-2.5, U, -7.15, 2.5, U + 6, -6.85, 'grate');
    // ramka okna od strony R1 (dekoracja)
    L.box(-3, U + 6, -6.12, 3, U + 6.5, -6, 'door');
    L.box(-3, U, -6.12, -2.5, U + 6.5, -6, 'door');
    L.box(2.5, U, -6.12, 3, U + 6.5, -6, 'door');

    // ---- R2: sufit-łatka C2, łatka W2 za plecami, podłoga: lita + kratownica na wschodzie ----
    L.box(-4, U + 10, -26, 6, U + 12, -10, 'white');     // C2
    L.box(-12, U, -9, -5, U + 8, -8, 'white');           // W2
    L.box(-14, U - G, -19, 14, U, -8, 'dark');
    L.box(-14, U - G, -28, -4, U, -19, 'dark');
    L.box(12, U - G, -28, 14, U, -19, 'dark');
    L.box(-4, U - G, -28, 12, U, -26, 'dark');
    L.box(-4, U - G, -26, 12, U, -19, 'grate');
    // pasy ostrzegawcze wokół kratownicy (dekoracja)
    L.box(-4.3, U, -26, -4, U + 0.04, -19, 'door');
    L.box(-4, U, -19.3, 12, U + 0.04, -19, 'door');
    L.box(-4, U, -26.3, 12, U + 0.04, -26, 'door');
    L.box(12, U, -26, 12.3, U + 0.04, -19, 'door');

    // ---- R4: wysoka łatka P4, przegroda-ostoja i sufitowa łatka X nad wlotem tunelu ----
    L.box(-14, 4, -22, -13, 7.3, -14, 'white');          // P4
    L.box(-1, 0, -20, 0.5, U - G, -8, 'dark');           // przegroda: zasłania wschodnią część przed P4
    L.box(1, U - G - 0.4, -11, 9, U - G, -8, 'white');   // X – łatka pod sufitem komory

    // ---- przegroda R4 | R3 z oknem: dół szkło, góra kratka ----
    L.box(-14, 0, -32, 2, U - G, -30, 'dark');
    L.box(8, 0, -32, 14, U - G, -30, 'dark');
    L.box(2, 6.2, -32, 8, U - G, -30, 'dark');
    L.box(2, 0, -31.15, 8, 3.6, -30.85, 'glass');
    L.box(2, 3.6, -31.15, 8, 6.2, -30.85, 'grate');
    // ramka okna od strony R4 (dekoracja)
    L.box(1.5, 6.2, -30, 8.5, 6.7, -29.88, 'door');
    L.box(1.5, 0, -30, 2, 6.7, -29.88, 'door');
    L.box(8, 0, -30, 8.5, 6.7, -29.88, 'door');

    // ---- R3: sufit, łatka W3 nisko na północnej ścianie ----
    L.box(-14, 8, -46, 14, U + 12, -32, 'dark');
    L.box(-14, U - G, -32, 14, U + 12, -28, 'dark');
    L.box(-2, 0, -46, 6, 3, -45, 'white');               // W3

    // tablice
    L.sign('KLATKA', 'wejścia brak', 8, 2.8, 0, U + 9, -5.95, 0);
    L.sign('OBSERWACJA', 'wolno patrzeć i strzelać', 9, 2.8, 13.95, U + 6, 8, Math.PI / 2);
    L.sign('WYJŚCIE', 'za szkłem i kratką', 8, 2.8, 5, 8.6, -29.95, 0);
    L.sign('SERWIS', 'tunel techniczny', 6, 2.2, 5, 6, -8.05, Math.PI);
  },
  solve(T) {
    // ---- 1. hala -> klatka: w sufit przez okno, potem wejście z zachodniej ściany ----
    T.walkTo(0, -3.5);
    T.shoot(1, 1, 22, -18);                       // pomarańczowy: sufit klatki
    T.shoot(0, -13, U + 1.2, 3);                  // niebieski: zachodnia ściana hali
    T.assert(T.walkThrough(0), 'nie wszedłem w portal wejściowy');
    T.land(10);                                   // spadam z sufitu klatki
    // ---- 2. klatka -> komora: niska łatka za plecami + wysoka łatka pod podłogą ----
    T.shoot(1, -8, U + 1.2, -9);                  // pomarańczowy: łatka za plecami (W2)
    T.walkTo(3, -22.5);                           // na kratownicę, z dala od litej płyty
    T.shoot(0, -13, 5.5, -19);                    // niebieski: wysoka łatka w komorze pod kratownicą (P4)
    T.walkTo(-8, -9.6);                           // pod ścianę z łatką W2
    T.assert(T.walkThrough(1), 'nie wszedłem w portal W2');
    T.land(10);
    // ---- 3. komora -> cela: szkło zatrzymuje strzał, więc trzeba strzelać „z góry” przez własny portal ----
    T.walkTo(-6, -23); T.walkTo(3, -23);          // dookoła przegrody, do wschodniej części komory
    T.walkTo(4.5, -14);                           // patrząc na południe: łatka X pod sufitem nad wlotem tunelu
    T.shoot(1, 5, U - G - 0.4, -9.5);             // pomarańczowy: sufit (X)
    T.walkTo(5, -8.5); T.walkTo(5, 5);            // w głąb tunelu
    for (const zt of [0, 0.4, -0.4, 0.8]) {       // niebieski: podłoga tunelu (Y)
      if (T.shoot(0, 5, 0, zt, { allowFail: true }) && T.portal(0).pos[1] < 1) break;
    }
    T.assert(T.portal(0).pos[1] < 1, 'nie postawiłem portalu na podłodze tunelu');
    const Y = T.portal(0).pos;
    let placed = false;
    for (let z = Math.min(Y[2] + 6.6, 7.4); z > Y[2] + 3.4 && !placed; z -= 0.3) {   // peryskop: strzał w Y wylatuje z sufitu, nad parapetem szkła
      T.walkTo(5, z, 5);
      T.shoot(1, Y[0], Y[1], Y[2], { allowFail: true });
      placed = T.portal(1).pos[2] < -40;                  // pomarańczowy wylądował na W3
    }
    T.assert(placed, 'nie trafiłem w W3 przez peryskop');
    T.assert(T.walkThrough(0), 'nie wszedłem w portal Y');
    T.land(10);
    T.walkTo(4, -39);
  },
};
