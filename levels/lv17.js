import { DARK_ALL } from './util.js';

// Poziom 17 – „Przez szkło”.
// Hala podzielona dwiema szklanymi przegrodami (wysokość 4 m) na trzy strefy:
//   S (start, z od 16 do -2)  |  M (środek, z od -2 do -24)  |  N (wyjście, z od -24 do -42).
// Szkło przepuszcza wzrok, ale zatrzymuje strzał. Strzał przelatuje za to przez portal –
// więc wylot ustawiony WYSOKO (ponad szkłem) pozwala „zajrzeć” i postawić drugi portal w następnej strefie.
// Biała jest tylko garstka powierzchni; reszta to ciemny beton.
export default {
  name: 'Przez szkło',
  hint: 'Szkło zatrzyma każdy strzał, ale nie spojrzenie. Strzał potrafi jednak przelecieć przez portal – wystarczy, że wylot będzie wyżej niż szyba.',
  spawn: { x: 0, y: 0, z: 8, yaw: 0 },
  exit: { x: 0, y: 0, z: -31 },
  build(L) {
    L.room(-20, 20, -42, 16, 20, DARK_ALL);

    // podłogi: wszystko ciemne, tylko pasy lądowania są portalowalne
    L.floor(-20, 20, -2, 16, 'dark');          // S
    L.floor(-20, 20, -18, -2, 'dark');         // M
    L.floor(-20, 20, -24, -18, 'floor');       // M – pas lądowania nr 1
    L.floor(-20, 20, -37, -24, 'dark');        // N
    L.floor(-20, 20, -42, -37, 'floor');       // N – pas lądowania nr 2

    // szklane przegrody (4 m)
    L.box(-20, 0, -2.15, 20, 4, -1.85, 'glass');
    L.box(-20, 0, -24.15, 20, 4, -23.85, 'glass');

    // strefa S: niski pas (wejście) i wysoki panel (wylot) na południowej ścianie
    L.box(-9, 0, 15, 9, 4, 16, 'white');
    L.box(-9, 9, 15, 9, 13, 16, 'white');
    // fałszywe tropy: niskie łaty na bocznych ścianach
    L.box(-20, 0, 3, -19, 4, 11, 'white');
    L.box(19, 0, 3, 20, 4, 11, 'white');

    // strefa M: filar przy wschodniej ścianie z wysoką łatą zwróconą na północ (niewidoczną i niestrzelalną z S)
    L.box(12, 0, -9, 20, 15, -2.15, 'dark');
    L.box(12, 8, -9.5, 20, 14, -9, 'white');
    // niska łata po zachodniej stronie (fałszywy trop)
    L.box(-20, 0, -17, -19, 4, -9, 'white');

    // tablice
    L.sign('WYJŚCIE', 'strefa 3', 12, 3.4, 0, 7, -41.9, 0);
  },
  solve(T) {
    const pl = T.game.player;
    // --- drobna algebra wektorowa (portal: pos, normal, up; right = up × normal) ---
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const frame = (i) => { const P = T.portal(i); return { p: P.pos, n: P.normal, u: P.up, r: cross(P.up, P.normal) }; };
    // Obraz punktu X (leżącego w świecie widzianym z WYLOTU `out`) po stronie wejścia:
    // jeśli celujemy w ten obraz, strzał przejdzie przez wejście i poleci w X.
    const image = (out, X) => {
      const O = frame(out), I = frame(1 - out);
      const d = sub(X, O.p);
      const lx = dot(d, O.r), ly = dot(d, O.u), lz = dot(d, O.n);
      return [0, 1, 2].map(k => I.p[k] - lx * I.r[k] + ly * I.u[k] - lz * I.n[k]);
    };
    // Znajdź miejsce (w prostokącie bnd = [x0,x1,z0,z1]), z którego oko (1.62 m) celujące w obraz
    // trafia w środkową część owalu wejścia. Gracz nie może stać nad otworem w podłodze.
    const stance = (inIdx, img, bnd) => {
      const I = frame(inIdx);
      let best = null;
      for (let rad = 0.6; rad <= 5; rad += 0.2) for (let ang = 0; ang < 360; ang += 10) {
        const ex = I.p[0] + rad * Math.cos(ang * Math.PI / 180), ez = I.p[2] + rad * Math.sin(ang * Math.PI / 180);
        if (ex < bnd[0] || ex > bnd[1] || ez < bnd[2] || ez > bnd[3]) continue;
        const E = [ex, I.p[1] + (Math.abs(I.n[1]) > 0.5 ? 0 : 0) + 1.62 - (Math.abs(I.n[1]) > 0.5 ? 0 : I.p[1]), ez];
        const dir = sub(img, E);
        const dn = dot(dir, I.n);
        if (dn >= -1e-6) continue;
        const t = -dot(sub(E, I.p), I.n) / dn;
        if (t <= 0 || t >= 1) continue;
        const H = [0, 1, 2].map(k => E[k] + dir[k] * t);
        const h = sub(H, I.p);
        const r = dot(h, I.r) / 0.65, u = dot(h, I.u) / 1.15;
        const q = r * r + u * u;
        if (q > 0.5) continue;
        const e = sub(E, I.p);
        const er = dot(e, I.r) / (0.65 * 1.3), eu = dot(e, I.u) / (1.15 * 1.12);
        if (Math.abs(I.n[1]) > 0.5 && er * er + eu * eu < 2.0) continue;
        if (Math.abs(I.n[1]) < 0.5 && dot(e, I.n) < 1.0) continue;
        const score = Math.abs(q - 0.2) + 0.03 * rad;
        if (!best || score < best.score) best = { score, ex, ez, q };
      }
      T.assert(best, 'brak miejsca do celowania przez portal ' + inIdx);
      return best;
    };
    const fireThrough = (out, X, bnd) => {
      const img = image(out, X);
      const s = stance(1 - out, img, bnd);
      T.creep(s.ex, s.ez);
      T.shoot(out, img[0], img[1], img[2]);
      return s;
    };
    // ===== etap 1: strefa S =====
    T.shoot(0, 0, 1.2, 15);                 // niebieski: niski pas na południowej ścianie (wejście)
    T.shoot(1, 0, 12, 15);                  // pomarańczowy: wysoki panel (wylot ponad szkłem)
    fireThrough(1, [0, 0, -20], [-19, 19, -1, 15]);   // przez niebieski: pomarańczowy ląduje na pasie w strefie M
    T.assert(T.walkThrough(0), 'nie wszedłem w niebieski portal');
    // ===== etap 2: strefa M =====
    T.face(-Math.PI / 2, 0);                // zejdź z otworu w podłodze (na wschód)
    T.run(0.8, { KeyW: 1 }, () => T.game.player.onGround);
    T.land();
    T.walkTo(4, -19.5);
    T.shoot(0, 16, 11, -9.5);               // niebieski: wysoka łata filara, zwrócona na północ
    fireThrough(0, [0, 0, -39.5], [-19, 19, -23.3, -2]);   // przez pomarańczowy (podłoga): niebieski ląduje na pasie w strefie N
    T.assert(T.walkThrough(1), 'nie wszedłem w pomarańczowy portal');
    // ===== etap 3: strefa N =====
    T.face(0, 0);                           // zejdź z otworu (na południe, do wyjścia)
    T.run(0.8, { KeyS: 1 }, () => T.game.player.onGround);
    T.land();
    T.walkTo(0, -31);
  },
};
