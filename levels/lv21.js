export default {
  name: 'Kaskada',
  hint: 'Z posadzki nie widać wszystkiego – podnieś wzrok. Wysokość daje pęd, a drzwi na końcu otworzy ktoś, kto nie musi przez nie przechodzić.',
  spawn: { x: 0, y: 0, z: 5.5, yaw: 0 },
  exit: { x: 0, y: 0, z: -68 },
  build(L) {
    const H = 14;             // wysokość wieży
    const N = 28, D = 0.45;   // schody: 28 stopni po 0,5 m
    L.room(-10, 10, -71, 7, 30, { n: 'dark', s: 'dark', e: 'dark', w: 'dark', ceil: 'dark' });

    // ---- etap 1: mur z podestem i przepaść A ----
    L.floor(-10, 10, -1.9, 7);                        // podłoga startowa (przyjmuje portale)
    L.box(-10, -8, -2, 10, 0, -1.9, 'dark');          // osłona ściany przepaści (żeby nie dało się tam strzelać)
    L.pit(-10, 10, -9, -2);
    L.box(-10, 0, -2, 10, 3.1, -0.6, 'dark');         // mur zasłaniający przepaść
    L.box(-1.5, 0, -0.6, 1.5, 1.3, 1.6, 'dark');      // podest do zaglądania za mur
    // niski strop strefy startowej (4,7 m): skok z podestu (głowa 4,57 m) mieści się, ale nie da się
    // „pompować” energii pętlą portali podłogowych ani wejść na mur ze stosu kostka+podest+skok
    L.box(-10, 4.7, -0.6, 10, 30, 7, 'dark');

    // ---- brzeg 1: podłoga z łatą X, wieża, pas startowy ----
    L.floor(-10, 10, -14, -9, 'dark');
    L.floor(-10, -8, -20, -14, 'dark');
    L.floor(-8, 0, -20, -14, 'floor');                // łata X (wyjście z etapu 1)
    L.floor(0, 10, -20, -14, 'dark');
    L.box(-9, 4.7, -21, 1, 30, -13, 'dark');          // niski strop nad łatą X (jak na starcie: bez pompy energii)
    L.floor(-10, 10, -29, -20, 'dark');
    L.floor(-10, 3, -42, -29, 'dark');
    // pas wejściowy pod wieżą: jedna mała łata 2,4 × 2,4 m – mieści tylko JEDEN portal
    L.floor(3, 5.3, -37, -29, 'dark');
    L.floor(7.7, 10, -37, -29, 'dark');
    L.floor(5.3, 7.7, -37, -36.7, 'dark');
    L.floor(5.3, 7.7, -34.3, -29, 'dark');
    L.floor(5.3, 7.7, -36.7, -34.3, 'floor');
    L.floor(3, 10, -42, -37, 'dark');
    L.box(3, 0, -28, 10, H, -23, 'dark');             // rdzeń wieży
    L.box(3, 0, -29, 10, H, -28, 'white');            // biała ściana wieży (zwrócona na południe)
    for (let i = 1; i <= N; i++) L.box(3, 0, -23, 10, 0.5 * i, -23 + D * (N - i + 1), 'dark');

    // ---- przepaść B ----
    L.pit(-10, 10, -54, -42);
    L.box(-10, 0, -42, 10, 1.2, -41.7, 'grate');      // barierka przy przepaści B (biegacz się zatrzyma)

    // ---- brzeg 2: platforma, ekran z łatą N za nim, drzwi ----
    L.floor(-10, 10, -57, -54, 'dark');
    L.floor(-10, -9, -61, -57, 'dark');
    L.floor(-9, -5, -61, -57, 'floor');               // łata N za ekranem
    L.box(-10, 4.7, -61, -3.5, 30, -56, 'dark');      // niski strop nad łatą N
    L.floor(-5, 10, -61, -57, 'dark');
    L.floor(-10, 10, -71, -61, 'dark');
    L.box(-10, 0, -56, 2, 30, -55, 'dark');           // ekran: zasłania zachodnią część platformy przed wzrokiem z północy
    L.box(-10, 0, -65, -2, 30, -64, 'dark');
    L.box(2, 0, -65, 10, 30, -64, 'dark');
    L.box(-2, 4.5, -65, 2, 30, -64, 'dark');
    L.door('B', -2, 0, -65, 2, 4.5, -64);

    L.button('B', 8.5, -25.5, { y: H });
    L.sign('KASKADA', 'dwie przepaście, trzy sztuczki', 6.4, 1.5, -5.5, 2.1, -0.55, 0);
    L.sign('▲  WYŻEJ', 'z góry widać więcej', 3.4, 1.2, 0, 2.3, -0.55, 0);
    L.sign('PRZYCISK', 'otwiera drzwi wyjścia', 5, 1.3, 9.95, H + 2.4, -25.5, -Math.PI / 2);
    L.sign('WYJŚCIE', 'za drzwiami', 8, 1.8, 0, 7.5, -63.95, 0);
    L.cube(0, 0, -58);

    // kurtyny nad przepaściami: kostka, która spadnie, wraca na start (nie zostaje na dnie),
    // a trzymana kostka nie przeżyje „kuriera samobójcy” do startu
    L.fizzler(-10, -2.35, -9, 10, -1.65, -2);
    L.fizzler(-10, -2.35, -54, 10, -1.65, -42);
  },
  solve(T) {
    const pl = T.game.player;
    const hold = () => T.game.mech.held;
    // ---- etap 1: zajrzeć za mur i przejść przez przepaść A ----
    T.walkTo(0, 3.2); T.face(0, 0);
    T.run(0.5, { KeyW: 1, Space: 1 }, () => pl.onGround && pl.pos.y > 1);   // wskok na podest
    T.run(0.4, { KeyW: 1 }); T.face(0, 0);                                  // pod sam mur
    T.shoot(0, 4, 0, 4);                      // niebieski: posadzka przed murem
    T.jump(); T.run(0.2, {});                 // w skoku widać łatę X za murem
    T.shoot(1, -4, 0, -17);                   // pomarańczowy: łata X po drugiej stronie
    T.run(2, {}, () => pl.onGround);
    T.walkTo(3, 2.5);
    T.assert(T.walkThrough(0), 'nie przeszedłem przez portal A');
    T.face(0, 0); T.run(0.6, { KeyW: 1 }); T.land(5);
    // ---- etap 2: wieża i lot przez przepaść B ----
    T.walkTo(0, -20, 10); T.walkTo(1, -34, 10);
    T.shoot(1, 6.5, 12.3, -29);               // wyjście: wysoko na ścianie wieży
    T.walkTo(6.5, -9.5, 15); T.walkTo(6.5, -24, 15);                        // schodami na szczyt
    T.walkTo(6.5, -28.75, 5); T.wait(0.4);
    T.shoot(0, 6.5, 0, -35.5);                // wejście: mała łata pod wieżą (jedyny portal podłogowy tam)
    T.assert(T.walkThrough(0), 'nie wskoczyłem w portal wieży');
    T.land(8);
    T.assert(pl.pos.z < -52 && pl.pos.y < 0.5, 'lot nie doniósł na drugi brzeg');
    // ---- etap 3: kostka na przycisk na wieży ----
    T.grab(0);
    T.walkTo(1, -59, 5);
    T.shoot(1, -7, 0, -59);                   // pomarańczowy: łata N we wnęce (niebieski zostaje na pasie)
    T.assert(T.walkThrough(1), 'nie przeszedłem przez portal wnęki');
    T.face(Math.PI, 0); T.run(0.7, { KeyW: 1 }); T.land(3);
    T.assert(hold(), 'kostka powinna być w rękach');
    T.walkTo(3.6, -33, 3);
    T.shoot(1, 6.5, 12.3, -29);               // pomarańczowy z powrotem na wieżę
    T.walkTo(1, -30, 6); T.walkTo(1, -9.5, 10); T.walkTo(6.5, -9.5, 8);
    T.walkTo(6.5, -22.5, 30);                 // schodami z kostką
    T.assert(hold(), 'kostka wypadła na schodach');
    T.walkTo(8.5, -23.0, 5); T.face(0, -0.3); T.wait(0.5);
    T.drop(); T.wait(1.2);
    T.assert(T.buttonPressed('B'), 'przycisk niewciśnięty');
    T.walkTo(6.5, -28.75, 5); T.wait(0.4);
    T.assert(T.walkThrough(0), 'nie wskoczyłem w portal wieży (2)');
    T.land(8);
    T.walkTo(0, -68, 15);
  },
};
