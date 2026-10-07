import { DARK_ALL } from './util.js';

// Poziom 16 – „Kratka”.
// Gmach o dwóch kondygnacjach; wszystkie łatki prowadzące dalej są schowane za kratkami.
//   R1  hala startowa (góra)       – jedyna łatka E1 na zachodniej ścianie,
//   R2  klatka za oknem z kratką   – sufit-łatka C2 (widać ją przez okno), łatka W2 za plecami,
//                                    wschodnia część podłogi to kratownica nad komorą R4,
//   R4  komora pod podłogą R2      – wysoka łatka P4 na zachodniej ścianie (widać ją przez kratownicę),
//                                    niska łatka W4 na końcu długiego tunelu,
//   R3  cela z wyjściem            – łatka W3 widoczna tylko przez okienko w przegrodzie.
// Zasada: portal zostawiony w poprzedniej klatce jest poza zasięgiem (sufit / wysoka ściana),
// więc w każdej klatce trzeba znaleźć niską, osiągalną łatkę i dopiero wtedy przestawić daleki portal.
// Sztuczki z „peryskopem” (strzał przez własny portal) nie dają skrótów: łatki P4, W3, W4
// nie są widoczne z żadnego portalu postawionego wcześniej (sprawdzone próbkowaniem promieni).
const U = 12;      // wysokość podłogi hal górnych (R1, R2)
const G = 0.3;     // grubość kratki / cienkich płyt

export default {
  name: 'Kratka',
  hint: 'Kratka zatrzyma Ciebie, ale nie strzał – a patrzeć można też w górę i w dół. Portal zostawiony poza zasięgiem na nic się nie zda: w każdej klatce szukaj łatki, do której da się dojść.',
  spawn: { x: 0, y: U, z: 16, yaw: 0 },
  exit: { x: 4, y: 0, z: -39 },
  build(L) {
    // wspólna obudowa (R1 + R2 na górze, R4 + R3 pod spodem)
    L.room(-14, 14, -46, 20, U + 12, DARK_ALL);

    // ---- dół: podłoga R4 i R3 ----
    L.box(-14, -8, -46, 14, 0, -8, 'dark');

    // ---- południowy blok: podłoga R1 i południowa ściana R4 (z tunelem do łatki W4) ----
    L.box(-14, -8, -8, 14, 0, 20, 'dark');
    L.box(-14, 0, -8, -2, U, 20, 'dark');
    L.box(2, 0, -8, 14, U, 20, 'dark');
    L.box(-2, 2.5, -8, 2, U, 3, 'dark');
    L.box(-2, 0, 3, 2, U, 20, 'dark');
    L.box(-2, 0, 2, 2, 2.5, 3, 'white');                 // W4 – łatka na końcu tunelu
    // ramka wlotu tunelu (dekoracja)
    L.box(-2.5, 2.5, -8.12, 2.5, 3, -8, 'door');
    L.box(-2.5, 0, -8.12, -2, 3, -8, 'door');
    L.box(2, 0, -8.12, 2.5, 3, -8, 'door');

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
    L.box(-14, U - G, -11, 14, U, -8, 'dark');
    L.box(-14, U - G, -28, -4, U, -11, 'dark');
    L.box(12, U - G, -28, 14, U, -11, 'dark');
    L.box(-4, U - G, -28, 12, U, -26, 'dark');
    L.box(-4, U - G, -26, 12, U, -11, 'grate');
    // pasy ostrzegawcze wokół kratownicy (dekoracja)
    L.box(-4.3, U, -26, -4, U + 0.04, -11, 'door');
    L.box(-4, U, -11.3, 12, U + 0.04, -11, 'door');
    L.box(-4, U, -26.3, 12, U + 0.04, -26, 'door');
    L.box(12, U, -26, 12.3, U + 0.04, -11, 'door');

    // ---- R4: wysoka łatka P4 na zachodniej ścianie ----
    L.box(-14, 4, -22, -13, 7.3, -14, 'white');          // P4

    // ---- przegroda R4 | R3 z okienkiem ----
    L.box(-14, 0, -32, 2, U - G, -30, 'dark');
    L.box(8, 0, -32, 14, U - G, -30, 'dark');
    L.box(2, 5, -32, 8, U - G, -30, 'dark');
    L.box(2, 0, -31.15, 8, 5, -30.85, 'grate');
    // ramka okienka od strony R4 (dekoracja)
    L.box(1.5, 5, -30, 8.5, 5.5, -29.88, 'door');
    L.box(1.5, 0, -30, 2, 5.5, -29.88, 'door');
    L.box(8, 0, -30, 8.5, 5.5, -29.88, 'door');

    // ---- R3: sufit, łatka W3 na północnej ścianie ----
    L.box(-14, 8, -46, 14, U + 12, -32, 'dark');
    L.box(-14, U - G, -32, 14, U + 12, -28, 'dark');
    L.box(-2, 0, -46, 6, 6, -45, 'white');               // W3

    // tablice
    L.sign('KLATKA', 'wejścia brak', 8, 2.8, 0, U + 9, -5.95, 0);
    L.sign('OBSERWACJA', 'wolno patrzeć i strzelać', 9, 2.8, 13.95, U + 6, 8, Math.PI / 2);
    L.sign('WYJŚCIE', 'za kratką', 8, 2.8, 5, 8.5, -29.95, 0);
    L.sign('SERWIS', 'tunel techniczny', 6, 2.2, 0, 6, -8.05, Math.PI);
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
    T.shoot(0, -13, 5.5, -18);                    // niebieski: wysoka łatka w komorze pod kratownicą (P4)
    T.assert(T.walkThrough(1), 'nie wszedłem w portal W2');
    T.land(10);
    // ---- 3. komora -> cela: okienko i tunel ----
    T.walkTo(4, -20);                             // stań na wschodzie: stąd widać łatkę za okienkiem
    T.shoot(1, 2, 2, -45);                        // pomarańczowy: łatka W3 w celi z wyjściem
    T.walkTo(0, -14);                             // naprzeciw tunelu
    T.shoot(0, 0, 1.2, 2);                        // niebieski: koniec tunelu (W4)
    T.assert(T.walkThrough(0), 'nie wszedłem w portal W4');
    T.land(10);
    T.walkTo(4, -39);
  },
};
