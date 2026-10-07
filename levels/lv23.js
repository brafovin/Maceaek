import { DARK_ALL } from './util.js';

// Poziom 23 – „Dźwig”
//
// Budynek z czterech komór w rzędzie (oś z: start przy +z, wyjście przy -z). Każda następna komora ma podłogę
// wyżej, a przegrody między nimi mają bardzo wysoko osadzone kratowe okna (strzał przelatuje, gracz nie):
//   Hala startowa (podłoga 0 m,   dach 8,4)   – schody na podest 6 m, biała płyta; okno w stronę komory 1 (od 4 m)
//   Komora 1      (podłoga 4 m,   dach 15,8)  – biały pas wzdłuż z; półka 8 m; okno od 13,4 m
//   Komora 2      (podłoga 9,5 m, dach 25,1)  – biały pas wzdłuż x; półka 14,5 m; okno od 22,5 m
//   Komora 3      (podłoga 15 m,  dach 25,8)  – biały pas wzdłuż z; za nim podest wyjścia na 19,5 m
// Kraty okien przylegają do ściany od strony gracza (bez parapetu, na którym dałoby się stanąć), a ściana pod nimi jest
// ciemna. Biały pas następnej komory widać dopiero z lotu: oczy wyżej niż ok. 14,6 m (pas 2) i ok. 23,7 m (pas 3).
// Jedyne portalowalne powierzchnie to płyta w hali i trzy pasy (wąskie, 2,1 m: portal 2,3 m zmieści się tylko
// wzdłuż pasa, a o jego kierunku decyduje kierunek strzału).
//
// Energia lotu: wpadnięcie w portal z wysokości h daje wylot z pędem odpowiadającym h (+1,6 m, bo oczy przekraczają
// płaszczyznę portalu), więc wylot na wyższej podłodze wznosi o różnicę poziomów wyżej, a dwa portale na jednym pasie
// pozwalają „pompować” (każdy przelot +1,6 m). Granicę wyznacza dach komory: stopy najwyżej na 6,6 m w hali, 14,0 m
// w komorze 1, 23,3 m w komorze 2 i 24,0 m w komorze 3. Hala ma niski dach, więc pętla płyta <-> pas 1 daje w komorze 1
// tylko 12,1 m – tyle samo co skok z krawędzi podestu.
//   Etap 1: apeks ze skoku z podestu (12,1 m) < 12,9 m (próg widoczności pasa 2) -> pompowanie na pasie 1 (dwa portale
//           na jednym pasie) do dachu (14,0 m) i strzał w pas 2 w locie, tuż przy oknie.
//   Etap 2: zeskok z apeksu etapu 1 daje w komorze 2 tylko ok. 21,1 m < 22,0 m (próg pasa 3) -> drugi portal też na pas 2
//           i pompowanie do dachu (23,3 m), strzał w pas 3 w locie przy oknie 2.
//   Etap 3: półka 2 -> rozbieg i zeskok w pas 2 -> wylot z pasa 3 -> lot nad komorą 3 na podest wyjścia.
//
// Rozwiązanie: schody -> podest 6 m: pas 1 (przez kratę) i płyta pod podestem -> wpadnij w płytę -> w locie przenieś
// portal na północny koniec pasa 1 -> pompuj -> pod dachem, przy oknie 1: portal na pasie 2 (wzdłuż pasa) -> zeskok
// w pas 1 -> drugi portal na pasie 2, pompuj -> pod dachem, przy oknie 2: portal na pasie 3 -> półka 2 -> zeskok
// w pas 2 -> lot na podest wyjścia.
const FLOOR = [0, 4, 9.5, 15];
const CAPS = [8.4, 10.0, 13.8, 9.0];  // dach = podłoga + CAP + 1,8 (stopy najwyżej: podłoga + CAP; w hali dach = CAP[0])
const W1 = 13.4, W2 = 22.5;   // dolne krawędzie okien 1 i 2 (kraty zaczynają się bardzo wysoko ponad półką)
const S1 = 8.0, S2 = 14.5;    // półki przy oknach (poniżej podłogi następnej komory)
const EXIT_Y = 19.5;
const X0 = -12, X1 = 8;

export default {
  name: 'Dźwig',
  hint: 'Okna są osadzone wysoko – co leży za nimi, zobaczysz tylko z lotu. Wysokość lotu ogranicza dopiero dach, a portal możesz przestawić, nim spadniesz.',
  spawn: { x: 3, y: 0, z: 19, yaw: 0 },
  exit: { x: -2, y: EXIT_Y, z: -33 },
  build(L) {
    const R1 = FLOOR[1] + CAPS[1] + 1.8, R2 = FLOOR[2] + CAPS[2] + 1.8, R3 = FLOOR[3] + CAPS[3] + 1.8;
    const R0 = CAPS[0];
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
    const wall = (z0, z1, winLo, winHi, top, g0 = (z0 + z1) / 2 - 0.15, g1 = (z0 + z1) / 2 + 0.15) => {
      L.box(X0, -8, z0, X1, winLo, z1, 'dark');
      L.box(X0, winHi, z0, X1, top, z1, 'dark');
      L.box(X0, winLo, g0, X1, winHi, g1, 'grate');
    };

    // ---- hala startowa ----
    cellFloor(8, 24, 0, [-7.5, -1, 9.5, 16]);
    for (let i = 1; i <= 11; i++) L.box(-12, 0, 12.5 + 0.8 * (11 - i), -7.5, 0.5 * i, 12.5 + 0.8 * (12 - i), 'dark');
    L.box(-12, 0, 8, -7.5, 6, 12.5, 'dark');                       // podest 6 m
    L.box(X0, R0, 8, X1, R0 + 1, 24, 'dark');                       // dach hali
    wall(7, 8, FLOOR[1], R0, R1, 7.7, 8);   // krata przy samej hali – bez wąskiego „balkonu”

    // ---- komora 1 (półka 1: z -7 … -5,4 na S1) ----
    cellFloor(-5.4, 7, FLOOR[1], [-10.5, -8.4, -4.5, 1.8]);
    L.box(X0, R1, -7, X1, R1 + 1, 7, 'dark');
    L.box(X0, -8, -8, X1, W1, -7, 'dark');                          // przegroda (ściana pod oknem 1, bez parapetu)
    L.box(X0, -8, -7, X1, S1, -5.4, 'dark');                        // półka 1
    L.box(X0, R1, -8, X1, R2, -7, 'dark');                          // nad oknem
    L.box(X0, W1, -7.3, X1, R1, -7, 'grate');                       // okno 1 (W1 … dach), krata równo z powierzchnią ściany

    // ---- komora 2 (półka 2: z -17 … -15,9 na S2) ----
    cellFloor(-15.9, -8, FLOOR[2], [-9, 7, -13.05, -10.95]);
    L.box(X0, R2, -17, X1, R2 + 1, -8, 'dark');
    L.box(X0, -8, -18, X1, W2, -17, 'dark');                        // przegroda (ściana pod oknem 2, bez parapetu)
    L.box(X0, -8, -17, X1, S2, -15.9, 'dark');                      // półka 2
    L.box(X0, R2, -18, X1, R3, -17, 'dark');
    L.box(X0, W2, -17.3, X1, R2, -17, 'grate');                     // okno 2 (W2 … dach), krata równo z powierzchnią ściany

    // ---- komora 3 + podest wyjścia ----
    cellFloor(-36, -18, FLOOR[3], [0.1, 2.2, -27, -20.5]);
    L.box(X0, FLOOR[3], -36, X1, EXIT_Y, -30, 'dark');
    L.box(X0, R3 - 0.12, -36, X1, R3, -18, 'dark');                 // przykrywa lampy: przez kratę wyglądałyby jak białe płytki

    // ---- tablice ----
    L.sign('DŹWIG', 'wyjście: 19,5 m nad podłogą', 7.5, 1.8, -3, 2.1, 8.02, 0);
    L.sign('WYJŚCIE ▲', '15,5 m wyżej', 6, 1.6, -3, 7.2, -5.38, 0);
    L.sign('WYJŚCIE ▲', '10 m wyżej', 6, 1.6, -3, 12.4, -15.88, 0);
    L.sign('WYJŚCIE ▲', 'jeszcze 4,5 m w górę', 6, 1.6, -3, 17.4, -29.98, 0);
    L.sign('PODŁOGA 0', 'start', 3.4, 1.2, X0 + 0.02, 2.6, 22.6, -Math.PI / 2);
    L.sign('PIĘTRO 1', '4 m', 3.4, 1.2, X0 + 0.02, FLOOR[1] + 2.4, 0, -Math.PI / 2);
    L.sign('PIĘTRO 2', '9,5 m', 3.4, 1.2, X0 + 0.02, FLOOR[2] + 2.4, -12, -Math.PI / 2);
    L.sign('PIĘTRO 3', '15 m', 3.4, 1.2, X0 + 0.02, FLOOR[3] + 2.4, -25, -Math.PI / 2);
  },
  solve(T) {
    const g = T.game, pl = g.player;
    // sterowanie poziome (na ziemi i w powietrzu): dojdź/doleć do (tx,tz) z ograniczeniem prędkości
    const steer = (tx, tz, vmax = 6, nobrake = false) => {
      const dx = tx - pl.pos.x, dz = tz - pl.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.05) { g.keys.KeyW = g.keys.KeyS = g.keys.ShiftLeft = false; return d; }
      pl.yaw = Math.atan2(-dx, -dz);
      const want = Math.min(vmax, d * 3);
      const cur = (pl.vel.x * dx + pl.vel.z * dz) / d;
      g.keys.KeyW = cur < want - 0.3; g.keys.KeyS = !nobrake && cur > want + 0.3;
      g.keys.ShiftLeft = vmax > 6;
      return d;
    };
    // wpadnij w portal i (z góry): steruj nad otwór aż do teleportacji
    const fallInto = (i, vair = 6, vgnd = 2.5, nobrake = false) => {
      const Q = T.portal(i);
      const prev = pl.pos.clone();
      for (let k = 0; k < 900; k++) {
        steer(Q.pos[0], Q.pos[2], pl.onGround ? vgnd : vair, nobrake);
        g.step(T.DT);
        if (pl.pos.distanceTo(prev) > 2) { T.release(); return true; }
        prev.copy(pl.pos);
      }
      T.release();
      return false;
    };
    // lecąc do (tx,tz), próbuj co chwilę postawić portal `i` na pasie [tx,y,tz] (z pozycji w locie);
    // zwraca true, gdy się udało (wtedy leć dalej). `ok` – dodatkowy warunek na pozycję/wysokość.
    const peekShoot = (i, targets, tx, tz, vmax, maxSteps, ok = () => true) => {
      for (let k = 0; k < maxSteps; k++) {
        steer(tx, tz, vmax);
        g.step(T.DT);
        if (pl.onGround) break;
        if (k % 4 === 0 && ok()) {
          const t = targets[(k / 4) % targets.length | 0];
          if (T.shoot(i, t[0], t[1], t[2], { allowFail: true })) { T.release(); return true; }
        }
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
    // wzlot z portalu `E` (aż do apeksu): nad portalem albo – gdy `toward` – w stronę okna (z = tz)
    const ascend = (E, tz = null) => {
      const Q = T.portal(E);
      for (let k = 0; k < 900 && pl.vel.y > 0; k++) {
        if (tz !== null) steer(Q.pos[0], tz, 10); else steer(Q.pos[0], Q.pos[2], 3);
        g.step(T.DT);
      }
    };

    // ---- 1. hala: podest 6 m; pas komory 1 widać przez kratę, płytę pod sobą ----
    T.walkTo(-10, 22.5, 12);
    T.walkTo(-10, 10.5, 25);
    T.walkTo(-7.8, 10.5, 5); T.wait(0.5);
    T.shoot(1, -9.45, 4, 0.5);                    // pas 1, jego południowa część (strzał wzdłuż pasa)
    T.shoot(0, -4.6, 0, 11.5);                    // płyta tuż pod podestem
    T.assert(fallInto(0), 'nie wpadłem w portal pod podestem');

    // ---- 2. komora 1: sam zeskok z podestu (apeks 12,1 m) nie wystarcza, by zajrzeć w okno 1 – pompowanie na pasie 1 ----
    // w locie przenieś niebieski portal z płyty na północny koniec pasa 1 (ten sam kierunek co pomarańczowy)
    let placed = false;
    for (const z of [-3.6, -3.3, -3.9, -3.5]) if (!placed) placed = T.shoot(0, -9.45, 4, z, { allowFail: true });
    T.assert(placed, 'nie postawiłem drugiego portalu na pasie 1');
    T.assert(Math.abs(T.portal(0).up[2]) > 0.9 && Math.abs(T.portal(1).up[2]) > 0.9, 'pas 1 wymaga portali wzdłuż z');
    const lane2 = [[4.5, 9.5, -12.8], [2, 9.5, -12.6], [-3, 9.5, -12.8], [6, 9.5, -12.7]];
    let E = 1;                                   // portal, z którego właśnie wyleciałeś
    let seen2 = false;
    for (let pass = 0; pass < 12 && !seen2; pass++) {
      const north = T.portal(0).pos[2] < T.portal(1).pos[2] ? 0 : 1;
      const apex = pl.pos.y + pl.vel.y * pl.vel.y / 48;
      if (E === north && apex > 13.7) {
        // wzlot pod sam dach, przy oknie: pas 2 widać – strzał wzdłuż x drugim portalem
        const Q = T.portal(E);
        seen2 = peekShoot(1 - E, lane2, Q.pos[0], -6.4, 10, 600, () => pl.pos.z < -5.4 && pl.pos.y > 12.9);
        T.assert(seen2, 'nie widziałem pasa 2 z apeksu: ' + JSON.stringify(T.st()));
        break;
      }
      ascend(E);
      T.assert(fallInto(E, 3), 'pompowanie na pasie 1: nie wpadłem w portal');
      E = 1 - E;
    }
    T.assert(seen2, 'pompowanie na pasie 1 nie dało apeksu przy oknie');
    T.assert(Math.abs(T.portal(1 - E).up[0]) > 0.9, 'pas 2 wymaga portalu ustawionego wzdłuż x');
    // zeskok wprost z apeksu (ok. 10 m) w portal na pasie 1: wylot z pasa 2 na ok. 21 m – wciąż za nisko na okno 2
    T.assert(fallInto(E, 6, 5), 'nie wpadłem w portal na pasie 1 z apeksu');

    // ---- 3. komora 2: drugi portal na pasie 2 i pompowanie aż pod sam dach ----
    const lane3 = [[1.1, 15, -26.3], [1.15, 15, -26.1], [1.05, 15, -26.4]];
    E = 1 - E;                                   // wyleciałeś z portalu na pasie 2
    {
      const A = T.portal(E);
      const dx = A.pos[0] - 3.8 < -7.6 ? 3.8 : -3.8;
      T.shoot(1 - E, A.pos[0] + dx, 9.5, A.pos[2]);                           // drugi portal na pasie 2, z góry (wzdłuż pasa)
    }
    T.assert(Math.abs(T.portal(0).up[0]) > 0.9 && Math.abs(T.portal(1).up[0]) > 0.9, 'pas 2 wymaga portali ustawionych wzdłuż x');
    let done = false;
    for (let pass = 0; pass < 14 && !done; pass++) {
      const apex = pl.pos.y + pl.vel.y * pl.vel.y / 48;
      if (apex > 23.1) {
        // wzlot pod sam dach, przy oknie 2: pas 3 widać – strzał wzdłuż z drugim portalem
        const Q = T.portal(E);
        ascend(E, -16.5);
        for (let k = 0; k < 120 && !done; k++) {
          steer(Q.pos[0], -16.5, 10); g.step(T.DT);
          if (k % 4 === 0 && pl.pos.y > 22.1) {
            const t = lane3[(k / 4) % lane3.length | 0];
            if (T.shoot(1 - E, t[0], t[1], t[2], { allowFail: true })) done = true;
          }
        }
        T.release();
        T.assert(done, 'nie widziałem pasa 3 z apeksu: ' + JSON.stringify(T.st()));
        T.assert(Math.abs(T.portal(1 - E).up[2]) > 0.9, 'pas 3 wymaga portalu ustawionego wzdłuż z');
        break;
      }
      ascend(E);
      T.assert(fallInto(E, 3), 'pompowanie na pasie 2: nie wpadłem w portal');
      E = 1 - E;
    }
    T.assert(done, 'pompowanie nie dało apeksu przy oknie 2');
    flyTo(T.portal(E).pos[0], -16.2);            // półka 2 przy oknie
    T.assert(Math.abs(pl.pos.y - S2) < 0.05, 'nie wylądowałem na półce 2: ' + JSON.stringify(T.st()));
    T.walkTo(pl.pos.x, -16.8, 5); T.wait(0.3);   // rozbieg po półce: krawędź jest 2,3 m od pasa, spadek trwa ok. 0,65 s
    T.assert(fallInto(E, 6, 6, true), 'nie zeskoczyłem w portal na pasie 2');

    // ---- 4. lot nad komorą 3: na podest wyjścia ----
    flyTo(-2, -33);
    T.walkTo(-2, -33, 8);
    T.wait(0.3);
  },
};
