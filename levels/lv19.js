import { DARK_ALL } from './util.js';

// Dwa piętra. Płyta między kondygnacjami jest gruba i ciemna, a jej spód (sufit parteru) – biały.
// Przycisk leży w celi z kratek na piętrze (drzwi), kostka – na parterze, wyjście – w klatce z kwasem na parterze.
// Jedyne miejsca przyjmujące portale: spód płyty oraz biały pas pod dachem celi. Ani kostka, ani gracz nie
// wejdą do celi ani do klatki piechotą – kratki zatrzymują ciało, ale nie strzał.
//
// Rozwiązanie: pomarańczowy na dachu celi (przez kratkę z piętra) -> niebieski na suficie parteru, kostka rzucona
// w górę wypada z dachu celi na przycisk (drzwi!) -> niebieski w białe oczko nad klatką -> do celi, na kostkę
// (leży na przycisku, więc drzwi zostają otwarte), skok w portal na dachu -> lądowanie na wyspie z polem wyjścia.
export default {
  name: 'Dwa piętra',
  hint: 'Płyta między piętrami jest gruba, ale portale ją przecinają. Strzał przeleci przez kratkę – kostka i ty już nie.',
  spawn: { x: 6, y: 0, z: 13, yaw: 0 },
  exit: { x: 8.5, y: 0, z: -22.5 },
  build(L) {
    const C = 6;          // wysokość spodu płyty (sufit parteru)
    const F = C + 2;      // wierzch płyty = podłoga piętra
    L.room(-16, 16, -30, 16, 17, DARK_ALL);

    // ---- parter: ciemna podłoga z klatką: wyspa z polem wyjścia w jeziorze kwasu ----
    L.floor(-16, 16, -18, 16, 'dark');
    L.floor(-16, 16, -30, -27, 'dark');
    L.floor(-16, 4, -27, -18, 'dark');
    L.floor(13, 16, -27, -18, 'dark');
    L.pit(4, 13, -27, -18);
    L.box(6, -8, -25, 11, 0, -20, 'dark');                // wyspa 5 x 5 pod białym oczkiem
    // klatka (kratki do sufitu): widać i strzelać można, wejść nie
    L.box(3.7, 0, -27.3, 4.0, C, -17.7, 'grate');
    L.box(13.0, 0, -27.3, 13.3, C, -17.7, 'grate');
    L.box(4.0, 0, -27.3, 13.0, C, -27.0, 'grate');
    L.box(4.0, 0, -18.0, 13.0, C, -17.7, 'grate');
    L.fizzler(6, 0, -25, 11, 0.3, -20);                   // kostka, która spadnie na wyspę, wraca na start
    L.sign('WYJŚCIE', '', 5, 1.3, 8.5, 3.2, -29.95, 0);

    // ---- płyta: spód biały (portalowalny), wierzch ciemny; nad klatką sufit ciemny z białym oczkiem 4 x 4 ----
    L.box(-16, C, -18, 16, C + 1, -8, 'white');
    L.box(-16, C, -30, 16, C + 1, -27, 'white');
    L.box(-16, C, -27, 4, C + 1, -18, 'white');
    L.box(13, C, -27, 16, C + 1, -18, 'white');
    L.box(4, C, -27, 13, C + 1, -24.5, 'dark');
    L.box(4, C, -20.5, 13, C + 1, -18, 'dark');
    L.box(4, C, -24.5, 6.5, C + 1, -20.5, 'dark');
    L.box(10.5, C, -24.5, 13, C + 1, -20.5, 'dark');
    L.box(6.5, C, -24.5, 10.5, C + 1, -20.5, 'white');
    L.box(-16, C + 1, -30, 16, F, -8, 'dark');

    // ---- schody (ciemne, z jasnym brzegiem stopni – za małym, by przyjąć portal) ----
    const n = F / 0.5;
    for (let i = 1; i <= n; i++) {
      const z0 = -8 + (n - i);
      L.box(-16, 0, z0, -12, 0.5 * i, z0 + 1, 'dark');
      L.box(-16, 0.5 * i - 0.04, z0 + 0.72, -12, 0.5 * i + 0.05, z0 + 1, 'white');
    }
    L.sign('PIĘTRO', '↑', 3, 1.3, -15.95, 3.0, 6, -Math.PI / 2);
    // strop piętra i pełny blok nad nim (nad celą zostaje szczelina węższa niż kostka; na dach nic nie wyląduje)
    L.box(-16, F + 4.7, -30, 16, 17, -8, 'dark');
    L.sign('PARTER', '', 5, 0.8, 8, C + 1.5, -7.97, 0);
    L.sign('PIĘTRO', '', 5, 0.8, 8, F + 6.2, -7.97, 0);
    // niska balustrada na krawędzi piętra (nie da się z parteru strzelić nad krawędź)
    L.box(-12, F, -8.5, 16, F + 1.1, -8, 'dark');

    // ---- cela z przyciskiem (piętro) ----
    const H = 3.4;        // wysokość celi: z podłogi nie dosięgniesz portalu na dachu – trzeba stanąć na kostce
    L.box(-1.9, F, -25, 1.9, F + H + 1, -24, 'dark');   // ściana północna
    L.box(-1.9, F, -24, -1.6, F + H, -20.4, 'grate');   // ściana zachodnia
    L.box(-1.9, F, -20.4, 1.9, F + H, -20.1, 'grate');  // ściana południowa
    L.box(1.6, F, -24, 1.9, F + H, -23.2, 'grate');     // ściana wschodnia + drzwi
    L.box(1.6, F, -21.2, 1.9, F + H, -20.4, 'grate');
    L.box(1.6, F + 2.6, -23.2, 1.9, F + H, -21.2, 'grate');
    L.box(-1.9, F + H, -24, -1.6, F + H + 1, -20.1, 'dark');   // dach: ciemna ramka i biały pas od spodu
    L.box(1.6, F + H, -24, 1.9, F + H + 1, -20.1, 'dark');
    L.box(-1.6, F + H, -20.4, 1.6, F + H + 1, -20.1, 'dark');
    L.box(-1.6, F + H, -24, 1.6, F + H + 0.5, -20.4, 'white');
    L.box(-1.6, F + H + 0.5, -24, 1.6, F + H + 1, -20.4, 'dark');
    L.button('K', 0, -22.2, { y: F, r: 1.8 });
    L.door('K', 1.6, F, -23.2, 1.9, F + 2.6, -21.2);

    L.cube(-3, 0, 10);
  },
  solve(T) {
    const pl = T.game.player;
    const F = 8, H = 3.4;
    // 1) schodami na piętro
    T.walkTo(-14, 10);
    T.walkTo(-14, -9.5, 20);
    // 2) pomarańczowy na dachu celi (od spodu, przez kratkę)
    T.walkTo(0, -13);
    T.shoot(1, 0, F + H, -22.2);
    // 3) w dół schodami
    T.walkTo(-14, -9.5, 20);
    T.walkTo(-14, 10, 20);
    // 4) kostka pod sufit
    T.grab(0);
    T.walkTo(-2, -12, 20);
    T.shoot(0, -2, 6, -14);
    const b = T.portal(0).pos;
    T.creep(b[0], b[2]);
    T.release();
    T.face(0, 1.55);
    T.wait(0.2);
    T.throwCube();
    T.wait(2.5);
    T.assert(T.buttonPressed('K'), 'przycisk niewciśnięty');
    // 5) niebieski na suficie klatki
    T.walkTo(8.5, -15.5, 20);
    T.shoot(0, 8.5, 6, -22.5);
    // 6) znów na piętro, do celi przez otwarte drzwi
    T.walkTo(-14, 10, 20);
    T.walkTo(-14, -9.5, 20);
    T.walkTo(4, -22.2, 20);
    T.walkTo(1.3, -22.2, 4);
    // 7) portal na dachu jest za wysoko na samo skoczenie: wskocz na kostkę (leży na przycisku, więc drzwi zostają otwarte)
    const cube = T.cube(0);
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    let best = null;
    for (const [ux, uz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = cube.pos.x + ux * 0.85, z = cube.pos.z + uz * 0.85;
      if (x < -1.3 || x > 1.3 || z < -23.7 || z > -20.7) continue;
      const d = Math.hypot(x - pl.pos.x, z - pl.pos.z);
      if (!best || d < best.d) best = { x, z, d };
    }
    T.assert(best, 'brak miejsca przy kostce');
    T.creep(best.x, best.z);
    T.release();
    for (let i = 0; i < 160; i++) {
      const ex = cube.pos.x - pl.pos.x, ez = cube.pos.z - pl.pos.z, d = Math.hypot(ex, ez);
      if (d > 0.05) T.face(Math.atan2(-ex, -ez), 0);
      const sp = Math.hypot(pl.vel.x, pl.vel.z);
      T.run(1 / 120, { Space: i < 2 ? 1 : 0, KeyW: d > 0.45 && sp < 3 ? 1 : 0, KeyS: d < 0.55 && sp > 1 ? 1 : 0 }, null);
      if (i > 8 && pl.onGround) break;
    }
    T.wait(0.3);
    T.assert(pl.pos.y > 8.7, 'nie stoję na kostce');
    // 8) skok z kostki w portal na dachu
    let tele = false;
    for (let i = 0; i < 20 && !tele; i++) {
      T.jump();
      for (let k = 0; k < 120; k++) {
        const prev = pl.pos.clone();
        T.run(1 / 120, {}, null);
        if (pl.pos.distanceTo(prev) > 2) { tele = true; break; }
        if (pl.onGround) break;
      }
    }
    T.assert(tele, 'nie wszedłem w portal');
    T.land(5);
    T.walkTo(8.5, -22.5);
  },
};
