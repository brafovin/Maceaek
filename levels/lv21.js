export default {
  name: 'Kaskada',
  hint: 'Nie wszystko widać z posadzki – czasem trzeba zajrzeć za mur. Kto skacze z wysokości, długo pamięta, skąd leciał. A drzwi na końcu otworzy ktoś, kto nie musi ich przekraczać.',
  spawn: { x: 0, y: 0, z: 8, yaw: 0 },
  exit: { x: 0, y: 0, z: -65 },
  build(L) {
    const H = 14;             // wysokość wieży
    const N = 28, D = 0.45;   // schody: 28 stopni po 0,5 m
    L.room(-10, 10, -68, 11, 30, { n: 'dark', s: 'dark', e: 'dark', w: 'dark', ceil: 'dark' });

    // ---- etap 1: mur z podestem i przepaść A ----
    L.floor(-10, 10, -2, 11);                         // podłoga startowa (przyjmuje portale)
    L.pit(-10, 10, -9, -2);
    L.box(-10, 0, -2, 10, 3.4, -0.6, 'dark');         // mur zasłaniający przepaść
    L.box(-1.5, 0, -0.6, 1.5, 1.3, 1.6, 'dark');      // podest do zaglądania za mur
    L.box(9.5, 4.5, -9, 10, 9.5, -5, 'white');        // biała tablica na ścianie nad przepaścią (wabik)

    // ---- brzeg 1: podłoga z łatą X, wieża, pas startowy ----
    L.floor(-10, 10, -12, -9, 'dark');
    L.floor(-10, -8, -18, -12, 'dark');
    L.floor(-8, 0, -18, -12, 'floor');                // łata X (wyjście z etapu 1)
    L.floor(0, 10, -18, -12, 'dark');
    L.floor(-10, 10, -29, -18, 'dark');
    L.floor(-10, 3, -40, -29, 'dark');
    L.floor(3, 10, -37, -29, 'floor');                // pas wejściowy pod wieżą
    L.floor(3, 10, -40, -37, 'dark');
    L.box(3, 0, -28, 10, H, -23, 'dark');             // rdzeń wieży
    L.box(3, 0, -29, 10, H, -28, 'white');            // biała ściana wieży (zwrócona na południe)
    for (let i = 1; i <= N; i++) L.box(3, 0, -23, 10, 0.5 * i, -23 + D * (N - i + 1), 'dark');

    // ---- przepaść B ----
    L.pit(-10, 10, -52, -40);

    // ---- brzeg 2: platforma, wnęka, drzwi ----
    L.floor(-10, 10, -55, -52, 'dark');
    L.floor(-10, -9, -58, -55, 'dark');
    L.floor(-9, -5, -58, -55, 'floor');               // łata N we wnęce
    L.floor(-5, 10, -58, -55, 'dark');
    L.floor(-10, 10, -68, -58, 'dark');
    L.box(-10, 0, -54, -3, 4, -53, 'dark');           // wnęka: ściana północna
    L.box(-10, 0, -60, -3, 4, -59, 'dark');           // wnęka: ściana południowa
    L.box(-10, 2.8, -60, -3, 4, -53, 'dark');         // wnęka: dach
    L.box(-10, 0, -62, -2, 30, -61, 'dark');
    L.box(2, 0, -62, 10, 30, -61, 'dark');
    L.box(-2, 4.5, -62, 2, 30, -61, 'dark');
    L.door('B', -2, 0, -62, 2, 4.5, -61);

    L.button('B', 8.5, -25.5, { y: H });
    L.cube(0, 0, -56.5);
  },
  solve(T) {
    return T;
  },
};
