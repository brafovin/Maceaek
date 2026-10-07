import { DARK_ALL } from './util.js';

// Poziom 29 – „Rękawica”. Cztery próby pod rząd (oś -z, od z=22 do z=-98), każda z innej rodziny:
//  I   (z 22..-13)  Wyrzut: wieża 12 m, wylot portalu na białym pasie jej północnej ściany (widać go tylko z paska
//                   przed nią), spadek w portal na białej łatce posadzki i lot nad przepaścią 16,5 m. Poręcze z kratki
//                   obejmują schody i szczyt. Wolny wylot (marsz w portal z płaskiej podłogi) wpada do przepaści.
//  II  (z -13..-36) Kostki: drzwi czasowe (kurtyna w świetle drzwi oddaje kostkę na start), przepaść 10,5 m, półka 1,8 m
//                   ze stałym stopniem, ogrodzona od frontu kratką (kostkę zdejmiesz tylko z góry), dwa kursy przez
//                   portal, obie kostki muszą stanąć na dwóch przyciskach naraz.
//  III (z -36..-54) Zegar: slalom z czterech przegród z wąskimi szczelinami z kratki, przycisk czasowy 4 s; piechotą ~9 s,
//                   portalami ~2 s (strzał przez szczeliny). Portale trzeba ustawić, zanim ruszysz zegar.
//  IV  (z -54..-98) Wyrzutnia z zamkniętą komorą: drzwi D5 otwiera płyta B4 w zamkniętej komorze pod północną ścianą
//                   wieży (krata, dach, od południa wieża). Wlotem do komory jest tylko niska część białego pasa ściany
//                   wieży (pod dachem): kostkę trzeba wprowadzić przez portal (wylot nisko → kostka ląduje na płycie).
//                   Potem ten sam portal trzeba przestawić WYSOKO, nad dach (widać to miejsce dopiero z daleka od kraty),
//                   wejść po schodach i spaść w portal na łatce – lot nad przepaścią i kurtyną (portale znikają), lądowisko
//                   4 m wyżej. Kostka z wysokiego wylotu przelatuje nad komorą (albo wraca na start po lądowaniu na dachu).
// Kostki nie przechodzą przez drzwi D1, D3 i D4 (kurtyna w świetle drzwi zwraca je na start), więc każda próba ma
// własne kostki. Przepaści są bezpieczne (dno kilka metrów niżej, schody powrotne po stronie startu) – nic tu nie
// zabija, a pułapki są odwracalne (z komory wychodzi się przez otwór w podłodze, kostkę z dna przepaści da się odzyskać). Przepaści I
// i IV (16,5 i 14,5 m) są szersze od każdego lotu z małą prędkością – także z marszu w portal na płaskiej podłodze i ze
// sterowaniem w powietrzu – a nad nimi nie ma nic, na czym dałoby się stanąć.
// Łatki na posadzce (2,5 × 2,5 m) mieszczą tylko jeden portal, więc nie da się zrobić „sprężyny” podłoga-podłoga.
// Przejście I wymaga lotu z wysokości wieży (25 m/s) z portalu umieszczonego w górnej części białego pasa (środek >= ok. 8,5 m),
// przejście IV – z portalu nad dachem komory (środek >= ok. 9 m; niżej portal się nie postawi albo lot kończy w przepaści).
// Wylot gracza z portalu zależy od kierunku patrzenia przy strzale w łatkę i od tego, jak wolno schodzi z krawędzi – stąd zapas lotu.
// Limit brył: < 150 (patrz ENGINE.md).
const H = 24;

// podłoga z białymi łatkami na ciemnym tle (łatki: [x0,x1,z0,z1], nie nachodzą na siebie). Łatki są pełnej grubości
// podłogi (a nie cienkimi płytkami), bo w portal na podłodze trzeba móc wpaść
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
  const n = Math.ceil(depth / 0.54 - 1e-9), sh = depth / n;     // stopnie nie wyższe niż 0,54 m (auto-wejście 0,55)
  for (let k = 1; k <= n; k++) L.box(-14, -depth, z1 - 0.5 * (n + 1 - k), -10, -depth + sh * k, z1, 'dark');
}

// pełny dach nad przepaścią (używany tylko w próbie II): od dołu do sufitu, nie da się na nim stanąć ani nad nim przelecieć
function roof(L, zNear, zFar) {
  L.box(-14, 2.2, zFar, 14, H, zNear, 'dark');
}

// poręcz z kratki wzdłuż schodów: jeden wysoki płot (do top + 3,2 m) na całej długości. Zbieg z góry z biegu (10 m/s)
// to rzut ukośny – gracz leci wysoko ponad schodami, więc poręcz „stopniowo niższa” przeciekała bokiem na wysokości
// 6–10 m. Płot sięga ponad każdy możliwy łuk (z wyskokiem z samego szczytu najwyżej ~top + 1,5 m).
function stairRail(L, xa, xb, zA, zB, top) {
  L.box(xa, 0, zA, xb, top + 3.2, zB, 'grate');
}

// biały pas na ciemnej podłodze oznacza krawędź przepaści (za wąski na portal)
function edge(L, z0, z1, y = 0) {
  L.box(-14, y, z0, 14, y + 0.04, z1, 'white');
}

// kluczowe współrzędne (używane też w solve)
const STEPS = 23, TREAD = 0.4;                 // schody wież: 23 stopnie o wysokości ok. 0,52 m i głębokości 0,4 m
const S1 = { x0: 2, x1: 8, z0: 9, z1: 14, top: 12, zN: 6.5, zF: -10, pz0: 14.75, pz1: 17.25, roomS: 22 };
const T_TB = 4;                                // czas przycisku S3
const W3 = { z0: -36, z1: -33, doorX0: -8.7, doorX1: -7.3 };   // gruba ściana (tunel) między S2 a S3
const S3 = { lanes: [-40.6, -43.8, -47, -50.2], plate: -53 };
const ZW = -54;                                // północna powierzchnia ściany W4 (początek próby IV)
const S4 = { x0: 0, x1: 8, z0: ZW - 11, z1: ZW - 7, top: 12, up: 4 };   // up: wysokość lądowiska i pola wyjścia
S4.zE = S4.z0 - 3;                             // krawędź przepaści od strony wieży
S4.zF = S4.z0 - 17.5;                           // druga krawędź przepaści (lądowisko)
S4.wz = S4.zF - 6;                             // przegroda z drzwiami D5
const ROOM_N = -98;

export default {
  name: 'Rękawica',
  hint: 'Cztery próby, jedna po drugiej, każda z innej bajki. Nie wszystko da się zabrać ze sobą, portale służą nie tylko tobie – a kurtyna nie wybacza.',
  spawn: { x: -6, y: 0, z: 20, yaw: 0.35 },
  exit: { x: 6, y: S4.up, z: S4.wz - 4.5 },
  build(L) {
    L.room(-14, 14, ROOM_N, S1.roomS, H, DARK_ALL);
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
      T.run(6, {}, () => pl.onGround);
    };

    // ===== S1: wyrzut z wieży =====
    const s1 = S1;
    T.walkTo(-8, s1.zN + 1.2, 10);                   // na pasek między przepaścią a wieżą
    T.walkTo(5, s1.zN + 0.7, 8);
    T.shoot(1, 5, 10.2, s1.z0 - 0.3);               // wylot: jak najwyżej na białym pasie północnej ściany wieży
    T.walkTo(-8, s1.zN + 1.2, 8); T.walkTo(-8, s1.roomS - 1.7, 10); T.walkTo(5, s1.roomS - 1.7, 8);
    T.shoot(0, 5, 0, (s1.pz0 + s1.pz1) / 2);         // wejście: biała łatka na posadzce przed wieżą
    T.walkTo(0, s1.roomS - 1.6, 10); T.face(0, 0);
    T.walkTo(0, s1.z0 + 1.2, 40); T.walkTo(4, s1.z0 + 1.2, 5);
    T.assert(pl.pos.y > 11.5, 'szczyt wieży S1: ' + JSON.stringify(T.st()));
    stepOff(5, s1.z1 - 0.2, Math.PI);
    T.assert(pl.pos.z < s1.zF - 0.3 && pl.onGround, 'lądowisko S1: ' + JSON.stringify(T.st()));

    // ===== S2: komora z przepaścią =====
    T.wait(0.5);
    T.walkTo(-8, -11.6, 8); T.wait(0.3);             // przycisk czasowy otwiera drzwi D1
    T.walkTo(0, -11, 4, true); T.walkTo(0, -15.5, 4, true);
    T.assert(pl.pos.z < -14, 'drzwi D1 zamknięte');
    // wejście na półkę (stały stopień) po kostkę C2
    T.walkTo(-3, -17.3, 6); T.walkTo(-6.4, -15.1, 8); T.wait(0.4); T.face(Math.PI / 2, 0);
    T.run(0.3, { KeyW: 1, Space: 1 }, null);         // wskok na stopień
    T.run(1, {}, () => pl.onGround);
    T.run(0.3, { KeyW: 1, Space: 1 }, null);         // ze stopnia na półkę
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

    // ===== S4: wyrzutnia, komora z płytą i kurtyna =====
    const { z0, z1, zF, wz } = S4;
    // strzał w punkt na ścianie pod ostrym kątem: celujemy głębiej niż punkt trafienia (promień na pewno przetnie ścianę)
    const shootFace = (i, hx, hy, hz) => { const e = T.eye(); T.shoot(i, e[0] + (hx - e[0]) * 1.25, e[1] + (hy - e[1]) * 1.25, e[2] + (hz - e[2]) * 1.25); };
    T.grab(2);                                       // kostka tej próby
    T.walkTo(-4, ZW - 2, 6); T.walkTo(-4, z0 - 2.4, 6);
    shootFace(1, 4, 4.2, z0 - 0.3);                  // wlot do komory: NISKO na białym pasie (pod dachem) – przez zachodnią kratę
    T.walkTo(-4, z1 + 0.55, 6); T.walkTo(2.4, z1 + 0.55, 6);
    T.shoot(0, 5, 0, z1 + 2);                        // wejście: łatka na posadzce przed wieżą
    T.walkTo(2.4, z1 + 4.2, 6); T.walkTo(5, z1 + 4.2, 6); T.face(0, 0); T.wait(0.4);
    T.drop(); T.wait(2.0);                           // kostka wpada w łatkę i wylatuje w komorze na płytę B4
    T.assert(T.buttonPressed('B4'), 'B4 niewciśnięty: ' + JSON.stringify(T.cube(0).pos));
    T.walkTo(2.4, z1 + 4.2, 6); T.walkTo(-4, z1 + 4.2, 8); T.walkTo(-4, z0 - 2.4, 8); T.walkTo(-10, z0 - 2.4, 8);
    shootFace(1, 4, 11.2, z0 - 0.3);                  // wylot: na samej górze pasa, nad dachem komory (widać go dopiero z daleka od kraty)
    T.walkTo(-4, z1 + 0.55, 8); T.walkTo(-4, z0 + 9.9, 8); T.walkTo(11, z0 + 9.9, 8);
    T.face(0, 0.6); T.walkTo(11, z0 + 0.8, 25);
    T.walkTo(9, z0 + 0.8, 5);
    T.assert(pl.pos.y > 11.5, 'szczyt wieży S4: ' + JSON.stringify(T.st()));
    T.walkTo(4.6, z1 - 0.4, 5);
    stepOff(4.7, z1 + 0.3, Math.PI);
    T.assert(pl.pos.z < zF - 0.3 && pl.onGround, 'lądowisko S4: ' + JSON.stringify(T.st()));
    T.walkTo(6, wz + 2.5, 6); T.walkTo(6, wz - 4.5, 8);
    T.run(4, { KeyW: 1 });
  },
};

function buildS1(L) {
  const { x0, x1, z0, z1, top, zN, zF, pz0, pz1, roomS } = S1;
  const n = STEPS, rise = top / n, sEnd = z0 + n * TREAD;
  // start: ciemna posadzka z jedną białą łatką przed wieżą (tam stanie niebieski portal), wieża (ciemna, tylko wysoko
  // na północnej ścianie biały pas), schody po zachodniej stronie
  floorWithPatches(L, -14, 14, zN, roomS, [[3.75, 6.25, pz0, pz1]]);
  edge(L, zN, zN + 0.5);
  safePit(L, -14, 14, zF, zN, 2.7);
  L.box(x0, 0, z0, x1, top, z1, 'dark');
  L.box(x0, 3.5, z0 - 0.3, x1, top - 0.2, z0, 'white');
  for (let i = 1; i <= n; i++) L.box(-2, 0, z0, x0, rise * i, z0 + TREAD * (n - i + 1), 'dark');
  // balustrada z kratki: od północy i od wschodu na szczycie, a wzdłuż schodów z obu stron (od wschodu tam, gdzie
  // schody wystają spoza wieży) – wysoki płot na całej długości
  L.box(-2, top, z0, x1, top + 3.2, z0 + 0.3, 'grate');
  L.box(x1 - 0.3, top, z0, x1, top + 3.2, z1, 'grate');
  stairRail(L, -2.3, -2, z0, sEnd, top);
  stairRail(L, x0, x0 + 0.3, z1, sEnd, top);
  L.sign('PRÓBA I', 'wieża', 5, 1.3, 13.95, 3.2, 12, -Math.PI / 2);
  L.sign('CEL: ZIELONE POLE', 'na końcu czterech prób – idź na północ', 6.4, 1.3, -13.95, 4.2, 11, Math.PI / 2);
  // lądowisko (podłoga: patrz S2)
  edge(L, zF - 0.5, zF);
}

// ---- S2: komora za oknem ----
function buildS2(L) {
  // ściana W1 z drzwiami D1 (otwiera je przycisk czasowy B0 na lądowisku)
  L.box(-14, 0, -14, -2, H, -13, 'dark');
  L.box(2, 0, -14, 14, H, -13, 'dark');
  L.box(-2, 4.5, -14, 2, H, -13, 'dark');
  L.door('B0', -2, 0, -14, 2, 4.5, -13);
  L.fizzler(-2, 0, -14, 2, 4.5, -13);              // kostka wyrzucona przez drzwi wraca na start (nie wpada do przepaści S1)
  L.button('B0', -8, -11.6, { timer: 8 });
  L.sign('DRZWI', 'przycisk czasowy', 5.2, 1.2, 0, 5.6, -12.95, 0);
  // posadzki: przedsionek, przepaść 10,5 m, strefa za nią
  L.floor(-14, 14, -19, -10, 'dark');              // lądowisko S1, podłoga pod ścianą W1 i przedsionek S2
  safePit(L, -14, 14, -29.5, -19, 3.5);
  L.box(13.4, 0, -16.5, 14, 5, -14, 'white');    // łatka NE na wschodniej ścianie przedsionka
  roof(L, -18, -22.7);                            // dach do sufitu (niski tunel): nie wejdziesz na niego z kostek ani z półki, kostka się na nim nie zatrzyma
  // ściana W3 – gruba (3 m), z wąskim przejściem D3 (x -8,7..-7,3): przez tunel nie da się strzelić w głąb S3;
  // z tej strony ściana jest ciemna, a łatka FW to cienka płytka z przodu
  const { z0: wz0, z1: wz1, doorX0: dx0, doorX1: dx1 } = W3;
  L.box(-14, 0, wz0, dx0, H, wz1, 'dark');
  L.box(dx1, 0, wz0, 14, H, wz1, 'dark');
  L.box(dx0, 4.5, wz0, dx1, H, wz1, 'dark');
  L.box(-4, 0, wz1, 4, 6, wz1 + 0.3, 'white');
  L.door(['B2', 'B2b'], dx0, 0, wz1 - 0.5, dx1, 4.5, wz1);          // oba przyciski naraz (domyślnie tryb „all”)
  L.fizzler(dx0, 0, wz1 - 0.5, dx1, 4.5, wz1);                      // kostki nie przejdą (wracają na start) i nie utrzymają drzwi
  L.floor(-14, 14, wz0, -29.5, 'dark');           // strefa za przepaścią i podłoga pod ścianą W3 (przejście drzwiami)
  edge(L, -19, -18.5);
  edge(L, -30, -29.5);
  L.box(-14, 0, -29.5, 14, H, -29.2, 'grate');       // krata przy krawędzi strefy za przepaścią: kostki nie da się rzucić z dna przepaści na przyciski (strzały i widok przechodzą)
  L.button('B2', 7.5, -31.4, { r: 0.9 });
  L.button('B2b', 11, -31.4, { r: 0.9 });
  // półka 1,8 m z kostką: sam nie wskoczysz, a z podłogi kostki nie zdejmiesz (front osłania kratka)
  L.box(-14, 0, -16.2, -9, 1.8, -14, 'dark');
  L.box(-14, 1.8, -16.2, -9, H, -15.9, 'grate');   // kratka do sufitu: kostka nie utknie na jej górze
  L.box(-9, 0, -16.2, -7.9, 0.9, -14, 'white');    // stały stopień przy półce: półka jest zawsze osiągalna (kostka rzucona na półkę da się stamtąd zabrać)
  L.cube(-13.3, 1.8, -14.8);                     // C2 – na półce, w głębi (z podłogi poza zasięgiem)
  L.cube(-3, 0, -15.5);                            // C1 – na posadzce
  L.sign('PRZYCISKI', '1 · 2', 6.2, 1.2, 9.25, 2.6, -32.95, 0);
  L.sign('DRZWI', '', 4.2, 1.2, -8, 5.6, -32.95, 0);
  L.sign('PRÓBA II', 'komora', 5, 1.3, -13.95, 3.4, -26.5, Math.PI / 2);
}

// ---- S3: slalom z przegród i zegar ----
// przegroda z wąskim oknem z kratki (x -5,6..-3, y 0,7..3,8) – przez okna widać i można strzelić w łatkę przy drzwiach,
// ale tylko z samej S3: okna leżą poza zasięgiem linii strzału przez tunel D3
function partition(L, z, gap) {
  const a = z - 0.2, b = z + 0.2;
  L.box(-5.6, 0, a, -3, 6, b, 'grate');
  if (gap === 'E') { L.box(-14, 0, a, -5.6, 6, b, 'dark'); L.box(-3, 0, a, 8, 6, b, 'dark'); }
  else { L.box(-8, 0, a, -5.6, 6, b, 'dark'); L.box(-3, 0, a, 14, 6, b, 'dark'); }
}
function buildS3(L) {
  L.floor(-14, 14, ZW, -40, 'dark');
  floorWithPatches(L, -14, 14, -40, -36, [[0.75, 3.25, -39.25, -36.75]]);   // łatka 2,5 × 2,5 m: tylko jeden portal
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
  L.sign('PRÓBA III', 'czas: ' + T_TB + ' s', 5.4, 1.3, -13.95, 3.2, -38, Math.PI / 2);
  L.sign('DRZWI', '', 4.6, 1.3, 1, 5.4, zp + 0.05, 0);
}

// ---- S4: wyrzutnia z zamkniętą komorą ----
// Pod północną ścianą wieży leży zamknięta komora (krata od zachodu i od północy, dach, od południa wieża): w środku płyta
// dociskowa B4, która otwiera drzwi D5. Do komory nie da się wejść ani niczego rzucić – wlot to tylko niska część białego pasa
// ściany wieży (pod dachem). Wyższa część pasa, nad dachem, służy do wyrzutu gracza (widać ją dopiero z daleka od kraty).
function buildS4(L) {
  const { x0, x1, z0, z1, top, zE, zF, wz } = S4;
  const n = STEPS, rise = top / n, sEnd = z0 + n * TREAD;
  // BP: łatka przed wieżą. Komora (x 0..12) ma podłogę, a jej wschodni kraniec (x 12..14) to otwór do przepaści – wyjście
  // dla gracza, który wyleciał z portalu zbyt wolno (kostka też tam spada i da się ją odzyskać z dna przepaści)
  floorWithPatches(L, -14, 14, z0, ZW, [[3.75, 6.25, z1 + 0.75, z1 + 3.25]]);
  floorWithPatches(L, -14, -0.3, zE, z0, []);
  L.floor(-0.3, 12, zE, z0, 'dark');                       // podłoga komory
  L.box(12, -8, zE, 14, -3, z0, 'dark');                   // otwór w podłodze (dno 3 m niżej)
  safePit(L, -14, 14, zF, zE, 2.7);
  L.box(-14, -8, ROOM_N, 14, S4.up, zF, 'dark');           // lądowisko i strefa wyjścia – 4 m wyżej niż start próby
  edge(L, zF - 0.5, zF, S4.up);
  L.box(-14, 0, zE, -0.3, 0.04, zE + 0.5, 'white');
  // wieża: ciemna, tylko wysoko na północnej ścianie biały pas (x 1,6..6,4): dolna część (y 2,5..5,9) leży w komorze, górna (nad dachem) na zewnątrz
  L.box(x0, 0, z0, x1, top, z1, 'dark');
  L.box(1.6, 2.5, z0 - 0.3, 6.4, top, z0, 'white');
  for (let i = 1; i <= n; i++) L.box(x1, 0, z0, 14, rise * i, z0 + TREAD * (n - i + 1), 'dark');
  // komora: północna krata (do 6,4 m – powyżej leci gracz), dach, zachodnia krata (do sufitu – strzały przechodzą, kostki nie)
  L.box(0, 0, zE, 14, 6.4, zE + 0.3, 'grate');
  L.box(0, 5.9, zE + 0.3, 14, 6.4, z0, 'dark');
  L.fizzler(0, 6.4, zE + 0.3, 14, 6.9, z0 - 0.3);          // kostka, która wyleci nad dach i spadnie na niego, wraca na start (nie ma jak jej stamtąd zdjąć)
  L.box(x0 - 0.3, 0, zE, x0, H, z0, 'grate');
  L.button('B4', 4, z0 - 1.6, { r: 2.1 });
  // poręcze: północna nad schodami i szczytem do sufitu (kostki nie da się przerzucić do komory), zachodnia nad szczytem,
  // od wschodu wzdłuż odsłoniętej krawędzi schodów – wysoki płot na całej długości
  L.box(x0, top, z0, 14, H, z0 + 0.3, 'grate');
  L.box(x0, top, z0, x0 + 0.3, H, z1, 'grate');             // do sufitu: kostka nie utknie na górze płotu
  stairRail(L, x1, x1 + 0.3, z1, sEnd, top);
  L.fizzler(-14, 0, zE - 5.5, 14, 17, zE - 5.4);
  L.button('T2', -6.5, ZW - 2.5, { timer: T_TB });
  L.cube(-10, 0, ZW - 3.5);                                     // C3 – kostka tej próby (z poprzednich nie da się przejść)
  // pełna przegroda z drzwiami D5 – jedyne przejście do pola wyjścia
  const up = S4.up;
  L.box(-14, up, wz - 1, 4, H, wz, 'dark');
  L.box(8, up, wz - 1, 14, H, wz, 'dark');
  L.box(4, up + 4, wz - 1, 8, H, wz, 'dark');
  L.door('B4', 4, up, wz - 1, 8, up + 4, wz);
  L.sign('PRÓBA IV', 'ostatnia', 5.6, 1.3, -13.95, 3.4, ZW - 6, Math.PI / 2);
  L.sign('PŁYTA', 'zamknięta komora', 4.4, 1.2, 13.95, 3, z0 - 1.6, -Math.PI / 2);
  L.sign('DRZWI', '', 4.6, 1.2, 6, S4.up + 5.4, wz + 0.05, 0);
  L.sign('WYJŚCIE', 'za drzwiami', 5, 1.2, 13.95, S4.up + 2.6, wz - 3.5, -Math.PI / 2);
}
