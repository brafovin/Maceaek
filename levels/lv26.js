import { DARK_ALL } from './util.js';

// Poziom 26 – „Wieża Babel”
//
// Pionowy szyb 14 x 14 m, wyjście na wysokości 64 m. Jedynym źródłem energii jest pętla: portal w podłodze
// i drugi nad nim (w suficie piętra) – spadek przez taką parę nabiera prędkości bez końca. W locie można
// przestawić jeden z portali tam, skąd chcemy wystartować (wyrzut w górę albo poziomy z zachowaniem pędu).
// Każda półka ma nad sobą masywny strop, który kończy wybicie w górę – wyżej da się wejść tylko przez
// kolejny etap. Ścianę z łatką W zasłania ciemna masa P3 (i strop nad P2): łatkę widać dopiero od stóp
// ok. 43 m (południowa ściana, z=6,7) lub ok. 47-50 m (kolumna pętli 3), a ze stania na P2 (stos kostek + skok
// to najwyżej ok. 41 m) – nie.
//
//  P0 (y=0)    parter: półka startowa na południu, pas pod P1 na wschodzie, łatki A i B na podłodze
//  P1 (y=12)   północ; spód ma białą łatkę (sufit pętli 1), na wierzchu łatka D wyrzutu (w „kominku” z kurtyn
//              fizzlera: pionowe kurtyny z boku i pozioma kurtyna na y 20-21 – każdy lot z D kasuje portale
//              i nie da się wrócić do D od góry, więc nie ma pompowania energii D <-> parter ani D -> E),
//              przycisk S
//  P2 (y=38)   południe; spód ma łatkę (sufit pętli 2), na wierzchu łatka pętli 3, przycisk B2 i kostka K2;
//              krawędź północna ma kurtynę fizzlera (zeskok na półkę stropu kasuje portale)
//  P3 (y=62)   północ: ciemna masa, zasłania północną ścianę z łatką W przed graczami z niższych pięter
//  P4 (y=64)   południe: wyjście; spód ma łatkę (sufit pętli 3)
//
// Blokady obejść (po recenzji): spody łatek D i E zakryte ciemnymi płytami; P2 wysoko (wyrzut z D po
// „drabince” parter <-> D sięga najwyżej ok. 34 m); spód P2 (łatka U2) zasłania osłona otwierana przyciskiem S
// (bez niej pętla parter <-> U2 działałaby od startu, a po spadku można by z góry postawić portal na D);
// kominek z kurtyn wokół D (także pozioma); kurtyna na północnej krawędzi P2;
// strop nad parterem ciągnie się nad całym południem jako drzwi otwierane przez S (bez S każdy wylot z łatek A
// i B kończy się pod nim, a łatki B i krawędzi stropu nie widać); łatka E na P2 przykryta drzwiami otwieranymi
// razem z zapadnią B2 (do wciśnięcia B2 nie przyjmie portalu).
//
// Etapy:
//  1. pętla pod P1 (podłoga pasa + spód P1), potem w locie pomarańczowy na łatkę parteru (wyrzut) – na P1,
//     z dala od kurtyn kominka; po drodze zabieramy kostkę K1 ze startu
//  2. K1 na przycisk S – odsłania łatkę U2 na spodzie P2. Pętla: łatka parteru B <-> spód P2
//     (spadek 36 m), w locie niebieski na łatkę D (z góry ją widać) – wyrzut z D na P2 (kurtyna kasuje portale)
//  3. K2 (leży na P2) na przycisk B2 – otwiera zapadnię nad łatką na P2. Pętla: P2 <-> spód P4; w locie
//     (dopiero z wysoka widać) łatka W na północnej ścianie; wylot poziomy przez kurtynę fizzlera na P4.
export default {
  name: 'Wieża Babel',
  hint: 'Po schodach tu nie wejdziesz: podłoga i sufit nad nią tworzą studnię bez dna, a w locie można przestawić portal. Osłony, strop i zapadnie otwiera tylko ciężar kostki, a kurtyna kasuje portale (także w pionie), lecz nie pęd.',
  spawn: { x: 3.5, y: 0, z: 5.5, yaw: 0 },
  exit: { x: -2, y: 64, z: 4.5 },
  build(L) {
    const Y1 = 12, Y2 = 38, Y3 = Y2 + 24, Y4 = Y2 + 26, ZF = 1.5;   // ZF: południowa krawędź środkowej szczeliny

    // podział prostokąta na pasy i łatki: mk(x0,x1,z0,z1,czyŁatka)
    const tile = (x0, x1, z0, z1, patches, mk) => {
      const ps = patches.map(p => [Math.max(p[0], x0), Math.min(p[1], x1), Math.max(p[2], z0), Math.min(p[3], z1)]);
      const xs = [...new Set([x0, x1, ...ps.flatMap(p => [p[0], p[1]])])].sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i++) {
        const xa = xs[i], xb = xs[i + 1];
        const iv = ps.filter(p => p[0] <= xa + 1e-9 && p[1] >= xb - 1e-9).sort((a, b) => a[2] - b[2]);
        let z = z0;
        for (const p of iv) {
          if (p[2] > z + 1e-9) mk(xa, xb, z, p[2], false);
          mk(xa, xb, p[2], p[3], true);
          z = p[3];
        }
        if (z1 > z + 1e-9) mk(xa, xb, z, z1, false);
      }
    };
    // płyta z białą łatką na wierzchu (łatka na całej grubości – gracz wpadający z dużą prędkością nie może
    // zderzyć się z czymś pod otworem, zanim portal go przeniesie)
    const slab = (yb, yt, x0, x1, z0, z1, patches) => tile(x0, x1, z0, z1, patches, (xa, xb, za, zb, w) => {
      L.box(xa, yb, za, xb, yt, zb, w ? 'white' : 'dark');
    });
    // cienka biała łatka przyklejona do spodu płyty
    const under = (yb, x0, x1, z0, z1) => L.box(x0, yb - 0.4, z0, x1, yb, z1, 'white');

    L.room(-7, 7, -7, 7, Y3 + 16.5, DARK_ALL);
    L.pit(-7, 7, -7, 7);

    // ---- P0: parter (y = 0) ----
    tile(-7, 1, -1.5, 7, [[-6, -2, -1.3, 1.3], [-6.5, -1.5, ZF + 0.3, 6.2]], (xa, xb, za, zb, w) => L.floor(xa, xb, za, zb, w ? 'floor' : 'dark'));
    tile(1, 7, -7, 7, [[2.5, 6.5, -6.2, -2.8]], (xa, xb, za, zb, w) => L.floor(xa, xb, za, zb, w ? 'floor' : 'dark'));

    // ---- P1 (y = 12), północ ----
    slab(Y1 - 2, Y1, -7, 7, -7, -2.5, [[-6.5, -1.5, -6.2, -2.8]]);
    under(Y1 - 2, 2.5, 6.5, -6.2, -2.8);                       // sufit pętli 1
    L.box(-6.5, Y1 - 2.4, -6.2, -1.5, Y1 - 2, -2.8, 'dark');   // zakrywa spód łatki D (inaczej portal ze startu)
    // kominek wokół łatki D: każdy lot z niej na południe lub wschód przecina kurtynę i kasuje portale – pętla
    // „parter <-> D” nie pompuje energii okrążenie po okrążeniu, a wylot z D jest tylko jednorazowym wystrzałem
    L.fizzler(-7, Y1, -2.75, -0.9, Y2 + 5.4, -2.65);
    L.fizzler(-1.0, Y1, -7, -0.9, Y2 + 5.4, -2.5);
    // pozioma kurtyna na całym przekroju kominka (y 20-21): każdy lot z D w górę kasuje portale, więc po wyrzucie
    // z D nie da się już od razu postawić portalu na E (pompa D -> E) ani wrócić do D. Dwie dodatkowe, węższe
    // kratownice leżą wewnątrz tej samej bryły – dają tylko czytelny wizualnie „sufit” z pasów.
    L.fizzler(-7, 20, -7, -0.9, 21, -2.7);
    L.fizzler(-7, 20, -6.0, -0.9, 21, -5.9);
    L.fizzler(-7, 20, -4.5, -0.9, 21, -4.4);

    // ---- P2 (y = 38), południe ----
    slab(Y2 - 2, Y2, -7, 7, ZF, 7, [[1.5, 6.5, ZF + 0.3, 6.2]]);
    under(Y2 - 2, -6.5, -1.5, ZF + 0.3, 6.2);                  // spód P2: sufit pętli 2
    L.box(1.5, Y2 - 2.4, ZF + 0.3, 6.5, Y2 - 2, 6.2, 'dark');   // zakrywa spód łatki E (inaczej portal ze startu)
    L.fizzler(-7, Y2 - 2.4, ZF - 0.65, 7, Y2 + 3.5, ZF - 0.55); // zejście lub skok z P2 na północ kasuje portale
    L.door('S', -6.5, Y2 - 2.8, ZF + 0.3, -1.5, Y2 - 2.4, 6.2); // osłona spodu U2: dopóki S nie jest wciśnięty, nie da się tam postawić portalu

    // ---- stropy nad środkiem szybu: zatrzymują wybicie w górę (dwa niższe pełne, najwyższy kratowy) ----
    L.box(-7, 23.5, -2.5, 7, 25.5, ZF, 'dark');                // nad parterem (wyrzut z parteru kończy się tu)
    L.door('S', -7, 23.5, ZF, 7, 25.5, 7);                     // ciąg dalszy stropu nad południem: otwiera go dopiero S
    L.box(-7, Y2 + 5.5, -7, 7, Y2 + 7.5, ZF, 'dark');          // nad P1
    L.box(-7, Y3 + 3.5, -7, 7, Y3 + 3.8, ZF, 'grate');         // nad P3 (strzał do łatki W przelatuje przez kratkę)

    // ---- P3: ciemna masa na północy (zasłania ścianę W) ----
    L.box(-7, Y3 - 2.4, -7, 7, Y3, -2.5, 'dark');

    // ---- P4 (y = 64), południe: wyjście; spód z łatką pętli 3 ----
    L.box(-7, Y4 - 2.4, ZF, 7, Y4, 7, 'dark');
    under(Y4 - 2.4, 1.5, 6.5, ZF + 0.3, 6.2);
    L.door('B2', 1.5, Y2 + 11.8, ZF + 0.3, 6.5, Y2 + 12.2, 6.2); // zapadnia nad łatką na P2
    L.door('B2', 1.5, Y2, ZF + 0.3, 6.5, Y2 + 0.4, 6.2);         // osłona łatki E na P2: do wciśnięcia B2 nie przyjmie portalu

    // ---- W: łatka na północnej ścianie, kurtyna fizzlera nad szybem ----
    L.box(-4, Y2 + 29.5, -7, 4, Y2 + 32, -6.6, 'white');
    L.fizzler(-7, Y3 + 4.1, -0.05, 7, Y3 + 14.5, 0.05);

    L.button('S', 4.5, -4.5, { y: Y1 });
    L.button('B2', -3.5, 5.2, { y: Y2 });
    L.cube(5.5, 0, 4);              // K1: na starcie
    L.cube(-5.8, Y2, 2.8);          // K2: na P2 (kurtyny kominka kasowałyby kostkę niesioną przez lot z D)

    L.sign('WYJŚCIE ↑', 'zielone pole, 64 m', 3.9, 1.6, 6.95, Y4 - 3.2, -0.5, Math.PI / 2);
    L.sign('SZCZYT', 'wyjście: 64 m wyżej', 8, 2.2, 0, 19, -6.95, 0);
    L.sign('KURTYNA', 'kasuje portale (też w pionie)', 6.4, 1.7, -4, 16.5, -6.95, 0);
    L.sign('STROP', 'otwiera go przycisk S', 6, 1.9, -6.95, 21.6, 4.5, Math.PI / 2);
    L.sign('S', 'odsłania łatkę pod P2', 4.5, 1.5, 4.5, 15.6, -6.95, 0);
    L.sign('OSŁONA', 'otwiera ją przycisk S', 6, 1.9, -6.95, 31.5, 4.5, Math.PI / 2);
    L.sign('B2', 'zapadnia nad łatką', 4.5, 1.5, -3.5, Y2 + 3.6, 6.95, Math.PI);
    L.sign('ZAPADNIA', 'i osłona łatki: przycisk B2', 6, 1.9, 6.95, Y2 + 10, 4.5, -Math.PI / 2);
  },
  solve(T) {
    const g = T.game, pl = g.player, DT = T.DT;
    const Y2 = 38;
    const stop = () => { const k = g.keys; k.KeyW = k.KeyS = k.KeyA = k.KeyD = k.ShiftLeft = false; };
    // sterowanie w powietrzu klawiszami (patrząc na północ): leć ku (tx,tz)
    const steer = (tx, tz) => {
      pl.yaw = 0;
      const cl = (v) => Math.max(-10, Math.min(10, v));
      const wx = cl((tx - pl.pos.x) * 2.5) - pl.vel.x, wz = cl((tz - pl.pos.z) * 2.5) - pl.vel.z, k = g.keys;
      k.KeyW = wz < -0.7; k.KeyS = wz > 0.7; k.KeyA = wx < -0.7; k.KeyD = wx > 0.7; k.ShiftLeft = true;
    };
    // leć/spadaj sterując ku (tx,tz); true = nastąpiła teleportacja; false = until() albo koniec czasu
    const fly = (tx, tz, until, maxSec = 8) => {
      const prev = pl.pos.clone();
      for (let i = 0; i < maxSec / DT; i++) {
        steer(tx, tz);
        g.step(DT);
        if (pl.pos.distanceTo(prev) > 2) { stop(); return true; }
        if (until && until()) { stop(); return false; }
        prev.copy(pl.pos);
      }
      stop();
      return false;
    };

    // ===== Etap 1: pętla pod P1, wyrzut z łatki na parterze =====
    T.walkTo(5, 3.4);
    T.grab(0);                                   // kostka K1 jedzie na piętro
    T.walkTo(3.5, 4, 4); T.face(0, 0);
    T.shoot(0, 4.5, 0, -4.5);                    // niebieski: podłoga pod P1
    T.shoot(1, 4.5, 9.6, -4.5);                  // pomarańczowy: spód P1
    const F = T.portal(0).pos;
    T.assert(T.walkThrough(0), 'nie wszedłem w portal pod P1');
    T.face(0, 0);
    T.assert(fly(F[0], F[2]), 'pętla: brak powrotu do portalu');   // pierwsze okrążenie
    T.shoot(1, -4, 0, 0.1);                      // w locie: pomarańczowy na łatkę parteru
    T.assert(fly(F[0], F[2]), 'pętla: brak wyrzutu');
    fly(1.5, -0.6, () => pl.pos.x > 0.3, 3);     // lot ku półce P1: najpierw na wschód, z dala od kurtyn kominka
    fly(2.5, -4.6, () => pl.onGround, 6);
    T.assert(pl.pos.y > 11.5, 'nie wylądowałem na P1: ' + JSON.stringify(T.st()));

    // ===== Etap 2: kostka na przycisk (osłona), długi spadek spod P2 =====
    T.walkTo(4.5, -2.8, 6);
    T.face(0, -0.45); T.wait(0.5);
    T.drop(); T.wait(1.2);                       // K1 na przycisk S: odsłania spód P2
    T.assert(T.buttonPressed('S'), 'przycisk S niewciśnięty');
    T.walkTo(3, -2.7, 6);
    T.face(Math.PI, 0);
    T.run(1.5, { KeyW: 1, ShiftLeft: 1 }, () => pl.onGround && pl.pos.y < 1);   // zeskok z P1 na południe
    T.land(6);
    T.assert(pl.pos.y < 1 && pl.pos.z > -1.6, 'zeskok nieudany: ' + JSON.stringify(T.st()));
    T.walkTo(3.5, 1.2, 8);
    T.face(0, 0);
    T.shoot(0, -4, Y2 - 2.4, 4.5);               // niebieski: spód P2 (sufit drugiej pętli) – po otwarciu osłony
    T.shoot(1, -4, 0, 4.5);                      // pomarańczowy: łatka w podłodze pod P2
    T.walkTo(3.5, 4, 4);
    const F2 = T.portal(1).pos;
    T.face(0, 0);
    T.assert(T.walkThrough(1), 'nie wszedłem w portal pod P2');
    T.face(0, 0);
    fly(F2[0], F2[2], () => pl.pos.y < 26, 4);   // spadek; łatkę D widać dopiero niżej (strop nad parterem ją zasłania)
    T.shoot(0, -4, 12, -3.9);                    // w locie: niebieski na półkę P1 (widać ją z góry)
    T.assert(fly(F2[0], F2[2]), 'brak wejścia w portal pod P2');
    fly(-1, 4.8, () => pl.onGround, 6);          // wybicie – dryf na południe, na P2
    T.assert(pl.pos.y > Y2 - 0.5, 'nie wylądowałem na P2: ' + JSON.stringify(T.st()));

    // ===== Etap 3: kostka na B2, pętla pod P4, wylot poziomy z północnej ściany przez kurtynę =====
    T.grab(1);                                   // K2 leży na P2
    T.walkTo(-3.5, 3.2, 6); T.face(Math.PI, -0.3); T.wait(0.5);
    T.drop(); T.wait(1.2);                       // K2 na przycisk B2: otwiera zapadnię nad łatką na P2
    T.assert(T.buttonPressed('B2'), 'przycisk B2 niewciśnięty');
    T.walkTo(0.5, 4.8, 4); T.face(-Math.PI / 2, 0);
    T.shoot(0, 4, Y2, 4.5);                      // niebieski: podłoga P2
    T.shoot(1, 4, Y2 + 23.6, 4.5);               // pomarańczowy: spód P4
    const F3 = T.portal(0).pos;
    T.assert(T.walkThrough(0), 'nie wszedłem w portal na P2');
    T.face(0, 0);
    fly(F3[0], F3[2], () => pl.pos.y < Y2 + 16, 4);   // spadek; północną ścianę widać dopiero z wysoka
    T.shoot(1, 0, Y2 + 30.75, -7);                       // pomarańczowy: wysoko na północnej ścianie
    T.assert(fly(F3[0], F3[2]), 'brak wejścia w portal na P2');
    fly(-2, 4.5, () => pl.onGround, 6);
    T.walkTo(-2, 4.5, 6);
  },
};
