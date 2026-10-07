import { DARK_ALL } from './util.js';

// Poziom 15 – „Przez fizzler”
// Kurtyna fizzlera w oknie muru gasi portale. Przepaść przed nią jest za szeroka, a próg okna ma 3 m,
// więc trzeba ją przelecieć z pędem z wieży. Wylot (pomarańczowy) idzie WYSOKO (y >= 8 m) na białą płytę
// na północnej ścianie wieży – widać ją tylko od strony przepaści. Wejście (niebieski) leży po PRZECIWNEJ,
// południowej stronie wieży, na jedynej białej posadzce: gracz idzie przez wierzch wieży, schodzi z jej
// południowej krawędzi marszem i wpada w portal po 12 m spadku. Posadzka na północ od wieży jest ciemna,
// więc nie da się zrobić pętli ściana–podłoga na krótkim rozbiegu. Dach nad wierzchem blokuje skok.
// Po drugiej stronie portale znikają, a jedyne portalowalne powierzchnie to dwie łatki na tylnej
// (północnej) stronie muru, niewidoczne z początku. Wylot z wysokiej łatki jest 3 m nad półką z wyjściem,
// która stoi 7,5 m od muru: bez skoku albo bez biegu (Shift, także w powietrzu) zabraknie ok. 2 m,
// więc trzeba wbiec w niski portal i wybić się tuż przed nim.
export default {
  name: 'Przez fizzler',
  hint: 'Kurtyna gasi portale, ale nie pęd. Po drugiej stronie zaczynasz od zera, więc rozejrzyj się uważnie, zanim ruszysz dalej.',
  spawn: { x: 8, y: 0, z: 22, yaw: 0 },
  exit: { x: 10, y: 6.5, z: -32 },
  build(L) {
    L.room(-12, 12, -45, 26, 18, DARK_ALL);
    // strefa początkowa: biała podłoga, przepaść 9 m, mur z oknem
    L.floor(-12, 12, -10, 10, 'dark');   // na północ od wieży – ciemna
    // jedyna biała posadzka: łatka 2,5 x 2,5 m na wprost wieży (reszta ciemna – nie da się zrobić pary podłoga-podłoga)
    L.floor(-12, -4.25, 10, 26, 'dark');
    L.floor(-1.75, 12, 10, 26, 'dark');
    L.floor(-4.25, -1.75, 10, 12.5, 'dark');
    L.floor(-4.25, -1.75, 15, 26, 'dark');
    L.floor(-4.25, -1.75, 12.5, 15);
    L.pit(-12, 12, -19, -10);
    L.floor(-12, 12, -45, -19, 'dark');

    // wieża 12 m: ciemna, tylko płyta na północnej ścianie przyjmuje portal (wylot)
    L.box(-7, 0, -2, 1, 12, 8, 'dark');
    L.box(-7, 0, -2.5, 1, 11.8, -2, 'white');
    // dach nad wierzchem i schodami: nie da się skoczyć z krawędzi wieży (ani rozpędzić skokiem w powietrzu)
    L.box(-12, 13.9, -3.5, 12, 14.9, 8, 'dark');
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
    // próg okna 3 m: bez wysokiego lotu z wieży nie da się go przeskoczyć (skok z podłogi uderza w ścianę)
    L.box(-9, 0, -21, 9, 3, -19, 'dark');
    L.fizzler(-9, 3, -20.05, 9, 12, -19.95);

    // łatki na północnej stronie muru (widoczne dopiero zza kurtyny)
    L.box(-11.6, 0, -21.5, -9.4, 11.4, -21, 'white');   // lewa – wysoka (nisko wejście, wysoko pułapka)
    L.box(9.4, 9.4, -21.5, 11.6, 11.9, -21, 'white');   // prawa – wysoko, nad szczeliną
    // półka z wyjściem (7,5 m od muru)
    L.box(8, 0, -35.5, 12, 6.5, -28.5, 'dark');

    // oznaczenie celu na przedniej ścianie półki – widać je po obrocie w hali
    L.sign('WYJŚCIE', '', 3.8, 1.8, 10, 4.6, -28.45, 0);
    L.sign('WYJŚCIE', 'na półce', 6, 2.2, 7.95, 4.4, -32, -Math.PI / 2);
    L.sign('WYJŚCIE', 'na półce', 8, 3, 10, 9, -44.95, 0);
    L.sign('WIEŻA', '12 m', 6, 2.2, -3, 5, 8.05, 0);
    L.sign('KURTYNA', '', 8, 2.4, 0, 15.2, -18.95, 0);
    L.sign('PORTALE 0 / 2', 'zacznij od nowa', 8, 2.4, 0, 15.2, -21.05, Math.PI);
  },
  solve(T) {
    const pl = T.game.player;
    // 1. wylot (pomarańczowy) WYSOKO (y >= 8 m) na białej płycie północnej ściany wieży – widać ją dopiero od strony przepaści
    T.walkTo(8, 12); T.walkTo(8, -3); T.walkTo(-3, -6);
    T.shoot(1, -3, 9.5, -2.5);
    // 2. schody na wieżę (wschodnia strona), potem wierzch
    T.walkTo(8, -3); T.walkTo(8, 19); T.walkTo(2.75, 19);
    T.face(0, 0);
    T.walkTo(2.75, -1.2, 40);
    T.walkTo(-3, -1.2);
    // 3. południowa krawędź wieży: wejście (niebieski) na białej posadzce ok. 6 m dalej – tyle poniesie pęd marszu
    T.walkTo(-3, 7.3); T.wait(0.5);
    T.shoot(0, pl.pos.x, 0, 14.2);
    // 4. zejdź z krawędzi marszem (na południe) i wpadnij w portal, lot przez kurtynę
    T.face(Math.PI, 0);
    T.run(1.5, { KeyW: 1 }, () => pl.pos.y < 11.9);
    T.run(0.3, {}, null);
    T.run(5, {}, () => pl.onGround);
    T.assert(!T.portal(0).active && !T.portal(1).active, 'kurtyna powinna zgasić portale: ' + JSON.stringify(T.st()));
    T.land(5);
    // 5. łatki za plecami: lewa nisko (wejście), prawa wysoko (wyjście)
    T.shoot(0, -10.5, 1.7, -21.5);
    T.shoot(1, 10.5, 10.65, -21.5);
    // 6. rozbieg prosto na wejście i wskok na półkę z biegu
    const A = T.portal(0).pos;
    T.walkTo(A[0], -38);
    let jumped = false, prev = pl.pos.clone();
    for (let k = 0; k < 1500; k++) {
      pl.yaw = Math.atan2(-(A[0] - pl.pos.x), -(A[2] - pl.pos.z));
      const keys = { KeyW: 1, ShiftLeft: 1 };
      if (!jumped && A[2] - pl.pos.z < 0.45) { keys.Space = 1; jumped = true; }   // skok tuż przed portalem
      T.run(0.01, keys, null);
      if (pl.pos.distanceTo(prev) > 2) break;
      prev.copy(pl.pos);
    }
    T.assert(pl.pos.y > 6, 'powinieneś wylecieć z wysokiego portalu: ' + JSON.stringify(T.st()));
    T.run(1.5, { KeyW: 1 }, () => pl.onGround);
    T.land(5);
    T.walkTo(10, -32);
  },
};
