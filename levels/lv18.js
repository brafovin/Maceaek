import { DARK_ALL } from './util.js';

// Poziom 18 – „Zegar”.
// Układ (x – wschód, z – południe, gracz zaczyna na południu i patrzy na północ):
//   E (start, z 0..12) – przepaść G1 – wyspa z przyciskiem i podestem (z -30..-10) – przepaść G2 –
//   niski murek – dziedziniec (z -62..-44), a na jego wschodnim końcu drzwi i wyjście (x 36..46).
// Na wyspie nie da się dojść pieszo; drzwi na dziedzińcu są daleko od wszystkiego.
const TIMER = 5.5;

export default {
  name: 'Zegar',
  hint: 'Drzwi zamkną się chwilę po zejściu z przycisku, a piechotą nie zdążysz. Portale muszą stać, zanim ruszysz – i poszukaj miejsca, z którego widać więcej.',
  spawn: { x: 0, y: 0, z: 9, yaw: 0 },
  exit: { x: 41, y: 0, z: -53 },
  build(L) {
    L.room(-28, 46, -62, 12, 22, DARK_ALL);
    // pełne boki korytarza (wyspa, przepaście, start)
    L.box(-28, -8, -44, -10, 22, 12, 'dark');
    L.box(10, -8, -44, 46, 22, 12, 'dark');

    // start, przepaść G1, wyspa, przepaść G2, murek
    L.floor(-10, 10, 0, 12, 'dark');
    L.pit(-10, 10, -10, 0);
    L.floor(-10, 10, -30, -10, 'dark');
    L.pit(-10, 10, -42, -30);
    L.box(-10, -8, -44, 10, 3.2, -42, 'dark');
    // dziedziniec + sala wyjścia
    L.floor(-28, 46, -62, -44, 'dark');

    // podest (4 m) ze schodami od zachodu
    L.box(-10, 0, -30, 10, 4, -25, 'dark');
    for (let i = 1; i <= 8; i++) L.box(-10, 0, -25, -5, 0.5 * i, -25 + (9 - i), 'dark');
    // słup zasłaniający wschodnią płytkę przed startem
    L.box(4, 0, -16, 10, 6, -12, 'dark');

    // białe płytki (jedyne portalowalne powierzchnie)
    L.box(-10, 0, 3, -9.6, 3.6, 9, 'white');            // start (zachodnia ściana)
    L.box(-10, 4.8, -16, -9.6, 9, -11, 'white');        // wyspa, wysoko, od zachodu
    L.box(9.6, 0, -24, 10, 2.6, -18, 'white');          // wyspa, przy przycisku, od wschodu
    L.box(4, 0, -62, 14, 2.6, -61.6, 'white');          // dziedziniec, nisko, przy północnej ścianie
    L.box(-26, 5.5, -62, -16, 9.5, -61.6, 'white');     // dziedziniec, wysoko, daleko na zachodzie

    // przycisk czasowy i drzwi
    L.button('A', 3, -21, { timer: TIMER });
    L.box(34, 0, -62, 36, 22, -55, 'dark');
    L.box(34, 0, -51, 36, 22, -44, 'dark');
    L.box(34, 4, -55, 36, 22, -51, 'dark');
    L.door('A', 34, 0, -55, 36, 4, -51);

    // tablice
    L.sign('ZEGAR', 'drzwi otwarte 5,5 s po zejściu z przycisku', 9, 3, 0, 1.8, -41.9, 0);
    L.sign('5,5 s', 'przycisk czasowy', 3.6, 1.8, 9.95, 4.2, -21, Math.PI / 2);
    L.sign('WYJŚCIE', 'drzwi zamykają się po 5,5 s', 6, 2, 33.95, 6.5, -53, Math.PI / 2);
  },
  solve(T) {
    const pl = T.game.player;
    const W = Math.PI / 2, EAST = -Math.PI / 2;
    // 1. most na wyspę: niebieski na starcie, pomarańczowy wysoko na wyspie
    T.shoot(0, -9.6, 1.8, 6);
    T.shoot(1, -9.6, 7, -13.5);
    T.assert(T.walkThrough(0), 'nie przeszedłem na wyspę');
    T.land(8);
    // 2. wejście przy przycisku (pomarańczowy)
    T.shoot(1, 9.6, 1.2, -21);
    // 3. na podest – stąd widać dziedziniec ponad murkiem
    T.walkTo(-7.5, -16, 6);
    T.walkTo(-7.5, -27.5, 8);
    T.shoot(0, 9, 1.2, -61.6);
    // 4. zejście, przycisk, sprint
    T.walkTo(-7.5, -17, 8);
    T.walkTo(3, -21, 8);
    T.wait(0.2);
    T.assert(T.buttonPressed('A'), 'przycisk niewciśnięty');
    T.face(EAST, 0);
    T.assert(T.walkThrough(1, { run: true }), 'nie wszedłem w portal przy przycisku');
    const t = T.portal(0);
    T.walkTo(30, -53, 6, true);
    T.walkTo(41, -53, 6, true);
  },
};
