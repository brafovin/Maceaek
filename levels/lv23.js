import { DARK_ALL } from './util.js';

// Poziom 23 – „Dźwig”
//
// Budynek z czterech komór w rzędzie (oś z: start przy +z, wyjście przy -z). Każda następna komora ma podłogę
// wyżej, a przegrody między nimi mają kratowe okna (strzał przelatuje, gracz nie):
//   Hala startowa (podłoga 0 m,   dach 8,4)  – schody na podest 6 m, biała płyta; okno w stronę komory 1
//   Komora 1      (podłoga 4 m,   dach 14,2) – biały pas wzdłuż z; przy oknie półka na 9,5 m
//   Komora 2      (podłoga 9,5 m, dach 19,7) – biały pas wzdłuż x; przy oknie półka na 15 m
//   Komora 3      (podłoga 15 m,  dach 25,2) – biały pas wzdłuż z; za nim podest wyjścia na 19,5 m
// Okno zaczyna się na wysokości podłogi następnej komory, więc jej biały pas widać dopiero z półki albo z lotu –
// z własnej podłogi nie. Jedyne portalowalne powierzchnie to płyta w hali i trzy pasy (wąskie, 2,1 m: portal 2,3 m
// zmieści się tylko wzdłuż pasa, a o jego kierunku decyduje kierunek strzału).
//
// Dach każdej komory ogranicza energię lotu: dwa portale na podłodze pozwalają „pompować” wysokość (każdy przelot
// dodaje ok. 1,6 m – oczy przekraczają płaszczyznę portalu, a stopy wychodzą dokładnie na niej), więc bez dachów
// jedna para portali dałaby dowolną wysokość. Sufit nad każdą komorą = podłoga + 10,2 m.
//
// Rozwiązanie: schody -> podest 6 m: pas 1 (przez kratę) i płyta pod podestem -> skok -> lot na półkę 1 ->
// z półki pas 2 (strzał wzdłuż pasa, z dużej odległości) i portal na pasie 1 pod półką -> zeskok -> lot na półkę 2 ->
// pas 3 i portal na pasie 2 -> zeskok -> lot nad komorą 3 na podest wyjścia.
const FLOOR = [0, 4, 9.5, 15];
const CAP = 8.4;              // maks. wysokość stóp nad podłogą komory (dach = podłoga + CAP + 1,8)
const EXIT_Y = 19.5;
const X0 = -12, X1 = 8;

export default {
  name: 'Dźwig',
  hint: 'Wejście nisko, wyjście wysoko – im głębszy zeskok, tym wyżej wylecisz. Co jest za oknem, widać dopiero z góry, a wąski pas przyjmie portal tylko wzdłuż.',
  spawn: { x: 3, y: 0, z: 19, yaw: 0 },
  exit: { x: -2, y: EXIT_Y, z: -33 },
  build(L) {
    const R1 = FLOOR[1] + CAP + 1.8, R2 = FLOOR[2] + CAP + 1.8, R3 = FLOOR[3] + CAP + 1.8;
    const R0 = CAP;
    L.room(X0, X1, -36, 24, R3, DARK_ALL);

    // podłoga komory z białym pasem [lx0,lx1,lz0,lz1] zagnieżdżonym w ciemnej płycie
    const cellFloor = (z0, z1, top, lane) => {
      const [a, b, c, d] = lane;
      L.box(X0, -8, z0, a, top, z1, 'dark');
      L.box(b, -8, z0, X1, top, z1, 'dark');
      L.box(a, -8, z0, b, top, c, 'dark');
      L.box(a, -8, d, b, top, z1, 'dark');
      L.box(a, -8, c, b, top, d, 'floor');
    };
    // przegroda [z0,z1] z kratowym oknem [winLo,winHi] (krata 0,3 m w środku grubości)
    const wall = (z0, z1, winLo, winHi, top) => {
      L.box(X0, -8, z0, X1, winLo, z1, 'dark');
      L.box(X0, winHi, z0, X1, top, z1, 'dark');
      const m = (z0 + z1) / 2;
      L.box(X0, winLo, m - 0.15, X1, winHi, m + 0.15, 'grate');
    };

    // ---- hala startowa ----
    cellFloor(8, 24, 0, [-7.5, -1, 9.5, 16]);
    for (let i = 1; i <= 11; i++) L.box(-12, 0, 12.5 + 0.8 * (11 - i), -7.5, 0.5 * i, 12.5 + 0.8 * (12 - i), 'dark');
    L.box(-12, 0, 8, -7.5, 6, 12.5, 'dark');                       // podest 6 m
    L.box(X0, R0, 8, X1, R0 + 1, 24, 'dark');                       // dach hali
    wall(7, 8, FLOOR[1], R0, R1);

    // ---- komora 1 (półka 1: z -7 … -5,4 na 9,5 m) ----
    cellFloor(-5.4, 7, FLOOR[1], [-10.5, -8.4, -4.5, 1.8]);
    L.box(X0, R1, -7, X1, R1 + 1, 7, 'dark');
    L.box(X0, -8, -8, X1, FLOOR[2], -5.4, 'dark');                  // przegroda + półka
    L.box(X0, R1, -8, X1, R2, -7, 'dark');                          // nad oknem
    L.box(X0, FLOOR[2], -7.65, X1, R1, -7.35, 'grate');             // okno 1 (9,5 … 14,2)

    // ---- komora 2 (półka 2: z -17 … -15,4 na 15 m) ----
    cellFloor(-15.4, -8, FLOOR[2], [-9, 7, -13.05, -10.95]);
    L.box(X0, R2, -17, X1, R2 + 1, -8, 'dark');
    L.box(X0, -8, -18, X1, FLOOR[3], -15.4, 'dark');
    L.box(X0, R2, -18, X1, R3, -17, 'dark');
    L.box(X0, FLOOR[3], -17.65, X1, R2, -17.35, 'grate');           // okno 2 (15 … 19,7)

    // ---- komora 3 + podest wyjścia ----
    cellFloor(-36, -18, FLOOR[3], [0.1, 2.2, -27, -20.5]);
    L.box(X0, FLOOR[3], -36, X1, EXIT_Y, -30, 'dark');

    // ---- tablice ----
    L.sign('DŹWIG', 'wyjście: 19,5 m nad podłogą', 7.5, 1.8, -3, 2.1, 8.02, 0);
    L.sign('WYJŚCIE ▲', '19,5 m wyżej', 6, 1.6, -3, 7.2, -5.38, 0);
    L.sign('WYJŚCIE ▲', '10 m wyżej', 6, 1.6, -3, 12.4, -15.38, 0);
    L.sign('WYJŚCIE ▲', 'jeszcze 4,5 m w górę', 6, 1.6, -3, 17.4, -29.98, 0);
    L.sign('PODŁOGA 0', 'start', 3.4, 1.2, X0 + 0.02, 2.6, 22.6, -Math.PI / 2);
    L.sign('PIĘTRO 1', '4 m', 3.4, 1.2, X0 + 0.02, FLOOR[1] + 2.4, 0, -Math.PI / 2);
    L.sign('PIĘTRO 2', '9,5 m', 3.4, 1.2, X0 + 0.02, FLOOR[2] + 2.4, -12, -Math.PI / 2);
    L.sign('PIĘTRO 3', '15 m', 3.4, 1.2, X0 + 0.02, FLOOR[3] + 2.4, -25, -Math.PI / 2);
  },
  solve(T) {
    const g = T.game, pl = g.player;
    // sterowanie poziome (na ziemi i w powietrzu): dojdź/doleć do (tx,tz) z ograniczeniem prędkości
    const steer = (tx, tz, vmax = 6) => {
      const dx = tx - pl.pos.x, dz = tz - pl.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.05) { g.keys.KeyW = g.keys.KeyS = g.keys.ShiftLeft = false; return d; }
      pl.yaw = Math.atan2(-dx, -dz);
      const want = Math.min(vmax, d * 3);
      const cur = (pl.vel.x * dx + pl.vel.z * dz) / d;
      g.keys.KeyW = cur < want - 0.3; g.keys.KeyS = cur > want + 0.3;
      g.keys.ShiftLeft = vmax > 6;
      return d;
    };
    // wpadnij w portal i (z góry): steruj nad otwór aż do teleportacji
    const fallInto = (i) => {
      const Q = T.portal(i);
      const prev = pl.pos.clone();
      for (let k = 0; k < 900; k++) {
        steer(Q.pos[0], Q.pos[2], pl.onGround ? 2.5 : 6);
        g.step(T.DT);
        if (pl.pos.distanceTo(prev) > 2) { T.release(); return true; }
        prev.copy(pl.pos);
      }
      T.release();
      return false;
    };
    // wyskocz z portalu i leć (biegnij) do punktu, aż staniesz na ziemi
    const flyTo = (tx, tz) => {
      for (let k = 0; k < 1500; k++) {
        steer(tx, tz, 10);
        g.step(T.DT);
        if (pl.onGround && k > 20) break;
      }
      T.release();
      T.wait(0.4);
    };

    // ---- 1. hala: podest 6 m; pas komory 1 widać przez kratę, płytę pod sobą ----
    T.walkTo(-10, 22.5, 12);
    T.walkTo(-10, 10.5, 25);
    T.walkTo(-7.8, 10.5, 5); T.wait(0.5);
    T.shoot(1, -9.45, 4, -3.0);                   // pas 1, jego północny koniec (bliżej półki)
    T.shoot(0, -4.6, 0, 11.5);                    // płyta tuż pod podestem
    T.assert(fallInto(0), 'nie wpadłem w portal pod podestem');

    // ---- 2. lot na półkę 1; stąd widać pas 2 (strzał wzdłuż x, z daleka) i pas 1 pod półką ----
    flyTo(-9.5, -6.2);
    T.assert(Math.abs(pl.pos.y - FLOOR[2]) < 0.05, 'nie wylądowałem na półce 1: ' + JSON.stringify(T.st()));
    T.walkTo(-9.5, -5.7, 5); T.wait(0.5);         // do samej krawędzi, żeby zajrzeć na podłogę niżej
    T.shoot(1, 4.5, 9.5, -12.0);                  // pas 2: strzał z zachodu, wzdłuż pasa
    T.assert(Math.abs(T.portal(1).up[0]) > 0.9, 'pas 2 wymaga portalu ustawionego wzdłuż x');
    T.shoot(0, -9.45, 4, -3.0);                   // pas 1 pod półką (patrząc wzdłuż z)
    T.assert(fallInto(0), 'nie zeskoczyłem w portal na pasie 1');

    // ---- 3. lot na półkę 2; stąd widać pas 3 (wzdłuż z) i pas 2 pod półką (strzał wzdłuż x) ----
    flyTo(3, -16.0);
    T.assert(Math.abs(pl.pos.y - FLOOR[3]) < 0.05, 'nie wylądowałem na półce 2: ' + JSON.stringify(T.st()));
    T.walkTo(pl.pos.x, -15.7, 5); T.wait(0.5);
    T.shoot(1, 1.15, 15, -24);
    const hx = pl.pos.x > 0 ? pl.pos.x - 6.5 : pl.pos.x + 6.5;    // dziura w pasie 2 w bok od miejsca, w którym stoisz
    T.shoot(0, hx, 9.5, -12.0);
    T.assert(Math.abs(T.portal(0).up[0]) > 0.9, 'pas 2 wymaga portalu ustawionego wzdłuż x');
    T.walkTo(T.portal(0).pos[0], -15.7, 8); T.wait(0.3);       // idź półką nad dziurę i zeskocz
    T.assert(fallInto(0), 'nie zeskoczyłem w portal na pasie 2');

    // ---- 4. lot nad komorą 3: na podest wyjścia ----
    flyTo(-2, -33);
    T.walkTo(-2, -33, 8);
    T.wait(0.3);
  },
};
