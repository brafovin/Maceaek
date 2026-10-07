// Poziom 25 – „Okno na świat”.
//
// Cztery wysokie hale (16 m) ułożone w pierścień wokół wspólnego krzyża ścian działowych:
//     POKÓJ 4 | POKÓJ 3        (z < 0)
//     --------+--------
//     POKÓJ 1 | POKÓJ 2        (z > 0)      start w pokoju 1, wyjście w szklanej celi w pokoju 4.
// W ścianach działowych są okna: dolna część (do 12 m) to SZKŁO – widać, ale nie da się strzelić;
// górna (12–13,7 m) to KRATKA – strzał przelatuje. Z podłogi (nawet ze skoku) nie da się zajrzeć
// przez kratki, więc żadna portalowalna łata w sąsiednim pokoju nie jest osiągalna – ale portal
// „widzi oczami bliźniaka”, a strzał przez portal leci stamtąd. Wysoka łata na ścianie naprzeciw okna
// = punkt widzenia ponad podłogą. Cała reszta to ciemny beton; celę wyjścia zamyka szkło i kratkowy dach.
//
// Łaty (wysokość środka 12,5 m): V (pokój 1, zachód), Z2a (pokój 2, wschód), Z2b (pokój 2, południe),
// Z3a (pokój 3, północ, przy rogu), Z3b (pokój 3, wschód), Z4a (pokój 4, zachód), Z4b (sufit nad celą),
// p_c (podłoga celi). Niskie łaty (wejścia): E1..E4 + trzy atrapy w pokoju 1 (D1, D2, D3).
// Graf widoczności (łata → łaty widoczne z jej oczu, sprawdzone skryptem):
//   V → Z2a → Z2b → Z3a → (E3)      Z3b → Z4a → Z4b → p_c        (Z3b jest niewidoczne z Z3a i z E3 – filary)
//
// Zamierzone rozwiązanie („teleskop”: niebieski portal przy podłodze patrzy oczami pomarańczowego,
// który wędruje coraz dalej – gracz się nie rusza z pokoju 1):
//  1. Niebieski na niskiej łacie E1 (ściana wschodnia), pomarańczowy na wysokiej V (ściana zachodnia).
//  2. Zajrzeć przez niebieski: pomarańczowy patrzy przez kratkę do pokoju 2 – widać łatę Z2a.
//     Strzał pomarańczowym przez niebieski → Z2a; stamtąd widać Z2b → strzał; z Z2b przez okno do pokoju 3 → Z3a.
//  3. Z Z3a nie widać już Z3b (zasłania je filar), a Z4a jest ukryte za szkłem – tu teleskop się kończy.
//     Trzeba tam pójść: wejść w niebieski (wylot wysoko z Z3a), spaść do pokoju 3.
//  4. W pokoju 3 (omijając filar): niebieski na niskiej łacie E3, pomarańczowy z podłogi na wysoką Z3b.
//  5. Przez niebieski: pomarańczowy patrzy na zachód przez kratkę → Z4a → łata na suficie Z4b
//     → z sufitu, przez kratkowy dach celi, w podłogową łatę p_c.
//  6. Wejść w niebieski, zejść z otworu w podłodze celi i stanąć na zielonym polu.
// Wokół wysokich łat-punktów widzenia stoją szyby z kratki z kolumną fizzlera (patrz build): wylot z wysokiej łaty kasuje
// portale (i jeszcze raz po 0,6 s, bo z szybu nie da się wyjść bokiem), więc nie da się „przeskakiwać” z łaty na łatę
// strzałami w locie – każdy skok wymaga teleskopu z podłogi.
export default {
  name: 'Okno na świat',
  hint: 'Okna są wyżej, niż sięga Twój wzrok, nawet ze skoku. Co zobaczyłby ktoś, kto stoi tam, gdzie Ty nie sięgniesz?',
  spawn: { x: -6, y: 0, z: 20, yaw: 0 },
  exit: { x: -3.5, y: 0, z: -5 },
  build(L) {
    const H = 16, S = 23;
    const D = 'dark';
    const GL = 12.0, GT = 13.7;                    // szkło do 12 m, kratka 12–13,7 m

    L.room(-S, S, -S, S, H, { n: D, s: D, e: D, w: D, ceil: D });

    // ---- podłogi: wszystko ciemne, oprócz jednego pasa w celi wyjścia ----
    L.floor(-S, -11, -S, S, D);
    L.floor(-11, -6, -S, -9, D);
    L.floor(-11, -6, -1, S, D);
    L.floor(-11, -6, -9, -1, 'floor');             // p_c: jedyny portalowalny kawałek podłogi
    L.floor(-6, S, -S, S, D);

    // ---- ściany działowe (krzyż) z oknami ----
    const wx = (za, zb) => L.box(-1, 0, za, 1, H, zb, D);
    const gx = (z0, z1) => {                       // okno w ścianie x: szkło + kratka + nadproże
      L.box(-0.15, 0, z0, 0.15, GL, z1, 'glass');
      L.box(-0.15, GL, z0, 0.15, GT, z1, 'grate');
      L.box(-1, GT, z0, 1, H, z1, D);
    };
    const wz = (xa, xb) => L.box(xa, 0, -1, xb, H, 1, D);
    const gz = (x0, x1) => {
      L.box(x0, 0, -0.15, x1, GL, 0.15, 'glass');
      L.box(x0, GL, -0.15, x1, GT, 0.15, 'grate');
      L.box(x0, GT, -1, x1, H, 1, D);
    };
    wx(-S, -19); gx(-19, -15); wx(-15, -1);        // pokój 3 | pokój 4 (okno W34)
    wx(1, 14); gx(14, 18); wx(18, S);              // pokój 1 | pokój 2 (okno W12)
    wz(-S, -10);                                   // pokój 4 | pokój 1
    L.box(-10, 0, -0.15, -2, 7, 0.15, 'glass');    // szyba z widokiem na celę wyjścia
    L.box(-10, 7, -1, -2, H, 1, D);
    wz(-2, 12); gz(12, 16); wz(16, S);             // pokój 2 | pokój 3 (okno W23)

    // ---- cela wyjścia (pokój 4): szkło dookoła, kratka na dachu ----
    L.box(-11.15, 0, -8.85, -10.85, 5.85, -1, 'glass');
    L.box(-11.15, 0, -9.15, -1, 5.85, -8.85, 'glass');
    L.box(-11.15, 5.85, -9.15, -1, 6.15, -1, 'grate');

    // ---- łaty portalowe (cała reszta to ciemny beton) ----
    const P = (x0, y0, z0, x1, y1, z1) => L.box(x0, y0, z0, x1, y1, z1, 'white');
    // pokój 1
    P(-2, 0, 3, -1, 3, 9);                         // E1 – niska, przy ścianie wschodniej
    P(-23, 11.1, 14.7, -22, 13.5, 17.3);           // V  – wysoka, na ścianie zachodniej
    P(-22, 0, 1, -14, 3, 2);                       // dodatkowa niska łata przy szybie
    P(-12, 11.1, 22, -8, 13.5, 23);                // dodatkowa wysoka na ścianie południowej
    P(-2, 11.1, 2.5, -1, 13.5, 6.5);               // dodatkowa wysoka nad E1
    // pokój 2
    P(22, 11.1, 14.5, 23, 13.5, 17.5);             // Z2a
    P(12.5, 11.1, 22, 15.5, 13.5, 23);             // Z2b
    P(3, 0, 1, 9, 3, 2);                           // E2 – niska
    // pokój 3
    P(12.5, 11.1, -23, 15.5, 13.5, -22);           // Z3a
    P(22, 11.1, -18.5, 23, 13.5, -15.5);           // Z3b
    P(1, 0, -12, 2, 3, -6);                        // E3 – niska
    // pokój 4
    P(-23, 11.1, -18.5, -22, 13.5, -15.5);         // Z4a
    P(-11, 14.9, -8, -3, 16, -4);                  // Z4b – na suficie nad celą (długa wzdłuż x: łatwiej trafić z daleka)
    P(-23, 0, -12, -22, 3, -6);                    // E4 – niska

    // Szyby z kratki (strzał i wzrok przechodzą, ciało nie) przed wysokimi łatami-punktami widzenia: wylot z portalu
    // spada pionowo w dół, a w szybie stoi fizzler (y 4,5–12,6), który kasuje portale zaraz po wylocie i jeszcze raz po 0,6 s.
    // Wysokie oko jest więc tylko chwilę (< 0,25 s, ponad szkłem okna), a portale z tego czasu i tak znikają, nim gracz do nich dojdzie.
    // Dół szybu jest otwarty – gracz wypada na podłogę. Z4b (sufit) i p_c (podłoga) zostają otwarte.
    const FB = 4.5, FT = 12.6;                      // kolumna fizzlera w szybach: y od 4,5 do 12,6
    const cage = (ax, fc, dir, a0, a1, y0, y1) => {
      const D = 1.15, Tk = 0.3;
      const mk = (n0, n1, l0, l1, yy0, yy1) => ax === 'x'
        ? L.box(Math.min(n0, n1), yy0, l0, Math.max(n0, n1), yy1, l1, 'grate')
        : L.box(l0, yy0, Math.min(n0, n1), l1, yy1, Math.max(n0, n1), 'grate');
      const f1 = fc + dir * (D + Tk);
      const yb = FB - 0.5;                           // szyb z kratki schodzi poniżej kolumny fizzlera
      mk(fc + dir * D, f1, a0 - Tk, a1 + Tk, yb, y1 + Tk);
      mk(fc, f1, a0 - Tk, a0, yb, y1 + Tk);
      mk(fc, f1, a1, a1 + Tk, yb, y1 + Tk);
      mk(fc, f1, a0, a1, y1, y1 + Tk);
      // kolumna fizzlera na całym przekroju szybu: wylot z wysokiej łaty kasuje portale (a po 0,6 s jeszcze raz),
      // więc nie da się „przeskakiwać” z łaty na łatę strzałami w locie – trzeba teleskopu z podłogi.
      const fa = Math.min(fc, fc + dir * D), fb = Math.max(fc, fc + dir * D);
      if (ax === 'x') L.fizzler(fa, FB, a0, fb, FT, a1); else L.fizzler(a0, FB, fa, a1, FT, fb);
    };
    cage('x', -22, 1, 14.7, 17.3, 11.1, 13.5);     // V
    cage('z', 22, -1, -12, -8, 11.1, 13.5);        // dodatkowa wysoka (pok. 1)
    cage('x', -2, -1, 2.5, 6.5, 11.1, 13.5);       // dodatkowa wysoka nad E1
    cage('x', 22, -1, 14.5, 17.5, 11.1, 13.5);     // Z2a
    cage('z', 22, -1, 12.5, 15.5, 11.1, 13.5);     // Z2b
    cage('x', 22, -1, -18.5, -15.5, 11.1, 13.5);   // Z3b
    cage('x', -22, 1, -18.5, -15.5, 11.1, 13.5);   // Z4a
    cage('z', -22, 1, 12.5, 15.5, 11.1, 13.5);     // Z3a

    // filary w pokoju 3: pierwszy zasłania Z3b przed wzrokiem z Z3a, drugi – przed wzrokiem z niskiej łaty E3
    // (z podłogi pokoju 3 łata Z3b jest widoczna)
    L.box(16.5, 0, -S, 19.5, H, -18.5, D);
    L.box(7, 0, -13.5, 9.5, H, -8.5, D);

    // ---- tablice ----
    L.sign('POKÓJ 1', 'start', 9, 2.6, -17, 7, 22.95, Math.PI);
    L.sign('WYJŚCIE', 'za szybą', 9, 2.6, -6, 9, 1.05, 0);
    L.sign('POKÓJ 2', '', 7, 2.2, 1.05, 6, 8, -Math.PI / 2);
    L.sign('POKÓJ 3', '', 7, 2.2, 1.05, 6, -4, -Math.PI / 2);
    L.sign('POKÓJ 4', '', 7, 2.2, -22.95, 6, -13, -Math.PI / 2);
    L.sign('WYJŚCIE', 'cela', 7, 2.2, -1.05, 9, -6, Math.PI / 2);
  },
  solve(T) {
    const g = T.game, THREE = g.THREE, pl = g.player;
    const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    const frame = (i) => {
      const P = T.portal(i);
      const p = V3(P.pos), n = V3(P.normal), u = V3(P.up);
      return { p, n, u, r: new THREE.Vector3().crossVectors(u, n).normalize() };
    };
    // Punkt „widziany przez wejście”: strzał z oka w ten punkt przejdzie przez portal 1-out i poleci z `out` w stronę celu.
    const image = (out, target) => V3(target).applyMatrix4(g.transforms[1 - out].clone().invert());
    const segHits = (E, H, b) => {
      let t0 = 0, t1 = 1;
      for (const a of ['x', 'y', 'z']) {
        const d = H[a] - E[a];
        if (Math.abs(d) < 1e-9) { if (E[a] < b.min[a] || E[a] > b.max[a]) return false; continue; }
        let ta = (b.min[a] - E[a]) / d, tb = (b.max[a] - E[a]) / d;
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) return false;
      }
      return t0 < 0.995;
    };
    // Miejsce na podłodze (w prostokącie bnd = [x0,x1,z0,z1]), z którego oko celujące w `img` trafia w środek owalu portalu `entry`.
    const stance = (entry, img, bnd, label) => {
      const I = frame(entry), host = g.portals[entry].host;
      const floorPortal = Math.abs(I.n.y) > 0.5;
      let best = null;
      for (let ex = bnd[0]; ex <= bnd[1]; ex += 0.25) for (let ez = bnd[2]; ez <= bnd[3]; ez += 0.25) {
        const E = new THREE.Vector3(ex, 1.62, ez);
        const dir = img.clone().sub(E);
        const dn = dir.dot(I.n);
        if (dn >= -1e-6) continue;
        const t = -E.clone().sub(I.p).dot(I.n) / dn;
        if (t <= 0 || t >= 1) continue;
        const H = E.clone().addScaledVector(dir, t);
        const h = H.clone().sub(I.p);
        const r = h.dot(I.r) / 0.65, u = h.dot(I.u) / 1.15;
        const q = r * r + u * u;
        if (q > 0.5) continue;
        const e = E.clone().sub(I.p);
        if (!floorPortal && e.dot(I.n) < 1.0) continue;
        if (floorPortal && Math.hypot(e.dot(I.r) / 0.85, e.dot(I.u) / 1.3) < 1.3) continue;
        let free = true;
        for (const b of g.boxes) {
          if (b.disabled || b.shootThrough || b === host) continue;
          if (ex + 0.4 > b.min.x && ex - 0.4 < b.max.x && ez + 0.4 > b.min.z && ez - 0.4 < b.max.z && b.max.y > 0.05 && b.min.y < 1.8) { free = false; break; }
          if (segHits(E, H, b)) { free = false; break; }
        }
        if (!free) continue;
        const score = Math.abs(q - 0.2) + 0.03 * Math.hypot(ex - pl.pos.x, ez - pl.pos.z);
        if (!best || score < best.score) best = { score, ex, ez, q };
      }
      T.assert(best, 'brak miejsca do celowania przez portal ' + entry + ' w ' + label);
      return best;
    };
    // przez portal wejściowy (1-out) stawia portal `out` w punkcie `target`
    const fireThrough = (out, target, bnd) => {
      const img = image(out, target);
      const s = stance(1 - out, img, bnd, JSON.stringify(target));
      const d = Math.hypot(s.ex - pl.pos.x, s.ez - pl.pos.z);
      if (d > 3) T.walkTo(s.ex, s.ez, 20);
      T.creep(s.ex, s.ez);
      T.wait(0.3);
      T.shoot(out, img.x, img.y, img.z);
      const P = T.portal(out);
      T.assert(P.active && Math.hypot(P.pos[0] - target[0], P.pos[1] - target[1], P.pos[2] - target[2]) < 3.8,
        'portal ' + out + ' nie wylądował w celu: ' + JSON.stringify(P.pos) + ' vs ' + JSON.stringify(target));
    };
    const R1 = [-21.5, -2.5, 2.5, 22], R3 = [2.5, 21.5, -22, -2];

    // ===== część 1: pokój 1 – teleskop sięga do pokoju 3 =====
    T.shoot(0, -2, 1.5, 6);                          // niebieski na niskiej łacie przy ścianie wschodniej
    T.shoot(1, -22, 12.5, 16);                         // pomarańczowy wysoko na ścianie zachodniej (patrzy przez okno)
    fireThrough(1, [22, 12.5, 16], R1);                // → Z2a (pokój 2, ściana wschodnia)
    fireThrough(1, [14, 12.5, 22], R1);                // → Z2b (pokój 2, ściana południowa)
    fireThrough(1, [14, 12.5, -22], R1);               // → Z3a (pokój 3, ściana północna)
    T.assert(T.walkThrough(0, {}), 'nie wszedłem w niebieski portal');
    T.land(10);

    // ===== część 2: pokój 3 =====
    T.walkTo(12, -4, 12);                           // dookoła filaru przed E3
    T.walkTo(6, -4, 12);
    T.shoot(0, 2, 1.2, -9);                         // niebieski na niskiej łacie E3
    T.shoot(1, 22, 12.5, -17);                         // pomarańczowy z podłogi na wysoką łatę Z3b
    fireThrough(1, [-22, 12.5, -17], R3);              // → Z4a (pokój 4, ściana zachodnia)
    fireThrough(1, [-7, 14.9, -6], R3);             // → Z4b (sufit w pokoju 4)
    fireThrough(1, [-8.5, 0, -4.5], R3);             // → p_c (podłoga celi przez kratkowy dach)
    T.assert(T.walkThrough(0, {}), 'nie wszedłem w niebieski portal (cela)');
    // ===== cela: zejdź z otworu i stań na zielonym polu =====
    const c = T.portal(1).pos;
    T.face(-Math.PI / 2, 0);
    T.run(2, { KeyW: 1 }, () => pl.onGround && Math.hypot(pl.pos.x - c[0], pl.pos.z - c[2]) > 2.4);
    T.land();
    T.walkTo(-3.5, -5);
  },
};
