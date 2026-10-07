import { DARK_ALL } from './util.js';

// Poziom 14 – „Schody z kostek”
//
// Układ (oś z: start przy +z, wyjście przy -z), sala x -16…16, z -46…28, h = 12:
//   z =  28 … 16   brzeg S (start). Biała płyta na zachodniej ścianie (jedyny portal przy starcie),
//                  kostka K1 i „cela” (x 8…16) ze szklaną ścianą, w niej kostka K2. Drzwi celi: A.
//   z =  16 …  4   przepaść z kwasem (12 m)
//   z =   4 … -4   wyspa: filar (białe ściany N i S), przycisk A (otwiera drzwi celi)
//   z =  -4 … -16  przepaść z kwasem (12 m)
//   z = -16 … -33  brzeg N: biała płyta na zachodniej ścianie, kostka K3
//   z = -33 … -46  półka 2,9 m nad podłogą (wyjście). Przed nią kurtyna fizzlera od 3,6 m w górę
//                  (żadna kostka nie może „zaginąć” na półce – wraca na start).
//
// Idea: półka (2,9 m) jest za wysoka na skok ze stosu dwóch kostek (1,6 + 1,47 = 3,07 m),
// ale na taki stos nie da się wejść z podłogi (1,6 > 1,47). Trzeba trzeciej kostki jako stopnia.
// Wszystkie trzy kostki muszą znaleźć się przy półce, a K2 jest zamknięta w celi, której drzwi
// otwiera przycisk na wyspie – więc ktoś (kostka) musi na nim zostać, dopóki K2 nie wyjdzie.
export default {
  name: 'Schody z kostek',
  hint: 'Jedna kostka to za mało, a dwie ułożone na sobie są za wysokie, żeby na nie wejść. Policz, ile ich potrzeba – i skąd wziąć te, których nie masz pod ręką.',
  spawn: { x: 0, y: 0, z: 24, yaw: 0 },
  exit: { x: 0, y: 2.9, z: -39 },
  build(L) {
    L.room(-16, 16, -46, 28, 12, DARK_ALL);

    // podłogi (wszystkie ciemne – portale tylko na białych płytach)
    L.floor(-16, 16, 16, 28, 'dark');            // brzeg S
    L.floor(-5, 5, -4, 4, 'dark');               // wyspa
    L.floor(-16, 16, -33, -16, 'dark');          // brzeg N
    L.pit(-16, 16, 4, 16);
    L.pit(-16, 16, -16, -4);
    L.pit(-16, -5, -4, 4);
    L.pit(5, 16, -4, 4);

    // komora z wyjściem: ściana z oknem (3 × 3,7 m) nad półką 2,9 m, w oknie kurtyna fizzlera
    L.box(-16, -8, -34, -3, 12, -33, 'dark');
    L.box(3, -8, -34, 16, 12, -33, 'dark');
    L.box(-3, 6.6, -34, 3, 12, -33, 'dark');
    L.box(-3, -8, -34, 3, 2.9, -33, 'dark');
    L.box(-8, -8, -46, 8, 2.9, -34, 'dark');         // podłoga komory (półka)
    L.box(-16, -8, -46, -8, 12, -34, 'dark');
    L.box(8, -8, -46, 16, 12, -34, 'dark');
    L.fizzler(-3, 2.9, -33.5, 3, 6.6, -33.49);

    // biała płyta S (zachodnia ściana) – od góry ciemny pas równo z nią
    L.box(-16, 0, 18, -15, 3.4, 26, 'white');
    L.box(-16, 3.4, 18, -15, 12, 26, 'dark');
    // biała płyta N
    L.box(-16, 0, -30, -15, 3.4, -22, 'white');
    L.box(-16, 3.4, -30, -15, 12, -22, 'dark');

    // filar na wyspie (do sufitu, żeby nic na nim nie zostało)
    L.box(-4.5, 0, -0.6, -1.5, 3.4, 0.6, 'white');
    L.box(-4.5, 3.4, -0.6, -1.5, 12, 0.6, 'dark');
    L.button('A', 3, 0);

    // cela
    L.box(8, 0, 16, 16, 12, 17, 'dark');             // północna ściana
    L.box(8, 4, 17, 9, 12, 28, 'dark');              // nadproże (cała zachodnia ściana nad 4 m)
    L.box(8, 3.2, 17, 9, 4, 21, 'dark');             // nadproże nad drzwiami
    L.box(8, 0, 21, 9, 4, 28, 'glass');              // szyba
    L.door('A', 8, 0, 17, 9, 3.2, 21);

    L.cube(-5, 0, 22);       // K1
    L.cube(12.5, 0, 24);     // K2 (w celi)
    L.cube(10, 0, -22);      // K3

    L.sign('DRZWI A', null, 4, 1.2, 7.99, 5.2, 19, Math.PI / 2);
    L.sign('A', 'przycisk', 1.1, 1.1, -1.49, 2.0, 0, -Math.PI / 2);
    L.sign('WYJŚCIE', 'półka 2,9 m nad podłogą', 9, 2.2, 0, 9.2, -32.99, 0);
  },
  solve(T) {
    const pl = T.game.player;
    const K1 = 0, K2 = 1, K3 = 2;
    // podejdź do portalu od frontu (nie przez filar) i wejdź w niego
    const enter = (i) => {
      const P = T.portal(i);
      T.walkTo(P.pos[0] + P.normal[0] * 2.2, P.pos[2] + P.normal[2] * 2.2);
      T.assert(T.walkThrough(i), 'nie wszedłem w portal ' + i);
      T.wait(0.4);
    };
    // postaw trzymaną kostkę w punkcie (x,z): stań 1,9 m dalej na południe, patrz na północ, upuść
    const place = (x, z) => {
      T.walkTo(x, z + 1.9);
      T.face(0, 0); T.wait(0.6); T.drop(); T.wait(1);
    };
    // skacz w stronę (x,z) (W + spacja), aż staniesz na wysokości >= minY
    const hop = (x, z, minY) => {
      for (let k = 0; k < 400; k++) {
        const dx = x - pl.pos.x, dz = z - pl.pos.z;
        pl.yaw = Math.atan2(-dx, -dz); pl.pitch = 0;
        const jump = pl.onGround && pl.pos.y < minY - 0.3;
        T.run(T.DT, { KeyW: Math.hypot(dx, dz) > 0.15 ? 1 : 0, Space: jump ? 1 : 0 }, null);
        if (k > 5 && pl.onGround && pl.pos.y > minY - 0.05) return;
      }
      T.assert(false, 'nie wskoczyłem na ' + minY);
    };

    // 1. K1 na przycisk A (wyspa): płyta S <-> filar (strona S)
    T.grab(K1);
    T.shoot(0, -15, 1.4, 22);
    T.shoot(1, -3, 1.5, 0.6);
    enter(0);                                   // jesteś na wyspie z kostką
    T.walkTo(3, 2.0); T.face(0, 0); T.wait(0.6); T.drop(); T.wait(1);
    T.assert(T.buttonPressed('A'), 'przycisk A niewciśnięty');

    // 2. wróć, wyjmij K2 z celi (drzwi otwarte, dopóki K1 leży na A)
    enter(1);
    T.walkTo(4, 19); T.walkTo(11, 19);
    T.grab(K2);
    T.walkTo(4, 19);
    enter(0);                                   // znowu na wyspie, tym razem z K2

    // 3. przestaw niebieski portal na płytę N; filar zostaje – K2 na brzeg N
    T.walkTo(2, 2.4);
    T.shoot(0, -15, 1.4, -26);
    enter(1);
    place(0, -32.45);                           // K2 = podstawa kolumny, przy samej ścianie

    // 4. po K1 (wciąż na przycisku) i na kolumnę
    enter(0);
    T.grab(K1);
    enter(1);
    const A = T.cube(K2).pos;
    place(A.x, A.z);                            // K1 na K2: kolumna 1,6 m

    // 5. K3 jako stopień tuż przed kolumną
    T.grab(K3);
    place(A.x, A.z + 0.8);

    // 6. schody: K3 -> kolumna -> półka
    const C = T.cube(K3).pos, B = T.cube(K1).pos;
    T.walkTo(C.x, C.z + 1.25);
    hop(C.x, C.z, 0.8);
    hop(B.x, B.z, 1.6);
    hop(B.x, -37, 2.9);
    T.walkTo(0, -39);
  },
};
