import { DARK_ALL } from './util.js';

// Poziom 23 – „Dźwig”
//
// Trzy komory w rzędzie (oś z: start przy +z, wyjście przy -z), oddzielone przegrodami z wysokimi kratowymi oknami:
//   Hala     (podłoga 0 m, dach 8,4)  – schody na podest 6 m, biała płyta u jego stóp; krata (4 … 8,4 m) w stronę komory 1
//   Komora 1 (podłoga 4 m, dach 19,5) – pas 1 (2,1 × 2,9 m, mieści jeden portal) przy ścianie półki; półka 10 m z białą
//                                       płytką (widać ją dopiero z góry); okno (14 … 19,5 m) w stronę komory 2
//   Komora 2 (podłoga 6 m, dach 28)   – pas 2 (wąski, wzdłuż x), wąwóz o białym dnie na 1 m (widać je tylko znad krawędzi),
//                                       podest wyjścia na 21 m
// Jedyne portalowalne powierzchnie to płyta w hali, pas 1, płytka na półce, pas 2 i dno wąwozu.
//
// ENERGIA (zgodnie z regułami silnika): wlot w portal podłogowy przy spadku z wysokości h nad jego płaszczyzną daje
// wylot z pędem odpowiadającym h, a wylot wyżej niż wlot dokłada różnicę poziomów Δ. Bonus ≈ 1,6 m przy wylocie z podłogi
// przysługuje raz między kontaktami z ziemią; para portali na TYM SAMYM poziomie nie pompuje (sprawdzone testem),
// pompuje tylko para o różnych poziomach – i tę gracz musi świadomie ustawić. Sufit komory ogranicza wysokość lotu.
//   Etap 1 (hala -> komora 1): zeskok z podestu 6 m w płytę, wylot z pasa 1 (4 m): apeks ≈ 11,4 m – akurat tyle, by
//          wylądować na półce 10 m (z niższych stopni schodów się nie uda).
//   Etap 2 (komora 1): z półki: pomarańczowy na płytkę półki (wylot wyżej), niebieski na pas 1 u stóp półki (wlot niżej,
//          Δ = 6 m) -> zeskok daje apeks ≈ 17,4 m (sufit ścina do 17,7). Okno odsłania pas 2 dopiero od stóp ≈ 15 m i to
//          tuż przy kracie; po zeskoku z podestu (najwyżej ≈ 13 m) tego nie widać. W apeksie pomarańczowy leci na pas 2 –
//          musi tam leżeć wzdłuż x, więc strzał ma iść ukośnie (dominująca składowa x), inaczej „za mało miejsca”.
//   Etap 3 (komora 2): pas 2 jest tylko 2 m wyżej niż pas 1, więc nawet bez lądowania (cały pęd zachowany) wylot daje
//          ≤ 19,7 m < podest wyjścia 21 m. Trzeba znów zrobić różnicę poziomów: niebieski na dno wąwozu (widoczne tylko
//          znad krawędzi, 5 m niżej niż pas 2) – każdy zeskok do wąwozu dokłada 5 m; 1-3 obiegi i lot na podest.
// Brak ślepych zaułków: z komory 1 wraca się wejściem w pomarańczowy portal (jeśli niebieski został w hali), z wąwozu
// wychodzą schody, z półki można zeskoczyć.
const X0 = -12, X1 = 8;
const F1 = 4, F2 = 6;            // podłogi komór 1 i 2
const PODIUM = 6, LEDGE = 10;    // podest w hali i półka w komorze 1
const R0 = 8.4, R1 = 19.5, R2 = 28;
const W1 = 14;                   // dolna krawędź okna między komorami 1 i 2
const CAN = 1;                   // dno wąwozu w komorze 2
const EXH = 21;                  // podest wyjścia

export default {
  name: 'Dźwig',
  hint: 'Wysokie okna odsłaniają to, co za nimi, dopiero z lotu. Portal można przestawić, zanim się spadnie.',
  spawn: { x: 3, y: 0, z: 19, yaw: 0 },
  exit: { x: 0, y: EXH, z: -23.5 },
  build(L) {
    L.room(X0, X1, -26, 24, R2, DARK_ALL);

    // podłoga: ciemna wszędzie poza prostokątami `pads` ({x0,x1,z0,z1,top?}) – te są białe; `hole` = tylko wycięcie
    const slab = (x0, x1, z0, z1, top, pads = []) => {
      const zs = [z0, z1];
      for (const p of pads) zs.push(p.z0, p.z1);
      const br = [...new Set(zs)].sort((a, b) => a - b);
      for (let i = 0; i + 1 < br.length; i++) {
        const za = br[i], zb = br[i + 1];
        const cov = pads.filter(p => p.z0 <= za + 1e-6 && p.z1 >= zb - 1e-6).sort((a, b) => a.x0 - b.x0);
        let cx = x0;
        for (const p of cov) {
          if (p.x0 > cx + 1e-6) L.box(cx, -8, za, p.x0, top, zb, 'dark');
          cx = p.x1;
        }
        if (cx < x1 - 1e-6) L.box(cx, -8, za, x1, top, zb, 'dark');
      }
      for (const p of pads) if (!p.hole) L.box(p.x0, -8, p.z0, p.x1, p.top ?? top, p.z1, 'floor');
    };

    // ---- hala: podest 6 m (schody po zachodniej stronie), płyta u jego stóp, krata w stronę komory 1 ----
    slab(X0, X1, 8, 24, 0, [{ x0: -7.5, x1: -1, z0: 9.5, z1: 16 }]);
    L.box(-12, 0, 8, -7.5, PODIUM, 12.5, 'dark');
    for (let i = 1; i <= 11; i++) L.box(-12, 0, 12.5 + 0.8 * (11 - i), -7.5, 0.5 * i, 12.5 + 0.8 * (12 - i), 'dark');
    L.box(X0, R0, 8, X1, R0 + 1, 24, 'dark');
    L.box(X0, -8, 7, X1, F1, 8, 'dark');
    L.box(X0, R0, 7, X1, R2, 8, 'dark');
    L.box(X0, F1, 7.7, X1, R0, 8, 'grate');

    // ---- komora 1: pas 1 przylega do ściany półki (zeskok z półki od razu nad portalem) ----
    slab(X0, X1, -3.6, 7, F1, [{ x0: -10.5, x1: -8.4, z0: -3.6, z1: -0.7 }]);
    slab(X0, X1, -7, -3.6, LEDGE, [{ x0: -10.5, x1: -8.4, z0: -6.9, z1: -4.0 }]);
    L.box(X0, R1, -7, X1, R1 + 1, 7, 'dark');

    // ---- przegroda z oknem (krata przy samej ścianie od strony komory 1) ----
    L.box(X0, -8, -8, X1, W1, -7, 'dark');
    L.box(X0, R1, -8, X1, R2, -7, 'dark');
    L.box(X0, W1, -7.3, X1, R1, -7, 'grate');

    // ---- komora 2: pas 2, wąwóz (dno 5 m niżej, schody na wschodnim końcu), podest wyjścia ----
    const cz0 = -18.6, cz1 = -15.2;
    slab(X0, X1, -21, -8, F2, [
      { x0: -9, x1: 6, z0: -13.9, z1: -11.8 },
      { x0: -9, x1: 2, z0: cz0, z1: cz1, top: CAN },
      { x0: 2, x1: 6, z0: cz0, z1: cz1, hole: true },
    ]);
    for (let i = 1; i <= 10; i++) L.box(2 + 0.4 * (i - 1), -8, cz0, 6, CAN + 0.5 * i, cz1, 'dark');
    L.box(X0, -8, -26, X1, EXH, -21, 'dark');

    // ---- tablice ----
    L.sign('DŹWIG', 'wyjście: 21 m nad podłogą', 7.5, 1.8, -3, 2.1, 8.02, 0);
    L.sign('PODEST 6 m', 'schody po zachodniej stronie', 6, 1.5, X0 + 0.02, 6.4, 17, Math.PI / 2);
    L.sign('PORTAL LEŻY WZDŁUŻ STRZAŁU', 'na podłodze oś portalu = kierunek, w którym patrzysz', 11, 1.8, X1 - 0.02, 2.6, 16, -Math.PI / 2);
    L.sign('PÓŁKA', '6 m nad podłogą komory', 5, 1.4, -2, 7.2, -3.58, 0);
    L.sign('WYJŚCIE ▲', 'jeszcze 17 m w górę', 6, 1.5, -2, 12.4, -6.98, 0);
    L.sign('WYJŚCIE ▲', 'tu na górze, 15 m nad podłogą komory', 7.5, 1.5, 0, 17, -20.98, 0);
  },
  solve(T) {
    const g = T.game, pl = g.player;
    // sterowanie poziome w układzie świata (yaw = 0: W = północ, A/D = zachód/wschód): doleć do (tx,tz)
    // z prędkością ograniczoną do vmax; hamuje w osiach niezależnie, więc nie „krąży” wokół celu
    const steer = (tx, tz, vmax = 6) => {
      const dx = tx - pl.pos.x, dz = tz - pl.pos.z;
      const vdx = Math.max(-vmax, Math.min(vmax, dx * 2.2)), vdz = Math.max(-vmax, Math.min(vmax, dz * 2.2));
      pl.yaw = 0;
      g.keys.KeyD = pl.vel.x < vdx - 0.25; g.keys.KeyA = pl.vel.x > vdx + 0.25;
      g.keys.KeyS = pl.vel.z < vdz - 0.25; g.keys.KeyW = pl.vel.z > vdz + 0.25;
      g.keys.ShiftLeft = vmax > 6;
      return Math.hypot(dx, dz);
    };
    // wpadnij w portal i: stań nad otworem (na ziemi powoli) aż do teleportacji
    const fallInto = (i, vair = 6, vgnd = 1.5) => {
      const prev = pl.pos.clone();
      for (let k = 0; k < 1200; k++) {
        const Q = T.portal(i);
        steer(Q.pos[0], Q.pos[2], pl.onGround ? vgnd : vair);
        g.step(T.DT);
        if (pl.pos.distanceTo(prev) > 2) { T.release(); return true; }
        prev.copy(pl.pos);
      }
      T.release();
      return false;
    };
    // leć/chodź do (tx,tz) aż do lądowania
    const flyLand = (tx, tz, vmax = 6) => {
      for (let k = 0; k < 1500; k++) {
        steer(tx, tz, vmax);
        g.step(T.DT);
        if (pl.onGround && k > 20) break;
      }
      T.release();
      T.wait(0.4);
    };

    // ---- hala: podest 6 m, wejście na płycie, wyjście na pasie komory 1 (widać go przez kratę) ----
    T.walkTo(-10, 22.5, 12);
    T.walkTo(-10, 10.5, 25);
    T.walkTo(-7.7, 10.4, 5); T.wait(0.4);         // przy samej krawędzi, inaczej podest zasłania płytę
    T.shoot(1, -9.45, F1, -2.3);                  // pas 1 – wzdłuż z (strzał na północ)
    T.shoot(0, -6.2, 0, 10.8);                    // płyta tuż przy podeście
    T.assert(fallInto(0, 3, 1.5), 'nie wpadłem w portal na płycie');

    // ---- komora 1: półka 10 m (lot z podestu daje ok. 11,4 m) ----
    flyLand(-9.45, -4.6);
    T.assert(Math.abs(pl.pos.y - LEDGE) < 0.05, 'nie wylądowałem na półce: ' + JSON.stringify(T.st()));
    T.creep(-9.45, -3.45); T.wait(0.3);           // przy krawędzi półki – stąd widać pas 1 u jej stóp
    T.face(Math.PI, 0);
    T.shoot(1, -9.45, LEDGE, -5.6);               // pomarańczowy na płytce półki (wylot wyżej)
    T.shoot(0, -9.45, F1, -2.3);                  // niebieski na pasie u stóp półki (wlot niżej)
    T.assert(T.portal(1).pos[1] === LEDGE && T.portal(0).pos[1] === F1, 'para portali na półce');
    T.assert(fallInto(0, 6, 1.5), 'nie wpadłem w portal u stóp półki');
    // lot nad półką: przy samej kracie zobacz pas komory 2 i przestaw tam pomarańczowy (ukośnie – wzdłuż pasa)
    let seen = false;
    for (let k = 0; k < 1500 && !seen; k++) {
      steer(-9.45, -6.7, 6);
      g.step(T.DT);
      if (k % 4 === 0 && pl.pos.y > 15.2 && pl.pos.z < -6.3) seen = T.shoot(1, 0, F2, -12.8, { allowFail: true });
      if (pl.onGround && k > 20) break;
    }
    T.release();
    T.assert(seen, 'nie zobaczyłem pasa komory 2: ' + JSON.stringify(T.st()));
    T.assert(Math.abs(T.portal(1).up[0]) > 0.9, 'pas 2 wymaga portalu ułożonego wzdłuż x');
    flyLand(-9.45, -5.0);
    T.creep(-9.45, -3.45); T.wait(0.3);
    T.assert(Math.abs(pl.pos.y - LEDGE) < 0.05, 'nie wróciłem na półkę: ' + JSON.stringify(T.st()));
    T.assert(fallInto(0, 6, 1.5), 'nie wpadłem w portal u stóp półki (2)');

    // ---- komora 2: wąwóz jako druga „winda” ----
    flyLand(0.5, -14.6);
    T.creep(0, -14.95); T.wait(0.3);              // przy krawędzi – stąd widać dno wąwozu
    T.face(0, 0);
    T.shoot(0, 0, CAN, -16.6);                    // niebieski na dnie wąwozu (wlot 5 m niżej niż wylot)
    T.assert(Math.abs(T.portal(0).up[2]) > 0.9, 'wąwóz: portal ułożony wzdłuż z');
    T.assert(fallInto(0, 6, 1.5), 'nie wpadłem w wąwóz');
    for (let pass = 0; pass < 8; pass++) {
      const X = T.portal(0);
      let apexOk = false;
      for (let k = 0; k < 1500 && pl.vel.y > 0; k++) {
        apexOk = pl.pos.y + pl.vel.y * pl.vel.y / 48 >= EXH + 2.2;
        if (apexOk) break;
        steer(X.pos[0], X.pos[2], 6);
        g.step(T.DT);
      }
      if (apexOk) break;
      T.assert(fallInto(0, 6, 1.5), 'pompowanie w wąwozie: nie wpadłem w portal');
    }
    // ---- lot na podest wyjścia ----
    flyLand(0, -23.5, 10);
    T.walkTo(0, -23.5, 4);
    T.wait(0.3);
  },
};
