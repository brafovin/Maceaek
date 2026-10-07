// Poziom 13: Kostka w locie.
// Cały pomysł: kostka leży w klatce 30 m nad podłogą. Wypuszcza ją przycisk (zapadnia), ale tylko wtedy,
// gdy druga kostka leży na przycisku w koszu za przepaścią (rzut Q). Kostka spada w portal w podłodze,
// wylatuje z portalu wysoko na ścianie i leci nad przepaścią na wielki przycisk na wyspie.

export const P = {
  X0: -32, X1: 20, Z0: -10, Z1: 48, H: 36,   // sala
  BR: 13,            // krawędź platformy (zachodni brzeg)
  CELL_Y: 30,        // wysokość zapadni
  CELL_X: 16.9, CELL_Z: 44,   // środek klatki / łaty w podłodze
  PANEL_Z: 26,       // wysoka łata na ścianie, naprzeciw wyspy
  ISL_X0: -32, ISL_X1: -16.3, ISL_Z0: 21, ISL_Z1: 31,
  N_X0: -2.1, N_X1: 2.5, N_Z0: 11.7, N_Z1: 16.3,   // kosz na przycisk bramki
};

export default {
  name: 'Kostka w locie',
  hint: 'Do przycisku po drugiej stronie przepaści nic nie doleci z ręki. Energię znajdź tam, gdzie coś leży bardzo wysoko – i pomyśl, co z nią zrobi portal.',
  spawn: { x: 16, y: 0, z: 6, yaw: Math.PI / 2 },
  exit: { x: 16, y: 0, z: -4 },
  build(L) {
    const { X0, X1, Z0, Z1, H, BR, CELL_Y, CELL_X, CELL_Z, PANEL_Z, ISL_X0, ISL_X1, ISL_Z0, ISL_Z1, N_X0, N_X1, N_Z0, N_Z1 } = P;
    L.room(X0, X1, Z0, Z1, H, { n: 'dark', s: 'dark', e: 'dark', w: 'dark', ceil: 'dark' });

    // --- platforma startowa (wschodni pas) z łatą pod klatką ---
    const pa = 1.2;
    L.floor(BR, X1, Z0, CELL_Z - pa, 'dark');
    L.floor(BR, CELL_X - pa, CELL_Z - pa, CELL_Z + pa, 'dark');
    L.floor(CELL_X - pa, CELL_X + pa, CELL_Z - pa, CELL_Z + pa, 'floor');
    L.floor(CELL_X + pa, X1, CELL_Z - pa, CELL_Z + pa, 'dark');
    L.floor(BR, X1, CELL_Z + pa, Z1, 'dark');

    // --- przepaść ---
    L.pit(X0, BR, Z0, Z1);
    // Kostka leżąca na dnie przepaści (środek y = -5.599) nie przekracza progu kwasu (-5.6) i nigdy nie wraca na start,
    // więc dno wyściełamy cieniutkim fizzlerem: kostka, która spadnie, wraca na swoje miejsce.
    L.fizzler(X0, -6, Z0, BR, -5.82, Z1);

    // --- wyspa docelowa (cel dla kostki, nieosiągalna dla gracza) ---
    L.floor(ISL_X0, ISL_X1, ISL_Z0, ISL_Z1, 'dark');
    const zc = (ISL_Z0 + ISL_Z1) / 2;
    L.button('A', -24.6, zc, { r: 4.6 });

    // --- kosz na przycisk bramki (rzut Q) ---
    L.floor(N_X0, N_X1, N_Z0, N_Z1, 'dark');
    const nz = (N_Z0 + N_Z1) / 2;
    for (const dx of [0, -1.27, -2.54]) for (const dz of [-1.27, 0, 1.27]) L.button('N', N_X1 - 1.02 + dx, nz + dz, { r: 0.8 });
    L.box(N_X0 - 1, 0, N_Z0 - 1, N_X0, 14, N_Z1 + 1, 'dark');
    L.box(N_X0, 0, N_Z0 - 0.4, N_X1, 10, N_Z0, 'glass');
    L.box(N_X0, 0, N_Z1, N_X1, 10, N_Z1 + 0.4, 'glass');
    // osłona kosza: zamyka się, gdy N jest wciśnięty (druga kostka nie wpadnie do kosza i nie zablokuje poziomu)
    L.door('N', N_X1 + 0.1, 0, N_Z0 - 0.4, N_X1 + 0.6, 14, N_Z1 + 0.4, { invert: true });
    L.sign('N', 'tu leży kostka', 4, 1.6, N_X0 + 0.02, 2.4, nz, Math.PI / 2);
    L.sign('A', 'przycisk wyspy', 6, 2.4, ISL_X0 + 0.02, 5, zc, Math.PI / 2);
    L.sign('KOSTKA', 'zapadnia 30 m nad podłogą', 7, 1.8, X1 - 0.02, 21, CELL_Z, -Math.PI / 2);
    L.sign('B', 'zapadnia: N + B', 5, 1.8, X1 - 0.02, 3.5, 38, -Math.PI / 2);
    L.sign('WYJŚCIE', 'otwiera je A', 6, 1.8, 16, 3.2, 3.02, 0);

    // --- wysoka łata na wschodniej ścianie (wylot portalu) ---
    L.box(19, 11, PANEL_Z - 1.5, X1, 14, PANEL_Z + 1.5, 'white');

    // --- klatka z zapadnią ---
    L.door(['B', 'N'], CELL_X, CELL_Y - 0.3, CELL_Z - 0.6, X1, CELL_Y, CELL_Z + 0.6);
    L.box(CELL_X - 0.4, CELL_Y - 0.3, CELL_Z - 1.4, X1, CELL_Y + 1.6, CELL_Z - 0.6, 'glass');
    L.box(CELL_X - 0.4, CELL_Y - 0.3, CELL_Z + 0.6, X1, CELL_Y + 1.6, CELL_Z + 1.4, 'glass');
    L.cube(CELL_X, CELL_Y, CELL_Z);

    // --- przycisk zapadni i kostka do rzutu ---
    L.button('B', 15.5, 38);
    L.cube(17, 0, 14);

    // --- wyjście za drzwiami ---
    L.door('A', X0, -8, 2, X1, H, 3);
  },
  solve(T) {
    const W = Math.PI / 2;                        // yaw w stronę -x (zachód)
    // 1. rzut Q: kostka do kosza za przepaścią (przycisk bramki)
    T.walkTo(17, 9);
    T.grab(1);                                    // kostka na podłodze (druga zbudowana; pierwsza jest w klatce)
    T.walkTo(P.BR + 0.6, 14, 8);
    T.face(W, 0);
    T.wait(0.5);
    const eye = T.eye();
    let best = null;
    for (let p = 0.05; p < 1.3; p += 0.005) {      // szukamy kąta rzutu (balistyka)
      const sx = eye[0] - 1.9 * Math.cos(p), sy = eye[1] + 1.9 * Math.sin(p) - 0.15;
      const vx = -13 * Math.cos(p), vy = 13 * Math.sin(p) + 1.5;
      const D = vy * vy + 48 * (sy - 0.4);
      const x = sx + vx * (vy + Math.sqrt(D)) / 24;
      const err = Math.abs(x - 1.0);
      if (!best || err < best.err) best = { p, err };
    }
    T.face(W, best.p);
    T.wait(0.5);
    T.throwCube();
    T.wait(3);
    T.assert(T.buttonPressed('N'), 'kostka nie leży na przycisku bramki');
    // 2. wylot portalu: wysoko na łacie naprzeciw wyspy
    T.walkTo(P.BR + 0.6, 26, 8);
    T.shoot(1, 19, 13.4, 26);
    // 3. wlot portalu: łata w podłodze pod klatką; stań na przycisku zapadni
    T.walkTo(16.9, 40.2, 8);
    T.shoot(0, 16.9, 0, 44);
    T.walkTo(15.5, 38, 8);
    T.wait(9);
    T.assert(T.buttonPressed('A'), 'kostka nie doleciała na wyspę');
    T.walkTo(16, 8, 10, true);
    T.walkTo(16, -4, 10, true);
  },
};
