import { DARK_ALL } from './util.js';

// Poziom 17 – „Przez szkło”.
//
// Hala podzielona dwiema szklanymi przegrodami (S: 4 m, N: 6 m) na trzy strefy:
//   S (start, z od 16 do -2)  |  M (środek, z od -2 do -34)  |  N (wyjście, z od -34 do -52).
// Szkło przepuszcza wzrok, ale zatrzymuje strzał. Strzał przelatuje za to przez portal –
// więc wylot ustawiony WYSOKO (ponad szkłem) pozwala „zajrzeć” w następną strefę i postawić tam drugi portal.
// Biała jest tylko garstka powierzchni; reszta to ciemny beton.
//
// Rozwiązanie (zamierzone):
//  (nad szkłem jest siatka do sufitu – przegrody są pełnej wysokości, nie da się ich przelecieć.)
//  1. niebieski portal na niskim pasie południowej ściany (wejście, tuż przy graczu),
//  2. pomarańczowy na wysokim panelu tej samej ściany (wylot ponad szkłem),
//  3. spojrzeć przez niebieski i strzelić pomarańczowym przez niego w pas podłogi w strefie M – portal przeskakuje tam,
//  4. wejść w niebieski – lądujemy w M (zejść z otworu w podłodze),
//  5. niebieski na wysoką łatę filara (zwróconą na północ, widoczną tylko ze strefy M),
//  6. spojrzeć w pomarańczowy portal w podłodze (z właściwej strony) i strzelić niebieskim przez niego w pas podłogi strefy N,
//  7. wejść w pomarańczowy – lądujemy w N, 8. dojść do zielonego pola.
export default {
  name: 'Przez szkło',
  hint: 'Szkło zatrzyma każdy strzał, ale nie spojrzenie. Portal widzi to, czego nie możesz trafić – pomyśl, skąd powinien patrzeć.',
  spawn: { x: 0, y: 0, z: 8, yaw: 0 },
  exit: { x: 0, y: 0, z: -40 },
  build(L) {
    L.room(-20, 20, -52, 16, 20, DARK_ALL);

    // ---- podłogi: wszystko ciemne, portalowalne są tylko dwa pasy lądowania ----
    L.floor(-20, 20, -2, 16, 'dark');            // S
    L.floor(-20, 20, -17, -2, 'dark');           // M
    L.floor(-20, -18, -34, -17, 'dark');
    L.floor(-18, -4, -30, -17, 'floor');         // M – pas lądowania nr 1 (zachodnia część strefy)
    L.floor(-18, -4, -34, -30, 'dark');
    L.floor(-4, 20, -34, -17, 'dark');
    L.floor(-20, 20, -45, -34, 'dark');          // N
    L.floor(-20, 20, -52, -45, 'floor');         // N – pas lądowania nr 2

    // ---- szklane przegrody (S: 4 m, N: 6 m – wyższa, by nie dało się jej obejść strzałem z lotu) ----
    L.box(-20, 0, -2.15, 20, 4, -1.85, 'glass');
    L.box(-20, 0, -34.15, 20, 6, -33.85, 'glass');
    // ---- nad szkłem siatka do sufitu: wzrok i strzał przechodzą, ale przegroda jest pełnej wysokości ----
    L.box(-20, 4, -2.15, 20, 20, -1.85, 'grate');
    L.box(-20, 6, -34.15, 20, 20, -33.85, 'grate');

    // ---- strefa S: niski pas (wejście) i wysoki panel (wylot) na południowej ścianie ----
    L.box(-9, 0, 15, 9, 4, 16, 'white');
    L.box(-9, 10, 15, 9, 14, 16, 'white');

    // ---- strefa M: filar przy wschodniej ścianie z wysoką łatą zwróconą na północ ----
    L.box(12, 0, -19.5, 20, 18, -12, 'dark');
    L.box(12, 11, -20, 20, 17, -19.5, 'white');

    // ---- słupy przy przegrodach (dekoracja, trzymają szkło) ----
    for (const z of [-2, -34]) {
      L.box(-20, 0, z - 0.6, -18, 20, z + 0.6, 'dark');
      L.box(18, 0, z - 0.6, 20, 20, z + 0.6, 'dark');
    }

    // ---- tablice ----
    L.sign('STREFA 1', 'start', 7, 1.8, 19.95, 7, 12, Math.PI / 2);
    L.sign('STREFA 2', 'środek', 7, 1.8, -19.95, 7, -12, -Math.PI / 2);
    L.sign('WYJŚCIE', 'strefa 3', 16, 4.4, 0, 9, -51.9, 0);
  },
  solve(T) {
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
    // Miejsce (w prostokącie bnd = [x0,x1,z0,z1]), z którego oko (1.62 m) celujące w obraz trafia
    // w środkową część owalu wejścia. Gracz nie może stać nad otworem w podłodze.
    const stance = (inIdx, img, bnd) => {
      const I = frame(inIdx);
      const floorPortal = Math.abs(I.n[1]) > 0.5;
      let best = null;
      for (let rad = 0.6; rad <= 5; rad += 0.2) for (let ang = 0; ang < 360; ang += 10) {
        const ex = I.p[0] + rad * Math.cos(ang * Math.PI / 180), ez = I.p[2] + rad * Math.sin(ang * Math.PI / 180);
        if (ex < bnd[0] || ex > bnd[1] || ez < bnd[2] || ez > bnd[3]) continue;
        const E = [ex, 1.62, ez];
        const dir = sub(img, E);
        const dn = dot(dir, I.n);
        if (dn >= -1e-6) continue;
        const t = -dot(sub(E, I.p), I.n) / dn;
        if (t <= 0 || t >= 1) continue;
        const H = [0, 1, 2].map(k => E[k] + dir[k] * t);
        const h = sub(H, I.p);
        const r = dot(h, I.r) / 0.65, u = dot(h, I.u) / 1.15;
        const q = r * r + u * u;
        if (q > 0.75) continue;
        const e = sub(E, I.p);
        const er = dot(e, I.r) / (0.65 * 1.3), eu = dot(e, I.u) / (1.15 * 1.12);
        if (floorPortal && er * er + eu * eu < 1.5) continue;
        if (!floorPortal && dot(e, I.n) < 1.0) continue;
        const score = Math.abs(q - 0.25) + 0.03 * rad;
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
    };
    const stepOff = (yaw, idx) => {         // po wylocie z otworu w podłodze odbiegnij w bok, żeby nie wpaść z powrotem
      const pl = T.game.player, c = T.portal(idx).pos;
      T.face(yaw, 0);
      T.run(2, { KeyW: 1, ShiftLeft: 1 }, () => pl.onGround && Math.hypot(pl.pos.x - c[0], pl.pos.z - c[2]) > 2.2);
      T.land();
    };

    // ===== etap 1: strefa S =====
    T.shoot(0, -7.5, 1.2, 15);              // niebieski: niski pas na południowej ścianie (wejście)
    T.shoot(1, -7.5, 12, 15);               // pomarańczowy: wysoki panel (wylot ponad szkłem)
    fireThrough(1, [-7.5, 0, -24], [-19, 19, -1, 15]);   // przez niebieski: pomarańczowy ląduje na pasie w strefie M
    T.assert(T.walkThrough(0), 'nie wszedłem w niebieski portal');
    // ===== etap 2: strefa M =====
    stepOff(Math.PI / 2, 1);
    T.shoot(0, 16, 14, -20);                // niebieski: wysoka łata filara, zwrócona na północ
    fireThrough(0, [16, 0, -47], [-19, 19, -33, -3]);    // przez pomarańczowy (podłoga): niebieski ląduje na pasie w strefie N
    T.assert(T.walkThrough(1), 'nie wszedłem w pomarańczowy portal');
    // ===== etap 3: strefa N =====
    stepOff(Math.PI, 0);
    T.walkTo(0, -40);
  },
};
