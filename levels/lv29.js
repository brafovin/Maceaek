import { DARK_ALL } from './util.js';

// Poziom 29 – „Gauntlet”. Cztery próby pod rząd (oś -z, od z=16 do z=-72), każda z innej rodziny:
//  I   (z 16..-13)  Wyrzut: wieża 8 m, wylot portalu na jej północnej ścianie (widać ją tylko z paska przed nią),
//                   spadek w portal na posadzce i lot nad przepaścią 9 m. Poręcz z kratki nie pozwala wykonać skoku z rozbiegu.
//  II  (z -13..-34) Kostki: drzwi czasowe, przepaść 10,5 m, półka 1,8 m z kostką (stopień z drugiej kostki),
//                   dwa kursy przez portal, kostka na przycisku trzyma drzwi D3.
//  III (z -34..-47) Zegar: slalom z kratek, przycisk czasowy 4 s; piechotą ~6,5 s, portalami ~2 s (strzał przez kratki).
//                   Kostkę trzeba zabrać ze sobą.
//  IV  (z -47..-72) Wieża i kurtyna: kostka musi zostać na przycisku na szczycie wieży (otwiera drzwi do wyjścia),
//                   bo przez kurtynę nie przejdzie, a gracz leci nad nią na pędzie z portalu i traci portale.
// Przepaści są bezpieczne (dno 4 m niżej, schody powrotne po stronie startu) – nic tu nie zabija, a pułapki są odwracalne.
const H = 24;

// podłoga z białymi łatkami na ciemnym tle (łatki: [x0,x1,z0,z1], nie nachodzą na siebie)
function floorWithPatches(L, x0, x1, z0, z1, patches) {
  const xs = [...new Set([x0, x1, ...patches.flatMap(p => [p[0], p[1]])])].sort((a, b) => a - b);
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i], b = xs[i + 1];
    const cover = patches.filter(p => p[0] <= a && p[1] >= b).sort((p, q) => p[2] - q[2]);
    let z = z0;
    for (const p of cover) {
      if (p[2] > z) L.floor(a, b, z, p[2], 'dark');
      L.floor(a, b, p[2], p[3], 'floor');
      z = p[3];
    }
    if (z < z1) L.floor(a, b, z, z1, 'dark');
  }
}

// bezpieczna przepaść: dno 4 m niżej (nie da się z niego wyjść na drugą stronę, nawet ze stosem kostek),
// schody wyjściowe tylko po stronie południowej (z1) – po wpadnięciu wracasz pieszo, bez kwasu
function safePit(L, x0, x1, z0, z1) {
  L.box(x0, -8, z0, x1, -4, z1, 'dark');
  for (let k = 1; k <= 8; k++) L.box(-14, -4, z1 - 0.5 * (9 - k), -10, -4 + 0.5 * k, z1, 'dark');
}

// kluczowe współrzędne (używane też w solve)
const S1 = { towerX0: 2, towerX1: 8, towerZ0: 5.5, towerZ1: 10.5, top: 8, pitZ0: -6 };
const T_TB = 4;                               // czas przycisku S3

export default {
  name: 'Gauntlet',
  hint: 'Cztery próby, jedna po drugiej. Przemyśl, co zostawiasz za sobą: portale, kostki i czas – a kurtyna nie wybacza.',
  spawn: { x: 8, y: 0, z: 14, yaw: 0 },
  exit: { x: 11, y: 0, z: -68 },
  build(L) {
    L.room(-14, 14, -72, 16, H, DARK_ALL);
    buildS1(L);
    buildS2(L);
    buildS3(L);
    buildS4(L);
  },
  solve(T) {
    const pl = T.game.player, G = T.game;
    const hold = () => G.mech.held;
    // spadanie z krawędzi wieży wolnym krokiem w portal na posadzce, aż nastąpi teleport (pęd na północ)
    const stepOff = (x, zEdge, dirYaw) => {
      T.creep(x, zEdge); T.face(dirYaw, 0);
      for (let k = 0; k < 400; k++) {
        const sp = Math.hypot(pl.vel.x, pl.vel.z);
        T.run(0.02, { KeyW: sp < 2 ? 1 : 0 }, null);
        if (pl.vel.z < -5) break;
      }
      T.assert(pl.vel.z < -5, 'lot nie wystartował');
      T.run(5, {}, () => pl.onGround);
    };

    // ===== S1: wyrzut z wieży =====
    T.walkTo(11, 12, 10); T.walkTo(11, 4.3, 10); T.walkTo(5, 4.3, 10);
    T.shoot(1, 5, 6.3, 5.5);                         // wylot: wysoko na północnej ścianie wieży
    T.walkTo(11, 4.3, 10); T.walkTo(11, 15, 10); T.walkTo(5, 15.3, 10);
    T.shoot(0, 5, 0, 12.3);                          // wejście: posadzka przed wieżą
    T.walkTo(0, 15.4, 10); T.face(0, 0);
    T.walkTo(0, 6.3, 40); T.walkTo(4, 6.3, 5);
    stepOff(5, 10.3, Math.PI);
    T.assert(pl.pos.z < -6 && pl.onGround, 'lądowisko S1: ' + JSON.stringify(T.st()));

    // ===== S2: komora z przepaścią =====
    T.wait(0.5);
    T.walkTo(-8, -9, 6); T.wait(0.3);                // przycisk czasowy otwiera drzwi D1
    T.walkTo(0, -11, 4, true); T.walkTo(0, -16, 4, true);
    T.assert(pl.pos.z < -14, 'drzwi D1 zamknięte');
    // kostka C1 jako stopień do półki z kostką C2
    T.grab(1);
    T.walkTo(-5.4, -15.2, 8); T.face(Math.PI / 2, 0); T.wait(0.5);
    T.drop(); T.wait(1.0);
    T.walkTo(-6.7, -15.2, 4); T.face(Math.PI / 2, 0);
    T.run(0.3, { KeyW: 1, Space: 1 }, null);         // wskok na kostkę
    T.run(1, {}, () => pl.onGround);
    T.run(0.3, { KeyW: 1, Space: 1 }, null);         // z kostki na półkę
    T.run(1, {}, () => pl.onGround);
    T.assert(pl.pos.y > 1.7, 'półka');
    T.walkTo(-10.5, -15.2, 4);
    const cross = (idx, first) => {
      T.grab(idx);
      T.walkTo(-6, -17, 6);
      if (first) {
        T.walkTo(0, -17, 6);
        T.shoot(1, 0, 2.0, -33);                     // wylot: łatka FW za przepaścią
        T.shoot(0, 13.4, 2.0, -16.5);                // wejście: NE w przedsionku
      } else T.walkTo(11, -16.5, 6);
      T.assert(T.walkThrough(0), 'przejście NE→FW');
      T.wait(0.4);
    };
    cross(0, true);                                  // C2 na przycisk
    T.walkTo(8, -29.9, 6); T.face(0, 0); T.wait(0.5);
    T.drop(); T.wait(1.2);
    T.assert(T.buttonPressed('B2'), 'B2 niewciśnięty');
    T.walkTo(0, -31.5, 6);
    T.assert(T.walkThrough(1), 'powrót przez FW');
    T.wait(0.4);
    cross(1, false);                                 // C1 – zabieramy dalej
    T.walkTo(-8, -31.5, 6); T.face(0, 0);
    T.walkTo(-8, -35.5, 6);
    T.assert(hold(), 'kostka w rękach');

    // ===== S3: slalom i zegar =====
    T.walkTo(-6, -35.3, 4);
    T.shoot(1, -5, 2.5, -46);                        // wylot: ściana przy drzwiach (przez kratki)
    T.shoot(0, 2, 0, -36);                           // wejście: posadzka przy przycisku
    T.walkTo(-3, -36.5, 4);                          // stań na przycisku (z kostką w rękach)
    T.wait(0.3);
    const PB = T.portal(0).pos;
    T.walkTo(PB[0] - 1.6, PB[2], 3, true);
    T.assert(T.walkThrough(0, { run: true }), 'wejście PB');
    T.walkTo(6, -46.8, 5, true);
    T.assert(pl.pos.z < -46.5, 'drzwi D4 zamknięte');

    // ===== S4: wieża, kurtyna, lądowisko =====
    T.walkTo(11, -48.5, 5); T.walkTo(11, -56.2, 6); T.walkTo(4, -56.2, 5);
    T.shoot(1, 4, 6.2, -54.5);                       // wylot: wysoko na północnej ścianie wieży
    T.walkTo(11, -56.2, 5); T.walkTo(11, -49.9, 6); T.walkTo(5, -49.95, 5);
    T.shoot(0, 5, 0, -48.3);                         // wejście: posadzka przed wieżą
    T.walkTo(-10, -49.6, 8); T.walkTo(-10, -52.5, 4);
    T.walkTo(-1, -52.5, 20);
    T.assert(hold(), 'kostka na schodach');
    T.walkTo(2.2, -52.5, 5); T.face(-Math.PI / 2, 0); T.wait(0.5);
    T.drop(); T.wait(1.0);                           // kostka zostaje na przycisku B4
    T.assert(T.buttonPressed('B4'), 'B4 niewciśnięty');
    T.walkTo(4.6, -50.9, 5);
    stepOff(4.7, -50.2, Math.PI);
    T.walkTo(5, -68, 6); T.walkTo(7, -68, 6); T.walkTo(11, -68, 6);
  },
};

function buildS1(L) {
  const { towerX0: x0, towerX1: x1, towerZ0: z0, towerZ1: z1, top } = S1;
  // start: biała posadzka, wieża (białe ściany, ciemny wierzch), schody po zachodniej stronie
  L.floor(-14, 14, 3, 16, 'floor');
  safePit(L, -14, 14, -6, 3);
  L.box(x0, 0, z0, x1, top - 0.2, z1, 'white');
  L.box(x0, top - 0.2, z0, x1, top, z1, 'dark');
  const n = top / 0.5;
  for (let i = 1; i <= n; i++) L.box(-2, 0, z0, x0, 0.5 * i, z0 + 0.5 * (n - i + 1), 'dark');
  // balustrada z kratki od północy i boków wieży (nie da się zeskoczyć z rozbiegu)
  L.box(-2, top, z0, x1, top + 3.2, z0 + 0.3, 'grate');
  L.box(x1 - 0.3, top, z0, x1, top + 3.2, z1, 'grate');
  L.sign('PRÓBA I', 'wyrzut', 5, 1.3, 13.95, 3.2, 8, Math.PI / 2);
  // lądowisko
  L.floor(-14, 14, -13, -6, 'dark');
}

// ---- S2: komora za oknem ----
function buildS2(L) {
  // ściana W1 z drzwiami D1 (otwiera je przycisk czasowy B0 na lądowisku)
  L.box(-14, 0, -14, -2, H, -13, 'dark');
  L.box(2, 0, -14, 14, H, -13, 'dark');
  L.box(-2, 4.5, -14, 2, H, -13, 'dark');
  L.door('B0', -2, 0, -14, 2, 4.5, -13);
  L.button('B0', -8, -9, { timer: 8 });
  L.sign('DRZWI', 'przycisk czasowy', 5.2, 1.2, 0, 5.6, -12.95, 0);
  L.floor(-14, 14, -14, -13, 'dark');             // pod ścianą
  // posadzki: przedsionek, przepaść 8,5 m, strefa za nią
  L.floor(-14, 14, -19, -14, 'dark');
  safePit(L, -14, 14, -29.5, -19);
  L.floor(-14, 14, -33, -29.5, 'dark');
  L.box(13.4, 0, -18.5, 14, 5, -14.5, 'white');  // łatka NE na wschodniej ścianie przedsionka
  // ściana W3: drzwi D3 (x -10..-6), łatka FW na wprost przepaści
  L.box(-14, 0, -34, -10, H, -33, 'dark');
  L.box(-10, 4.5, -34, -6, H, -33, 'dark');
  L.box(-6, 0, -34, -4, H, -33, 'dark');
  L.box(-4, 0, -34, 4, 6, -33, 'white');
  L.box(-4, 6, -34, 4, H, -33, 'dark');
  L.box(4, 0, -34, 14, H, -33, 'dark');
  L.door('B2', -10, 0, -34, -6, 4.5, -33);
  L.floor(-14, 14, -34, -33, 'dark');             // pod ścianą W3 (przejście drzwiami)
  L.button('B2', 8, -31.4, { r: 0.9 });
  L.box(-14, 0, -16.5, -9, 1.8, -14, 'dark');     // półka z kostką (1,8 m: sam nie wskoczysz)
  L.cube(-11.5, 1.8, -15.2);                     // C2 – na półce
  L.cube(-3, 0, -15.5);                            // C1 – na posadzce
  L.sign('PRZYCISK', 'trzyma drzwi', 4.2, 1.2, 8, 2.6, -32.95, 0);
  L.sign('PRÓBA II', 'dwie kostki', 5, 1.3, -13.95, 3.4, -23, -Math.PI / 2);
}

// ---- S3: slalom z kratek i zegar ----
function buildS3(L) {
  L.floor(-14, 14, -46, -38, 'dark');
  floorWithPatches(L, -14, 14, -38, -34, [[0, 4, -37.5, -34.5]]);
  L.box(-14, 0, -38.3, 8, 6, -38, 'grate');       // P1: przejście od wschodu
  L.box(-8, 0, -42.3, 14, 6, -42, 'grate');       // P2: przejście od zachodu
  // ściana W4: łatka PC, drzwi D4 (x 4..8)
  L.box(-14, 0, -47, -8, H, -46, 'dark');
  L.box(-8, 0, -47, -2, 5, -46, 'white');
  L.box(-8, 5, -47, -2, H, -46, 'dark');
  L.box(-2, 0, -47, 4, H, -46, 'dark');
  L.box(4, 4.5, -47, 8, H, -46, 'dark');
  L.box(8, 0, -47, 14, H, -46, 'dark');
  L.door(['T1', 'T2'], 4, 0, -47, 8, 4.5, -46, { mode: 'any' });
  L.floor(-14, 14, -47, -46, 'dark');             // pod ścianą W4
  L.button('T1', -3, -36.5, { timer: T_TB });
  L.sign('PRÓBA III', 'zegar: ' + T_TB + ' s', 5.4, 1.3, -13.95, 3.2, -36, -Math.PI / 2);
  L.sign('DRZWI', 'wyjście ze slalomu', 5.6, 1.3, 6, 5.4, -45.95, 0);
}

// ---- S4: wieża z przyciskiem, kurtyna nad przepaścią ----
const S4 = { x0: 0, x1: 8, z0: -54.5, z1: -50.5, top: 8 };
function buildS4(L) {
  const { x0, x1, z0, z1, top } = S4;
  floorWithPatches(L, -14, 14, -57, -47, [[2, 7, -50, -47]]);   // BP: łatka przed wieżą
  safePit(L, -14, 14, -65.5, -57);
  L.floor(-14, 14, -72, -65.5, 'dark');                         L.sign('PRÓBA I', 'wyrzut', 5, 1.3, 13.95, 3.2, 8, Math.PI / 2);
  // lądowisko
  L.box(x0, 0, z0, x1, top - 0.2, z1, 'white');
  L.box(x0, top - 0.2, z0, x1, top, z1, 'dark');
  const n = top / 0.5;
  for (let i = 1; i <= n; i++) L.box(-0.5 * (n - i + 1), 0, z0, x0, 0.5 * i, z1, 'dark');
  L.box(-8, 0, z0, x1, top + 3.2, z0 + 0.3, 'grate');          // balustrada od północy (też wzdłuż schodów)
  L.box(x1 - 0.3, top, z0, x1, top + 3.2, z1, 'grate');
  L.button('B4', 4, -52.5, { y: top });
  L.fizzler(-14, 0, -61.05, 14, 12, -60.95);
  L.button('T2', 11.5, -49.5, { timer: T_TB });
  // przegroda z drzwiami D5 przed polem wyjścia
  L.box(6, 0, -72, 8, H, -69.5, 'dark');
  L.box(6, 0, -66.5, 8, H, -65.5, 'dark');
  L.box(6, 4, -69.5, 8, H, -66.5, 'dark');
  L.door('B4', 6, 0, -69.5, 8, 4, -66.5);
  L.sign('PRÓBA IV', 'wieża i kurtyna', 5.6, 1.3, 13.95, 3.4, -52, Math.PI / 2);
  L.sign('WYJŚCIE', 'za drzwiami', 5, 1.2, 13.95, 2.6, -68, Math.PI / 2);
}
