import { DARK_ALL } from './util.js';

// Poziom 15 – „Przez fizzler”
// Kurtyna fizzlera w oknie muru gasi portale. Przepaść przed nią jest za szeroka, więc trzeba ją
// przelecieć z pędem z wieży (wylot na północnej ścianie wieży – widać ją tylko od strony przepaści).
// Po drugiej stronie portale znikają, a jedyne portalowalne powierzchnie to dwie łatki na tylnej
// (północnej) stronie muru, niewidoczne z początku. Na półkę z wyjściem trzeba wejść z biegu.
export default {
  name: 'Przez fizzler',
  hint: 'Kurtyna gasi portale, ale nie pęd. Po drugiej stronie zaczynasz od zera – rozejrzyj się uważnie, zanim ruszysz dalej.',
  spawn: { x: 8, y: 0, z: 22, yaw: 0 },
  exit: { x: 10, y: 6.5, z: -28 },
  build(L) {
    L.room(-12, 12, -45, 26, 18, DARK_ALL);
    // strefa początkowa: biała podłoga, przepaść 9 m, mur z oknem
    L.floor(-12, 12, -10, 26);
    L.pit(-12, 12, -19, -10);
    L.floor(-12, 12, -45, -19, 'dark');

    // wieża 12 m: białe ściany, ciemny wierzch – wylot ma być na północnej ścianie
    L.box(-7, 0, -2, 1, 11.8, 8, 'white');
    L.box(-7, 11.8, -2, 1, 12, 8, 'dark');
    // schody po wschodniej stronie wieży (ciemne)
    const n = 24;
    for (let i = 1; i <= n; i++) L.box(1, 0, -2, 4.5, 0.5 * i, -2 + 0.8 * (n - i + 1), 'dark');

    // mur z oknem i kurtyną (ościeża w pasy ostrzegawcze)
    L.box(-12, 0, -21, -9.4, 18, -19, 'dark');
    L.box(9.4, 0, -21, 12, 18, -19, 'dark');
    L.box(-9.4, 12.4, -21, 9.4, 18, -19, 'dark');
    L.box(-9.4, 0, -21, -9, 12.4, -19, 'door');
    L.box(9, 0, -21, 9.4, 12.4, -19, 'door');
    L.box(-9, 12, -21, 9, 12.4, -19, 'door');
    L.fizzler(-9, 0, -20.05, 9, 12, -19.95);

    // łatki na północnej stronie muru (widoczne dopiero zza kurtyny)
    L.box(-11.6, 0, -21.5, -9.4, 11.4, -21, 'white');   // lewa – wysoka (nisko wejście, wysoko pułapka)
    L.box(9.4, 7.9, -21.5, 11.6, 10.4, -21, 'white');   // prawa – wysoko, nad szczeliną
    // półka z wyjściem (3 m od muru)
    L.box(8, 0, -31.5, 12, 6.5, -24.5, 'dark');

    L.sign('WIEŻA', '12 m', 6, 2.2, -3, 5, 8.05, 0);
    L.sign('KURTYNA', 'gasi portale', 8, 2.4, 0, 15.2, -18.95, 0);
  },
  solve(T) {
    const pl = T.game.player;
    // 1. wylot (pomarańczowy) wysoko na północnej ścianie wieży – widać ją dopiero od strony przepaści
    T.walkTo(8, 12); T.walkTo(8, -3); T.walkTo(-3, -6);
    T.shoot(1, -3, 9.5, -2);
    // 2. schody na wieżę
    T.walkTo(8, -3); T.walkTo(8, 19); T.walkTo(2.75, 19);
    T.face(0, 0);
    T.walkTo(2.75, -1.2, 40);
    T.walkTo(-3, -1.2);
    // 3. przy samej krawędzi: wejście (niebieski) na posadzce za wieżą
    T.creep(-3, -1.72);
    T.shoot(0, -3, 0, -5.2);
    // 4. zejdź z krawędzi powoli i wpadnij w portal, lot przez kurtynę
    T.face(0, 0);
    T.run(1.5, { KeyW: 1 }, () => pl.pos.z < -2.15);
    T.run(0.3, {}, null);
    T.run(5, {}, () => pl.onGround);
    T.assert(!T.portal(0).active && !T.portal(1).active, 'kurtyna powinna zgasić portale: ' + JSON.stringify(T.st()));
    T.land(5);
    // 5. łatki za plecami: lewa nisko (wejście), prawa wysoko (wyjście)
    T.shoot(0, -10.5, 1.7, -21.5);
    T.shoot(1, 10.5, 9.15, -21.5);
    // 6. rozbieg prosto na wejście i wskok na półkę z biegu
    const A = T.portal(0).pos;
    T.walkTo(A[0], -38);
    T.walkThrough(0, { run: true });
    T.run(1.5, { KeyW: 1 }, () => pl.onGround);
    T.land(5);
    T.walkTo(10, -28);
  },
};
