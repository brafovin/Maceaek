import { DARK_ALL } from './util.js';

// Poziom 29 – „Gauntlet”. Cztery próby pod rząd (oś -z, od z=16 do z=-90), każda z innej rodziny:
//  I   (z 16..-13)  Wyrzut: wieża 8 m, wylot portalu na białym pasie jej północnej ściany (widać go tylko z paska
//                   przed nią), spadek w portal na posadzce i lot nad przepaścią 8,5 m. Poręcze z kratki obejmują
//                   schody i szczyt, a nad krawędzią wisi niska belka – skok z rozbiegu (także z air-strafe) odpada.
//  II  (z -13..-36) Kostki: drzwi czasowe, przepaść 10,5 m, półka 1,8 m ogrodzona od frontu (kostkę zdejmiesz tylko
//                   z góry), dwa kursy przez portal, obie kostki muszą stanąć na dwóch przyciskach naraz.
//  III (z -36..-54) Zegar: slalom z czterech przegród z wąskimi oknami z kratki, przycisk czasowy 4 s; piechotą ~9 s,
//                   portalami ~2 s (strzał przez okna). Portale trzeba ustawić, zanim ruszysz zegar.
//  IV  (z -54..-90) Wieża i kurtyna: pasek przed wieżą jest zamknięty kratą (celuj przez nią), kostka tej próby musi
//                   zostać na przycisku na szczycie (otwiera pełną przegrodę z drzwiami D5), bo przez kurtynę nie
//                   przejdzie, a gracz leci nad nią na pędzie z portalu i traci portale.
// Kostki nie przechodzą przez drzwi D3 i D4 (kurtyna w świetle drzwi zwraca je na start), więc każda próba ma
// własne kostki. Przepaści są bezpieczne (dno kilka metrów niżej, schody powrotne po stronie startu) – nic tu nie
// zabija, a pułapki są odwracalne.
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

// bezpieczna przepaść: dno `depth` m niżej (głębiej, niż sięga skok ze stosem dostępnych w danej próbie kostek, więc nie da się
// z niego wyjść na drugą stronę), schody wyjściowe tylko po stronie południowej (z1) – po wpadnięciu wracasz pieszo, bez kwasu
function safePit(L, x0, x1, z0, z1, depth) {
  L.box(x0, -8, z0, x1, -depth, z1, 'dark');
  const n = Math.round(depth / 0.5);
  for (let k = 1; k <= n; k++) L.box(-14, -depth, z1 - 0.5 * (n + 1 - k), -10, -depth + 0.5 * k, z1, 'dark');
}

// niska belka nad krawędzią przepaści (obejmuje też górę schodów powrotnych): pod nią mieścisz się w pełni, ale skoku
// już nie wykonasz, a skok z rozbiegu z wcześniejszego miejsca rozbija się o jej czoło
function lid(L, zNear, zFar, top = 2.6) {
  L.box(-14, 2.2, zFar, 14, top, zNear, 'dark');
}

// biały pas na ciemnej podłodze oznacza krawędź (za wąski na portal)
function edge(L, z0, z1) {
  L.box(-14, 0, z0, 14, 0.04, z1, 'white');
}

// kluczowe współrzędne (używane też w solve)
const S1 = { towerX0: 2, towerX1: 8, towerZ0: 5.5, towerZ1: 10.5, top: 8 };
const T_TB = 4;                                // czas przycisku S3
const W3 = { z0: -36, z1: -33, doorX0: -8.7, doorX1: -7.3 };   // gruba ściana (tunel) między S2 a S3
const S3 = { lanes: [-40.6, -43.8, -47, -50.2], plate: -53 };
const ZW = -54;                                // północna powierzchnia ściany W4 (początek próby IV)
const S4 = { x0: 0, x1: 8, z0: ZW - 9, z1: ZW - 5, top: 8 };

export default {
  name: 'Gauntlet',
  hint: 'Cztery próby, jedna po drugiej. Nie wszystko da się zabrać ze sobą – a kurtyna nie wybacza.',
  spawn: { x: 8, y: 0, z: 14, yaw: 0 },
  exit: { x: 6, y: 0, z: -85.5 },
  build(L) {
    L.room(-14, 14, -89, 16, H, DARK_ALL);
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
    T.shoot(1, 5, 9.5, 5.8);                         // wylot: jak najwyżej na białym pasie północnej ściany wieży
    T.walkTo(11, 4.3, 10); T.walkTo(11, 15, 10); T.walkTo(5, 15.3, 10);
    T.shoot(0, 5, 0, 12.3);                          // wejście: posadzka przed wieżą
    T.walkTo(0, 15.4, 10); T.face(0, 0);
    T.walkTo(0, 6.3, 40); T.walkTo(4, 6.3, 5);
    stepOff(5, 10.3, Math.PI);
    T.assert(pl.pos.z < -5.5 && pl.onGround, 'lądowisko S1: ' + JSON.stringify(T.st()));

    // ===== S2: komora z przepaścią =====
    T.wait(0.5);
    T.walkTo(-8, -9, 6); T.wait(0.3);                // przycisk czasowy otwiera drzwi D1
    T.walkTo(0, -11, 4, true); T.walkTo(0, -15.5, 4, true);
    T.assert(pl.pos.z < -14, 'drzwi D1 zamknięte');
    // kostka C1 jako stopień do półki z kostką C2
    T.grab(1);
    T.walkTo(-5.4, -15.1, 8); T.face(Math.PI / 2, 0); T.wait(0.5);
    T.drop(); T.wait(1.0);
    T.walkTo(-6.7, -15.1, 4); T.face(Math.PI / 2, 0);
    T.run(0.3, { KeyW: 1, Space: 1 }, null);         // wskok na kostkę
    T.run(1, {}, () => pl.onGround);
    T.run(0.3, { KeyW: 1, Space: 1 }, null);         // z kostki na półkę
    T.run(1, {}, () => pl.onGround);
    T.assert(pl.pos.y > 1.7, 'półka');
    T.walkTo(-10.5, -14.9, 4);
    const cross = (idx, first) => {
      T.grab(idx);
      T.walkTo(-8.4, -14.9, 6);
      T.walkTo(-6, -16.3, 6);
      if (first) {
        T.walkTo(0, -16.3, 6);
        T.shoot(1, 0, 2.0, -33);                     // wylot: łatka FW za przepaścią
        T.shoot(0, 13.4, 2.0, -15.3);                // wejście: NE w przedsionku
      } else T.walkTo(11, -16.3, 6);
      T.assert(T.walkThrough(0), 'przejście NE→FW');
      T.wait(0.4);
    };
    cross(0, true);                                  // C2 na pierwszy przycisk
    T.walkTo(7.5, -29.9, 6); T.face(0, 0); T.wait(0.5);
    T.drop(); T.wait(1.2);
    T.assert(T.buttonPressed('B2'), 'B2 niewciśnięty');
    T.walkTo(0, -31.5, 6);
    T.assert(T.walkThrough(1), 'powrót przez FW');
    T.wait(0.4);
    cross(1, false);                                 // C1 na drugi przycisk
    T.walkTo(11, -29.9, 6); T.face(0, 0); T.wait(0.5);
    T.drop(); T.wait(1.2);
    T.assert(T.buttonPressed('B2b'), 'B2b niewciśnięty');
    T.walkTo(-8, -31.5, 6); T.face(0, 0);
    T.walkTo(-8, -37, 6);                            // przez drzwi D3 (kurtyna zabiera portale, ale one już niepotrzebne)
    T.assert(pl.pos.z < -36, 'drzwi D3 zamknięte');

    // ===== S3: slalom i zegar =====
    T.walkTo(-4.5, -37.3, 4);
    T.shoot(1, -4.3, 2.8, S3.plate - 0.5);           // wylot: łatka przy drzwiach (przez okna w przegrodach)
    T.shoot(0, 2, 0, -38.2);                         // wejście: posadzka przy przycisku
    T.walkTo(-3, -38.5, 4);                          // stań na przycisku
    T.wait(0.3);
    const PB = T.portal(0).pos;
    T.walkTo(PB[0] - 1.6, PB[2], 3, true);
    T.assert(T.walkThrough(0, { run: true }), 'wejście PB');
    T.walkTo(0, ZW - 0.6, 5, true);
    T.assert(pl.pos.z < ZW, 'drzwi D4 zamknięte');

    // ===== S4: wieża, kurtyna, lądowisko =====
    const { z0, z1 } = S4;
    T.grab(2);                                       // kostka tej próby
    T.walkTo(-4, ZW - 2, 6); T.walkTo(-4, z0 - 1.6, 6);
    T.shoot(1, 7, 9, z0 + 0.5);                      // wylot: wysoko na białym pasie ściany wieży – przez kratę z zachodu
    T.walkTo(-4, z1 + 0.55, 6); T.walkTo(5, z1 + 0.55, 8);
    T.shoot(0, 5, 0, z1 + 2.2);                      // wejście: posadzka przed wieżą
    T.walkTo(7.4, z0 + 6, 5); T.walkTo(7.4, z0 + 8.6, 5); T.walkTo(11, z0 + 8.6, 5);
    T.face(0, 0); T.walkTo(11, z0 + 0.8, 20);
    T.walkTo(9, z0 + 0.8, 5);
    T.assert(hold(), 'kostka na schodach');
    T.walkTo(5.9, z0 + 2, 5); T.face(Math.PI / 2, 0); T.wait(0.5);
    T.drop(); T.wait(1.0);                           // kostka zostaje na przycisku B4
    T.assert(T.buttonPressed('B4'), 'B4 niewciśnięty');
    T.walkTo(4.6, z1 - 0.4, 5);
    stepOff(4.7, z1 + 0.3, Math.PI);
    T.assert(pl.pos.z < z0 - 3 - 8.5 && pl.onGround, 'lądowisko S4: ' + JSON.stringify(T.st()));
    T.walkTo(6, z0 - 3 - 15.5 + 2.5, 6); T.walkTo(6, -85.5, 8);
    T.run(4, { KeyW: 1 });
  },
};

function buildS1(L) {
  const { towerX0: x0, towerX1: x1, towerZ0: z0, towerZ1: z1, top } = S1;
  // start: biała posadzka, wieża (ciemna, tylko wysoko na północnej ścianie biały pas), schody po zachodniej stronie
  L.floor(-14, 14, 3, 16, 'floor');
  safePit(L, -14, 14, -5.5, 3, 2.5);
  L.box(x0, 0, z0, x1, top, z1, 'dark');
  L.box(x0, 3.5, z0 - 0.3, x1, top - 0.2, z0, 'white');
  const n = top / 0.5;
  for (let i = 1; i <= n; i++) L.box(-2, 0, z0, x0, 0.5 * i, z0 + 0.5 * (n - i + 1), 'dark');
  // balustrada z kratki: od północy i od wschodu na szczycie, a wzdłuż schodów od zachodu – stopniowo niższa
  L.box(-2, top, z0, x1, top + 3.2, z0 + 0.3, 'grate');
  L.box(x1 - 0.3, top, z0, x1, top + 3.2, z1, 'grate');
  L.box(-2.3, 0, z0, -2, top + 1.7, z0 + 3, 'grate');
  L.box(-2.3, 0, z0 + 3, -2, top - 0.7, z0 + 6, 'grate');
  L.box(-2.3, 0, z0 + 6, -2, top - 3.6, z0 + 8.2, 'grate');
  lid(L, 4, 0.3);
  L.sign('PRÓBA I', 'wyrzut', 5, 1.3, 13.95, 3.2, 8, Math.PI / 2);
  // lądowisko
  L.floor(-14, 14, -13, -5.5, 'dark');
  edge(L, -6, -5.5);
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
  // posadzki: przedsionek, przepaść 10,5 m, strefa za nią
  L.floor(-14, 14, -19, -14, 'dark');
  safePit(L, -14, 14, -29.5, -19, 3.5);
  L.floor(-14, 14, -33, -29.5, 'dark');
  edge(L, -19, -18.5);
  edge(L, -30, -29.5);
  L.box(13.4, 0, -16.5, 14, 5, -14, 'white');    // łatka NE na wschodniej ścianie przedsionka
  lid(L, -18, -22.7, H);                          // belka do sufitu (niski tunel): nie wejdziesz na nią z kostek ani z półki, kostka się na niej nie zatrzyma
  // ściana W3 – gruba (3 m), z wąskim przejściem D3 (x -8,7..-7,3): przez tunel nie da się strzelić w głąb S3;
  // z tej strony ściana jest ciemna, a łatka FW to cienka płytka z przodu
  const { z0: wz0, z1: wz1, doorX0: dx0, doorX1: dx1 } = W3;
  L.box(-14, 0, wz0, dx0, H, wz1, 'dark');
  L.box(dx1, 0, wz0, 14, H, wz1, 'dark');
  L.box(dx0, 4.5, wz0, dx1, H, wz1, 'dark');
  L.box(-4, 0, wz1, 4, 6, wz1 + 0.3, 'white');
  L.door(['B2', 'B2b'], dx0, 0, wz1 - 0.5, dx1, 4.5, wz1);          // oba przyciski naraz (domyślnie tryb „all”)
  L.fizzler(dx0, 0, wz1 - 0.5, dx1, 4.5, wz1);                      // kostki nie przejdą (wracają na start) i nie utrzymają drzwi
  L.floor(-14, 14, wz0, wz1, 'dark');             // pod ścianą W3 (przejście drzwiami)
  L.button('B2', 7.5, -31.4, { r: 0.9 });
  L.button('B2b', 11, -31.4, { r: 0.9 });
  // półka 1,8 m z kostką: sam nie wskoczysz, a z podłogi kostki nie zdejmiesz (front osłania kratka)
  L.box(-14, 0, -16.2, -9, 1.8, -14, 'dark');
  L.box(-14, 1.8, -16.2, -9, 7, -15.9, 'grate');
  L.cube(-13.3, 1.8, -14.8);                     // C2 – na półce, w głębi (z podłogi poza zasięgiem)
  L.cube(-3, 0, -15.5);                            // C1 – na posadzce
  L.sign('PRZYCISKI', 'oba trzymają drzwi', 6.2, 1.2, 9.25, 2.6, -32.95, 0);
  L.sign('DRZWI', 'kostki nie przejdą', 4.2, 1.2, -8, 5.6, -32.95, 0);
  L.sign('PRÓBA II', 'dwie kostki', 5, 1.3, -13.95, 3.4, -23, -Math.PI / 2);
}

// ---- S3: slalom z przegród i zegar ----
// przegroda z wąskim oknem z kratki (x -5,6..-3, y 0,7..3,8) – przez okna widać i można strzelić w łatkę przy drzwiach,
// ale tylko z samej S3: okna leżą poza zasięgiem linii strzału przez tunel D3
function partition(L, z, gap) {
  const a = z - 0.2, b = z + 0.2;
  L.box(-5.6, 0.7, a, -3, 3.8, b, 'grate');
  L.box(-5.6, 0, a, -3, 0.7, b, 'dark');
  L.box(-5.6, 3.8, a, -3, 6, b, 'dark');
  if (gap === 'E') { L.box(-14, 0, a, -5.6, 6, b, 'dark'); L.box(-3, 0, a, 8, 6, b, 'dark'); }
  else { L.box(-8, 0, a, -5.6, 6, b, 'dark'); L.box(-3, 0, a, 14, 6, b, 'dark'); }
}
function buildS3(L) {
  L.floor(-14, 14, ZW, -40, 'dark');
  floorWithPatches(L, -14, 14, -40, -36, [[0, 4, -39.5, -36.5]]);
  S3.lanes.forEach((z, i) => partition(L, z, i % 2 === 0 ? 'E' : 'W'));
  // ściana W4: z tej strony ciemna, łatka PC to cienka płytka z przodu; drzwi D4 (x -2..2) z kurtyną w świetle
  const zp = S3.plate;
  L.box(-14, 0, ZW, -2, H, zp, 'dark');
  L.box(-8, 0, zp, -2, 5, zp + 0.3, 'white');
  L.box(-2, 4.5, ZW, 2, H, zp, 'dark');
  L.box(2, 0, ZW, 14, H, zp, 'dark');
  L.door(['T1', 'T2'], -2, 0, ZW, 2, 4.5, zp, { mode: 'any' });
  L.fizzler(-2, 0, ZW, 2, 4.5, zp);
  L.button('T1', -3, -38.5, { timer: T_TB });
  L.sign('PRÓBA III', 'zegar: ' + T_TB + ' s', 5.4, 1.3, -13.95, 3.2, -38, -Math.PI / 2);
  L.sign('DRZWI', 'kostki nie przejdą', 4.6, 1.3, 1, 5.4, zp + 0.05, 0);
}

// ---- S4: wieża z przyciskiem, kurtyna nad przepaścią ----
// lustrzane odbicie S1: schody po wschodniej stronie wieży, pasek przed północną ścianą zamknięty kratą od zachodu
function buildS4(L) {
  const { x0, x1, z0, z1, top } = S4;
  const zE = z0 - 3;                                            // krawędź przepaści (od strony wieży)
  floorWithPatches(L, -14, 14, zE, ZW, [[2, 7, z1 + 0.5, z1 + 3.5]]);   // BP: łatka przed wieżą
  safePit(L, -14, 14, zE - 8.5, zE, 2.5);
  L.floor(-14, 14, -89, zE - 8.5, 'dark');                      // lądowisko i strefa wyjścia
  edge(L, zE - 9, zE - 8.5);
  edge(L, zE, zE + 0.5);
  // wieża: ciemna, tylko wysoko na północnej ścianie biały pas
  L.box(x0, 0, z0, x1, top, z1, 'dark');
  L.box(x0, 3.5, z0 - 0.3, x1, top - 0.2, z0, 'white');
  const n = top / 0.5;
  for (let i = 1; i <= n; i++) L.box(x1, 0, z0, 14, 0.5 * i, z0 + 0.5 * (n - i + 1), 'dark');
  // poręcze: północna nad schodami i szczytem (wysoka – kostki nie da się przerzucić na zamknięty pasek),
  // zachodnia nad szczytem, od zachodu wzdłuż odsłoniętej krawędzi schodów – stopniowo niższa
  L.box(x0, top, z0, 14, top + 6.5, z0 + 0.3, 'grate');
  L.box(x0, top, z0, x0 + 0.3, top + 3.2, z1, 'grate');
  L.box(x1, 0, z1, x1 + 0.3, top - 1.7, z0 + 6, 'grate');
  L.box(x1, 0, z0 + 6, x1 + 0.3, top - 3.6, z0 + 8.2, 'grate');
  // pasek przed północną ścianą jest zamknięty kratą od zachodu (od południa i wschodu zamyka go wieża ze schodami) – celuj przez nią
  L.box(x0 - 0.3, 0, zE, x0, 15, z0, 'grate');
  lid(L, zE + 1, zE - 2.7);
  L.button('B4', 4, z0 + 2, { y: top });
  L.fizzler(-14, 0, zE - 4.3, 14, 12, zE - 4.2);
  L.button('T2', -6.5, ZW - 2.5, { timer: T_TB });
  L.cube(-10, 0, ZW - 3.5);                                     // C3 – kostka tej próby (z poprzednich nie da się przejść)
  // pełna przegroda z drzwiami D5 – jedyne przejście do pola wyjścia
  const wz = zE - 15.5;
  L.box(-14, 0, wz - 1, 4, H, wz, 'dark');
  L.box(8, 0, wz - 1, 14, H, wz, 'dark');
  L.box(4, 4, wz - 1, 8, H, wz, 'dark');
  L.door('B4', 4, 0, wz - 1, 8, 4, wz);
  L.sign('PRÓBA IV', 'wieża i kurtyna', 5.6, 1.3, -13.95, 3.4, ZW - 6, -Math.PI / 2);
  L.sign('DRZWI', 'przycisk na wieży', 4.6, 1.2, 6, 5.4, wz + 0.05, 0);
  L.sign('WYJŚCIE', 'za drzwiami', 5, 1.2, 13.95, 2.6, wz - 3.5, Math.PI / 2);
}
