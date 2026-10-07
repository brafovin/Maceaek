import { DARK_ALL } from './util.js';

// Poziom 28 – „Odbicie”.
//
// Hala luster: ciemna hala z trzema poprzecznymi murami (B1, B2, B3) i kwasem na całej długości.
// Portalowalne są tylko małe, oprawione w pomarańczowe ramki łatki (1,5 × 2,5 m) i jedna wielka, kusząca tafla „f”.
// Start: wnęka S na południu. Wyjście: platforma EP na północnym końcu hali, za trzema murami.
//
//   z = +14 ┌───────── S (start, przycisk A, kostka, łatki aW/aE/aS) ─────────┐
//   z =   0 │ kwas ................ C1 (tafla f na południowej ścianie B1)    │
//   z = -12 │ ██████████████ B1 ████████ (przerwa na wschodzie) ..............│
//   z = -14 │ N (wyspa: przycisk B, łatka m0)      C2 (łatki q, q2 na B2)     │
//   z = -32 │ ██ B2 ██ [drzwi D1 – przycisk A] ██████████████████████████████│
//   z = -34 │ C3 (łatki r1 na B3, r2/r2b na B2 od północy)                    │
//   z = -48 │ ███████████████████ B3 ██ [drzwi D2 – przycisk B] ██████████████│
//   z = -50 │ EP (platforma wyjścia, łatka T na północnej ścianie)            │
//   z = -62 └─────────────────────────────────────────────────────────────────┘
//
// Dwa portale to za mało, żeby sięgnąć dalej – więc jeden z nich (pomarańczowy) „wędruje”: za każdym razem widzi
// następną łatkę oczami swojego poprzednika, a niebieski zostaje przy graczu (łatka aE w ścianie wnęki).
// Zamierzone rozwiązanie:
//  1. Podnieść kostkę. Niebieski na aE (wschodnia ściana wnęki).
//  2. Pomarańczowy bezpośrednio na łatkę q (południowa ściana B2, widoczna przez przerwę w B1).
//  3. Przez niebieski „oczami” q widać łatkę m0 po północnej stronie B1 (niewidoczną ze startu): pomarańczowy na m0.
//  4. Wejść w niebieski z kostką – lądujemy na wyspie N. Kostkę na przycisk B (otwiera drzwi D2 w B3). Wrócić przez m0.
//  5. Stanąć na przycisku A (otwiera D1 w B2). Z tego miejsca niebieski „patrzy” z m0 prosto na północ przez D1:
//     strzelić pomarańczowym w łatkę r1 (południowa ściana B3). Kostka na B trzyma D2 otwarte, ale to jeszcze nie to.
//  6. Zejść z przycisku (D1 zamyka się – już niepotrzebne). Z r1 widać r2 (północna strona B2): pomarańczowy na r2.
//  7. Z r2 przez otwarte D2 widać łatkę T w północnej ścianie hali: pomarańczowy na T.
//  8. Wejść w niebieski – wychodzimy z T na platformie EP. Dojść do zielonego pola.
// Pułapki: tafla f (każdy portal tam prowadzi wprost w kwas), łatki q2 i r2b (ślepe uliczki).
export const design = { X0: -18, X1: 18, Z0: -62, Z1: 14, H: 14 };

const X0 = -18, X1 = 18, Z0 = -62, Z1 = 14, H = 14;
const SL = 0.6;            // grubość łatki (wystaje ze ściany)

export default {
  name: 'Odbicie',
  hint: 'Nie widać ich ze startu – ale każda łatka widzi jakąś następną. Drzwi na drodze strzału otwiera ten, kto stoi na przycisku, albo ten, kto zostawił na nim ciężar.',
  spawn: { x: 0, y: 0, z: 10, yaw: 0 },
  exit: { x: 15, y: 0, z: -55.5 },
  build(L) {
    L.room(X0, X1, Z0, Z1, H, DARK_ALL);

    // ---- podłogi: wnęka startowa S, wyspa N, platforma wyjścia EP – wszystkie ciemne (bez portali w podłodze) ----
    L.floor(-8, 8, 0, Z1, 'dark');
    L.floor(X0, -5, -21, -14, 'dark');
    L.floor(X0, X1, Z0, -50, 'dark');
    L.pit(X0, X1, Z0, 0);
    // ściany boczne wnęki
    L.box(X0, -8, 0, -8, H, Z1, 'dark');
    L.box(8, -8, 0, X1, H, Z1, 'dark');

    // ---- mur B1 (przerwa na wschodzie, x od 4 do 18) ----
    L.box(X0, -8, -14, 4, H, -12, 'dark');
    // ---- mur B2 z drzwiami D1 (x od -14 do -10) ----
    L.box(X0, -8, -34, -14, H, -32, 'dark');
    L.box(-10, -8, -34, X1, H, -32, 'dark');
    L.box(-14, 4.5, -34, -10, H, -32, 'dark');
    L.box(-14, -8, -34, -10, 0, -32, 'dark');
    L.door('A', -14, 0, -34, -10, 4.5, -32);
    // ---- mur B3 z drzwiami D2 (x od 8 do 12) ----
    L.box(X0, -8, -50, 8, H, -48, 'dark');
    L.box(12, -8, -50, X1, H, -48, 'dark');
    L.box(8, 4.5, -50, 12, H, -48, 'dark');
    L.box(8, -8, -50, 12, 0, -48, 'dark');
    L.door(['B', 'C'], 8, 0, -50, 12, 4.5, -48);

    // ---- łatki: biała płyta wystająca ze ściany + pomarańczowa ramka ----
    // dir: normalna płyty; wall: współrzędna ściany-gospodarza; c: środek wzdłuż ściany; [y0,y1]; w: szerokość
    const patch = (dir, wall, c, y0, y1, w = 1.5, frame = true) => {
      const ax = dir[1], s = dir[0] === '+' ? 1 : -1;
      const a0 = s > 0 ? wall : wall - SL, a1 = s > 0 ? wall + SL : wall;
      const f0 = s > 0 ? wall : wall - 0.3, f1 = s > 0 ? wall + 0.3 : wall;
      const m = 0.28;
      if (ax === 'x') {
        if (frame) L.box(f0, Math.max(0, y0 - m), c - w / 2 - m, f1, y1 + m, c + w / 2 + m, 'door');
        L.box(a0, y0, c - w / 2, a1, y1, c + w / 2, 'white');
      } else {
        if (frame) L.box(c - w / 2 - m, Math.max(0, y0 - m), f0, c + w / 2 + m, y1 + m, f1, 'door');
        L.box(c - w / 2, y0, a0, c + w / 2, y1, a1, 'white');
      }
    };
    // wnęka startowa: trzy łatki dla niebieskiego portalu
    patch('-x', 8, 6, 0, 2.6);                // aE
    patch('+x', -8, 6, 0, 2.6);               // aW
    patch('-z', Z1, 0, 0, 2.6);               // aS
    // tafla-pułapka na południowej ścianie B1
    patch('+z', -12, -9, 0, 4.5, 12, false);  // f
    // C2: łatki na południowej ścianie B2 (widoczne ze startu przez przerwę w B1)
    patch('+z', -32, 10, 1, 3.6);             // q
    patch('+z', -32, 15.5, 1, 3.6);           // q2 (ślepa uliczka)
    // północna strona B1: łatka lądowania m0 (nad wyspą N)
    patch('-z', -14, -12, 0, 2.6);            // m0
    // C3: r1 na B3 (od południa), r2 i r2b na B2 (od północy)
    patch('+z', -48, -12, 1.5, 4.1);          // r1
    patch('-z', -34, 4, 0.5, 3.1);            // r2
    patch('-z', -34, -2, 0.5, 3.1);           // r2b (ślepa uliczka)
    // północna ściana hali nad EP: łatka wyjściowa T
    patch('+z', Z0, 15, 0, 2.6);              // T

    // ---- kostka i przyciski ----
    L.cube(4.5, 0, 9);
    L.button('A', 0, 9);
    L.button('B', -10, -18);
    L.button('C', -1.8, 2.2);

    // ---- tablice ----
    L.sign('ODBICIE', 'hala luster', 7, 2, 0, 6.5, Z1 - 0.05, Math.PI);
    L.sign('A', 'przycisk', 2.4, 1.3, -7.95, 3.4, 10, -Math.PI / 2);
    L.sign('A', 'drzwi', 2.4, 1.3, -12, 6.3, -31.95, 0);
    L.sign('B', 'przycisk', 2.4, 1.3, X0 + 0.05, 3.4, -18, -Math.PI / 2);
    L.sign('B', 'drzwi', 2.4, 1.3, 10, 6.3, -47.95, 0);
    L.sign('WYJŚCIE', 'platforma EP', 5, 1.4, 6, 5.5, Z0 + 0.05, 0);
  },

  solve(T, upTo) {
    const stop = (s) => upTo === s;    // haczyk testowy: przerwij po etapie s
    const g = T.game, THREE = g.THREE, pl = g.player;
    const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    const frame = (i) => {
      const P = T.portal(i);
      const p = V3(P.pos), n = V3(P.normal), u = V3(P.up);
      return { p, n, u, r: new THREE.Vector3().crossVectors(u, n).normalize() };
    };
    // obraz celu „za” portalem wejściowym (1-out): strzał z oka w ten punkt wyleci z portalu `out` w stronę celu
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
    // miejsce (w prostokącie bnd) z którego oko celujące w `img` trafia w środek owalu portalu `entry`
    const stance = (entry, img, bnd, label) => {
      const I = frame(entry), host = g.portals[entry].host;
      let best = null;
      for (let ex = bnd[0]; ex <= bnd[1] + 1e-9; ex += 0.25) for (let ez = bnd[2]; ez <= bnd[3] + 1e-9; ez += 0.25) {
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
        if (e.dot(I.n) < 1.2) continue;
        let free = true;
        for (const b of g.boxes) {
          if (b.disabled || b.shootThrough || b === host) continue;
          if (ex + 0.4 > b.min.x && ex - 0.4 < b.max.x && ez + 0.4 > b.min.z && ez - 0.4 < b.max.z && b.max.y > 0.05 && b.min.y < 1.8) { free = false; break; }
          if (segHits(E, H, b)) { free = false; break; }
        }
        if (!free) continue;
        const score = q + 0.02 * Math.hypot(ex - pl.pos.x, ez - pl.pos.z);
        if (!best || score < best.score) best = { score, ex, ez, q };
      }
      T.assert(best, 'brak miejsca do celowania przez portal ' + entry + ' w ' + label);
      return best;
    };
    const SBND = [-7.2, 7.0, 1.2, 13];
    // przez niebieski (wejście, indeks 0) stawia pomarańczowy w punkcie target
    const hop = (target, label, bnd = SBND, press = false) => {
      const img = image(1, target);
      const s = stance(0, img, bnd, label);
      if (!press && Math.hypot(s.ex - pl.pos.x, s.ez - pl.pos.z) > 3) T.walkTo(s.ex, s.ez, 20);
      T.creep(s.ex, s.ez);
      T.wait(0.3);
      T.shoot(1, img.x, img.y, img.z);
      const P = T.portal(1);
      T.assert(P.active && Math.hypot(P.pos[0] - target[0], P.pos[2] - target[2]) < 1.6,
        'pomarańczowy nie wylądował na ' + label + ': ' + JSON.stringify(P.pos));
    };
    const PT = {
      q: [10, 2.3, -31.45], m0: [-12, 1.3, -14.55], r1: [-12, 2.8, -47.45],
      r2: [4, 1.8, -34.55], T: [15, 1.3, -61.45],
    };

    // ---- 1. kostka, niebieski na aE, pomarańczowy bezpośrednio na q ----
    T.walkTo(4.5, 5.5);
    T.grab(0);
    T.walkTo(0, 6);
    T.shoot(0, 0, 1.3, 13.4);                      // niebieski: aS
    T.walkTo(5.5, 3);
    T.shoot(1, ...PT.q);                           // pomarańczowy: q (przez przerwę w B1)
    if (stop('q')) return;
    // ---- 2. przez niebieski widać m0 ----
    hop(PT.m0, 'm0');
    if (stop('m0')) return;
    // ---- 3. wyspa N: kostka na przycisk B, powrót ----
    T.walkTo(0, 6);
    T.assert(T.walkThrough(0), 'nie wszedłem w niebieski (do N)');
    T.land(5);
    if (stop('N')) return;
    T.walkTo(-8.1, -18, 8);
    T.face(Math.PI / 2, 0);
    T.wait(0.6);
    T.drop();
    T.wait(1.2);
    T.assert(T.buttonPressed('B'), 'kostka nie leży na przycisku B');
    if (stop('cube')) return;
    T.assert(T.walkThrough(1), 'nie wróciłem przez m0');
    T.land(5);
    if (stop('back')) return;
    // ---- 4. przycisk A: z m0 przez D1 na r1 ----
    T.creep(0, 9);
    T.wait(0.3);
    T.assert(T.buttonPressed('A'), 'przycisk A niewciśnięty');
    hop(PT.r1, 'r1', [-0.6, 0.6, 8.4, 9.6], true);
    if (stop('r1')) return;
    // ---- 5. niebieski na aE (inny kąt), r1 -> r2, potem z przycisku C: r2 -> T ----
    T.walkTo(0, 6);
    T.shoot(0, 7.4, 1.3, 6);
    if (stop('x2')) return;
    hop(PT.r2, 'r2');
    if (stop('r2')) return;
    T.creep(-1.8, 2.2);
    T.wait(0.3);
    T.assert(T.buttonPressed('C') && T.buttonPressed('B'), 'drzwi D2 nie mają obu przycisków');
    hop(PT.T, 'T', [-2.4, -1.2, 1.6, 2.8], true);
    if (stop('T')) return;
    // ---- 6. wejście w niebieski i spacer na pole ----
    T.walkTo(0, 3);
    T.assert(T.walkThrough(0), 'nie wszedłem w niebieski (do EP)');
    T.land(8);
    T.walkTo(15, -55.5, 10);
  },
};
