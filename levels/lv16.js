import { DARK_ALL } from './util.js';

// Poziom 16 – „Kratka”.
// Trzy kondygnacje łamigłówki, wszystkie portalowalne łatki są schowane za kratkami:
//  1) hala startowa R1 -> klatka R2 (łatka na jej suficie, widoczna przez okno z kratką),
//  2) klatka R2 stoi na kratowej podłodze nad komorą R4 (łatka wysoko na zachodniej ścianie komory),
//  3) komora R4 -> cela R3 z wyjściem (łatka widoczna tylko przez okienko w przegrodzie).
// W każdej z komór „zostawiony” portal jest poza zasięgiem, więc trzeba znaleźć w niej
// niską, ukrytą łatkę (za plecami / we wnęce), a daleki portal przestawić przez kratkę.
const U = 12;      // wysokość podłogi hal górnych (R1, R2)
const G = 0.3;     // grubość kratki / cienkich płyt

export default {
  name: 'Kratka',
  hint: 'Kratka zatrzyma Ciebie, ale nie strzał – także ten w górę i w dół. Portal, który zostawiasz za sobą, bywa poza zasięgiem: w każdej klatce poszukaj miejsca, którego nie widać z poprzedniej.',
  spawn: { x: 0, y: U, z: 16, yaw: 0 },
  exit: { x: 0, y: 0, z: -39 },
  build(L) {
    // wspólna obudowa (R1 + R2 na górze, R4 + R3 pod spodem)
    L.room(-14, 14, -46, 20, U + 12, DARK_ALL);

    // ---- dół: podłoga R4 i R3 ----
    L.box(-14, -8, -46, 14, 0, -8, 'dark');

    // ---- południowy blok: podłoga R1 i południowa ściana R4 (z wnęką na łatkę W4) ----
    L.box(-14, -8, -8, 14, 0, 20, 'dark');
    L.box(-14, 0, -8, -5, U, 20, 'dark');
    L.box(5, 0, -8, 14, U, 20, 'dark');
    L.box(-5, 0, -3, 5, U, 20, 'dark');
    L.box(-5, 4, -8, 5, U, -3, 'dark');
    L.box(-5, 0, -4, 5, 4, -3, 'white');                 // W4 – ukryta łatka we wnęce

    // ---- R1: łatka wejściowa E1 na zachodniej ścianie ----
    L.box(-14, U, -3, -13, U + 8, 9, 'white');

    // ---- dzielnik R1 | R2 z oknem i kratką ----
    L.box(-14, U, -8, -2.5, U + 12, -6, 'dark');
    L.box(2.5, U, -8, 14, U + 12, -6, 'dark');
    L.box(-2.5, U + 6, -8, 2.5, U + 12, -6, 'dark');
    L.box(-2.5, U, -7.15, 2.5, U + 6, -6.85, 'grate');

    // ---- R2: sufit-łatka C2, łatka W2 za plecami, kratowa podłoga ----
    L.box(-10, U + 10, -26, 10, U + 12, -10, 'white');   // C2
    L.box(-12, U, -9, -5, U + 8, -8, 'white');           // W2
    L.box(-14, U - G, -11, 14, U, -8, 'dark');
    L.box(-14, U - G, -28, -12, U, -11, 'dark');
    L.box(12, U - G, -28, 14, U, -11, 'dark');
    L.box(-12, U - G, -28, 12, U, -26, 'dark');
    L.box(-12, U - G, -26, 12, U, -11, 'grate');

    // ---- R4: wysoka łatka P4 na zachodniej ścianie ----
    L.box(-14, 6, -24, -13, 9.3, -14, 'white');

    // ---- przegroda R4 | R3 z okienkiem ----
    L.box(-14, 0, -32, -3, U - G, -30, 'dark');
    L.box(3, 0, -32, 14, U - G, -30, 'dark');
    L.box(-3, 5, -32, 3, U - G, -30, 'dark');
    L.box(-3, 0, -31.15, 3, 5, -30.85, 'grate');

    // ---- R3: sufit, łatka W3 na północnej ścianie ----
    L.box(-14, 8, -46, 14, U + 12, -32, 'dark');
    L.box(-14, U - G, -32, 14, U + 12, -28, 'dark');
    L.box(3, 0, -46, 12, 6, -45, 'white');               // W3

    // tablice
    L.sign('KLATKA', 'wejścia brak', 8, 2.8, 0, U + 9, -5.95, 0);
    L.sign('WYJŚCIE', 'za kratką', 8, 2.8, 0, 8.5, -29.95, 0);
  },
  solve(T) {
    const pl = T.game.player;
    // ---- 1. hala -> klatka: w sufit przez okno, potem wejście z zachodniej ściany ----
    T.walkTo(0, -3.5);
    T.shoot(1, 0, 22, -18);
    T.shoot(0, -13, U + 1.2, 3);
    T.assert(T.walkThrough(0), 'nie wszedłem w portal wejściowy');
    T.land(10);
    // ---- 2. klatka -> komora: niska łatka za plecami + wysoka łatka pod podłogą ----
    T.shoot(1, -8, U + 1.2, -9);
    T.shoot(0, -13, 7.5, -19);
    T.assert(T.walkThrough(1), 'nie wszedłem w portal W2');
    T.land(10);
    // ---- 3. komora -> cela: wnęka i okienko ----
    T.walkTo(-10, -19);
    T.shoot(0, 0, 1.2, -4);
    T.shoot(1, 8, 2, -45);
    T.assert(T.walkThrough(0), 'nie wszedłem w portal W4');
    T.land(10);
    T.walkTo(0, -39);
  },
};
