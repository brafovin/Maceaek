import { DARK_ALL } from './util.js';

// Poziom 26 – „Wieża Babel”
//
// Pionowy szyb 14 x 14 m, wyjście na wysokości 54 m. Jedynym źródłem energii jest pętla: portal w podłodze
// i drugi nad nim (w suficie piętra) – spadek przez taką parę nabiera prędkości bez końca. W locie można
// przestawić jeden z portali tam, skąd chcemy wystartować (wyrzut w górę albo poziomy z zachowaniem pędu).
// Każda półka ma nad sobą masywny strop, który kończy wybicie w górę – wyżej da się wejść tylko przez
// kolejny etap. Ścianę z łatką W zasłania ciemna masa P3: widać ją dopiero z wysokości ponad ~39 m.
//
//  P0 (y=0)    parter: półka startowa na południu, pas pod P1 na wschodzie, łatki na podłodze
//  P1 (y=12)   północ; spód ma białą łatkę (sufit pętli 1), na wierzchu łatka wyrzutu, przycisk S i kostka K2
//  P2 (y=28)   południe; spód ma łatkę (sufit pętli 2), na wierzchu łatka pętli 3 i przycisk B2
//  P3 (y=51.5) północ: ciemna masa, zasłania północną ścianę z łatką W przed graczami z niższych pięter
//  P4 (y=54)   południe: wyjście; spód ma łatkę (sufit pętli 3)
//
// Etapy:
//  1. pętla pod P1 (podłoga pasa + spód P1), potem w locie pomarańczowy na łatkę parteru (wyrzut) – na P1;
//     po drodze zabieramy kostkę K1 ze startu
//  2. K1 na przycisk S – otwiera zapadnię nad łatką w podłodze pod P2. Pętla: łatka parteru <-> spód P2
//     (spadek 25 m), w locie niebieski na łatkę P1 (z góry ją widać) – wyrzut na P2 (z kostką K2 z półki P1)
//  3. K2 na przycisk B2 – otwiera zapadnię nad łatką na P2. Pętla: P2 <-> spód P4; w locie (dopiero z wysoka
//     widać) łatka W na północnej ścianie; wylot poziomy przez kurtynę fizzlera na P4.
export default {
  name: 'Wieża Babel',
  hint: 'Po schodach tu nie wejdziesz: szyb ma kilkadziesiąt metrów. Podłoga i sufit nad nią to studnia bez dna – a w locie można przestawić portal. Zapadnie w szybie trzyma otwarte tylko ciężar kostki.',
  spawn: { x: 3.5, y: 0, z: 5.5, yaw: 0 },
  exit: { x: -2, y: 54, z: 4.5 },
  build(L) {
    const Y1 = 12, Y2 = 28, Y3 = 51.5, Y4 = 54, ZF = 1.5;   // ZF: południowa krawędź środkowej szczeliny

    // podział prostokąta na pasy i łatki: mk(x0,x1,z0,z1,czyŁatka)
    const tile = (x0, x1, z0, z1, patches, mk) => {
      const ps = patches.map(p => [Math.max(p[0], x0), Math.min(p[1], x1), Math.max(p[2], z0), Math.min(p[3], z1)]);
      const xs = [...new Set([x0, x1, ...ps.flatMap(p => [p[0], p[1]])])].sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i++) {
        const xa = xs[i], xb = xs[i + 1];
        const iv = ps.filter(p => p[0] <= xa + 1e-9 && p[1] >= xb - 1e-9).sort((a, b) => a[2] - b[2]);
        let z = z0;
        for (const p of iv) {
          if (p[2] > z + 1e-9) mk(xa, xb, z, p[2], false);
          mk(xa, xb, p[2], p[3], true);
          z = p[3];
        }
        if (z1 > z + 1e-9) mk(xa, xb, z, z1, false);
      }
    };
    // płyta z białą łatką na wierzchu (łatka na całej grubości – gracz wpadający z dużą prędkością nie może
    // zderzyć się z czymś pod otworem, zanim portal go przeniesie)
    const slab = (yb, yt, x0, x1, z0, z1, patches) => tile(x0, x1, z0, z1, patches, (xa, xb, za, zb, w) => {
      L.box(xa, yb, za, xb, yt, zb, w ? 'white' : 'dark');
    });
    // cienka biała łatka przyklejona do spodu płyty
    const under = (yb, x0, x1, z0, z1) => L.box(x0, yb - 0.4, z0, x1, yb, z1, 'white');

    L.room(-7, 7, -7, 7, 68, DARK_ALL);
    L.pit(-7, 7, -7, 7);

    // ---- P0: parter (y = 0) ----
    tile(-7, 1, -1.5, 7, [[-6, -2, -1.3, 1.3], [-6.5, -1.5, ZF + 0.3, 6.2]], (xa, xb, za, zb, w) => L.floor(xa, xb, za, zb, w ? 'floor' : 'dark'));
    tile(1, 7, -7, 7, [[2.5, 6.5, -6.2, -2.8]], (xa, xb, za, zb, w) => L.floor(xa, xb, za, zb, w ? 'floor' : 'dark'));

    // ---- P1 (y = 12), północ ----
    slab(Y1 - 2, Y1, -7, 7, -7, -2.5, [[-6.5, -1.5, -6.2, -2.8]]);
    under(Y1 - 2, 2.5, 6.5, -6.2, -2.8);                       // sufit pętli 1

    // ---- P2 (y = 28), południe ----
    slab(Y2 - 2, Y2, -7, 7, ZF, 7, [[1.5, 6.5, ZF + 0.3, 6.2]]);
    under(Y2 - 2, -6.5, -1.5, ZF + 0.3, 6.2);                  // spód P2: sufit pętli 2
    L.door('S', -6.5, 13.8, ZF + 0.3, -1.5, 14.2, 6.2);        // zapadnia w klatce, nad łatką podłogi

    // ---- stropy nad środkiem szybu: zatrzymują wybicie w górę (dwa niższe pełne, najwyższy kratowy) ----
    L.box(-7, 23.5, -2.5, 7, 25.5, ZF, 'dark');                // nad parterem (wyrzut z parteru kończy się tu)
    L.box(-7, 33.5, -7, 7, 35.5, ZF, 'dark');                   // nad P1
    L.box(-7, 55, -7, 7, 55.3, ZF, 'grate');                   // nad P3 (strzał do łatki W przelatuje przez kratkę)

    // ---- P3: ciemna masa na północy (zasłania ścianę W) ----
    L.box(-7, Y3 - 2.4, -7, 7, Y3, -2.5, 'dark');

    // ---- P4 (y = 54), południe: wyjście; spód z łatką pętli 3 ----
    L.box(-7, Y4 - 2.4, ZF, 7, Y4, 7, 'dark');
    under(Y4 - 2.4, 1.5, 6.5, ZF + 0.3, 6.2);
    L.door('B2', 1.5, 39.8, ZF + 0.3, 6.5, 40.2, 6.2);         // zapadnia nad łatką na P2

    // ---- W: łatka na północnej ścianie, kurtyna fizzlera nad szybem ----
    L.box(-4, 58.75, -7, 4, 61.25, -6.6, 'white');
    L.fizzler(-7, 55.6, -0.05, 7, 66, 0.05);

    L.button('S', 4.5, -4.5, { y: Y1 });
    L.button('B2', -3.5, 5.2, { y: Y2 });
    L.cube(5.5, 0, 4);              // K1: na starcie
    L.cube(6.2, Y1, -3.6);          // K2: na półce P1

    L.sign('SZCZYT', 'wyjście: 54 m wyżej', 8, 2.2, 0, 24, -6.95, 0);
    L.sign('S', 'zapadnia pod P2', 4.5, 1.5, 4.5, 15.6, -6.95, 0);
    L.sign('ZAPADNIA', 'otwiera ją przycisk S', 6, 1.9, -6.95, 8, 4.5, Math.PI / 2);
    L.sign('B2', 'zapadnia nad łatką', 4.5, 1.5, -3.5, 31.6, 6.95, Math.PI);
    L.sign('ZAPADNIA', 'otwiera ją przycisk B2', 6, 1.9, 6.95, 38, 4.5, -Math.PI / 2);
  },
  solve(T) {
    const g = T.game, pl = g.player, DT = T.DT;
    const stop = () => { const k = g.keys; k.KeyW = k.KeyS = k.KeyA = k.KeyD = k.ShiftLeft = false; };
    // sterowanie w powietrzu klawiszami (patrząc na północ): leć ku (tx,tz)
    const steer = (tx, tz) => {
      pl.yaw = 0;
      const cl = (v) => Math.max(-10, Math.min(10, v));
      const wx = cl((tx - pl.pos.x) * 2.5) - pl.vel.x, wz = cl((tz - pl.pos.z) * 2.5) - pl.vel.z, k = g.keys;
      k.KeyW = wz < -0.7; k.KeyS = wz > 0.7; k.KeyA = wx < -0.7; k.KeyD = wx > 0.7; k.ShiftLeft = true;
    };
    // leć/spadaj sterując ku (tx,tz); true = nastąpiła teleportacja; false = until() albo koniec czasu
    const fly = (tx, tz, until, maxSec = 8) => {
      const prev = pl.pos.clone();
      for (let i = 0; i < maxSec / DT; i++) {
        steer(tx, tz);
        g.step(DT);
        if (pl.pos.distanceTo(prev) > 2) { stop(); return true; }
        if (until && until()) { stop(); return false; }
        prev.copy(pl.pos);
      }
      stop();
      return false;
    };

    // ===== Etap 1: pętla pod P1, wyrzut z łatki na parterze =====
    T.walkTo(5, 3.4);
    T.grab(0);                                   // kostka K1 jedzie na piętro
    T.walkTo(3.5, 4, 4); T.face(0, 0);
    T.shoot(0, 4.5, 0, -4.5);                    // niebieski: podłoga pod P1
    T.shoot(1, 4.5, 9.6, -4.5);                  // pomarańczowy: spód P1
    const F = T.portal(0).pos;
    T.assert(T.walkThrough(0), 'nie wszedłem w portal pod P1');
    T.face(0, 0);
    T.assert(fly(F[0], F[2]), 'pętla: brak powrotu do portalu');   // pierwsze okrążenie
    T.shoot(1, -4, 0, 0.1);                      // w locie: pomarańczowy na łatkę parteru
    T.assert(fly(F[0], F[2]), 'pętla: brak wyrzutu');
    fly(-4, -4.5, () => pl.onGround, 6);         // lot ku półce P1
    T.assert(pl.pos.y > 11.5, 'nie wylądowałem na P1: ' + JSON.stringify(T.st()));

    // ===== Etap 2: kostka na przycisk (zapadnia), długi spadek spod P2 =====
    T.walkTo(4.5, -2.8, 6);
    T.face(0, -0.45); T.wait(0.5);
    T.drop(); T.wait(1.2);                       // K1 na przycisk S: otwiera zapadnię nad łatką w podłodze pod P2
    T.assert(T.buttonPressed('S'), 'przycisk S niewciśnięty');
    T.walkTo(-3, -3.2, 6); T.face(0, 0);
    T.shoot(0, -4, 25.6, 4.5);                   // niebieski: spód P2 (sufit drugiej pętli)
    T.grab(1);                                   // K2 – ta kostka pojedzie na P2
    T.walkTo(-3, -2.7, 3);
    T.face(Math.PI, 0);
    T.run(1.5, { KeyW: 1, ShiftLeft: 1 }, () => pl.onGround && pl.pos.y < 1);   // zeskok z P1 na południe
    T.land(6);
    T.assert(pl.pos.y < 1 && pl.pos.z > -1.6, 'zeskok nieudany: ' + JSON.stringify(T.st()));
    T.walkTo(3.5, 1.2, 8);
    T.face(0, 0);
    T.shoot(1, -4, 0, 4.5);                      // pomarańczowy: łatka w podłodze pod P2 (nad nią zapadnia)
    T.walkTo(3.5, 4, 4);
    const F2 = T.portal(1).pos;
    T.face(0, 0);
    T.assert(T.walkThrough(1), 'nie wszedłem w portal pod P2');
    T.face(0, 0);
    T.shoot(0, -4, 12, -3.9);                    // w locie: niebieski na półkę P1 (widać ją z góry)
    T.assert(fly(F2[0], F2[2]), 'brak wejścia w portal pod P2');
    fly(-1, 4.8, () => pl.onGround, 6);          // wybicie – dryf na południe, na P2
    T.assert(pl.pos.y > 27.5, 'nie wylądowałem na P2: ' + JSON.stringify(T.st()));
    T.assert(g.mech.held, 'kostka powinna być w rękach');

    // ===== Etap 3: kostka na B2, pętla pod P4, wylot poziomy z północnej ściany przez kurtynę =====
    T.walkTo(-3.5, 3.2, 4); T.face(Math.PI, -0.3); T.wait(0.5);
    T.drop(); T.wait(1.2);                       // K2 na przycisk B2: otwiera zapadnię nad łatką na P2
    T.assert(T.buttonPressed('B2'), 'przycisk B2 niewciśnięty');
    T.walkTo(0.5, 4.8, 4); T.face(-Math.PI / 2, 0);
    T.shoot(0, 4, 28, 4.5);                      // niebieski: podłoga P2
    T.shoot(1, 4, 51.2, 4.5);                    // pomarańczowy: spód P4
    const F3 = T.portal(0).pos;
    T.assert(T.walkThrough(0), 'nie wszedłem w portal na P2');
    T.face(0, 0);
    fly(F3[0], F3[2], () => pl.pos.y < 44, 4);   // spadek; północną ścianę widać dopiero z wysoka
    T.shoot(1, 0, 60, -7);                       // pomarańczowy: wysoko na północnej ścianie
    T.assert(fly(F3[0], F3[2]), 'brak wejścia w portal na P2');
    fly(-2, 4.5, () => pl.onGround, 6);
    T.walkTo(-2, 4.5, 6);
  },
};
