import { DARK_ALL } from './util.js';

// Poziom 30 – „Finał ostateczny”
//
// Układ (oś z: start przy +z, wyjście przy -z; hala x -18…18, z -66…22, h = 26; ściany działowe ze szkła,
// więc zielone pole wyjścia widać od pierwszej chwili – za dwiema szybami, nad kwasem):
//   A  z  22…6    start, kostka K1, biała płyta WA na zachodniej ścianie; przepaść z kwasem 14 m
//                 (nad przepaścią szyba od y = 2 m w górę – wysokie łuki rzutu kostką nie dolatują)
//   B  z  -8…-26  śluza: białe łaty FA (podłoga) i WB (ściana), przyciski A i B, klatka z kratek z DWIEMA kostkami
//                 (K2, K4) i łatą FB w środku; drzwi D1 (wymagają obu przycisków) przy wschodniej stronie
//                 szklanej ściany – wieża „Serce” zasłania wtedy linię strzału z hali B do płyty Y
//   C  z -26…-34  półka z kostką K3 i białą płytą X (zachodnia ściana), fizzler za drzwiami D1 (kostka go nie przejdzie);
//                 dalej kwas, a w nim wieża „Serce”: komora na wysokości 10 m z kratą-okienkiem od północy
//   N  za kwasem: północna ściana z białą płytą Y (wysoko), przed nią fizzler; po zachodniej stronie
//                 szklana „sala wyjścia” (D3 w jej wschodniej szybie)
//
// Rozwiązanie w skrócie: K1 przez przepaść A (WA -> FA), na przycisk A; klatka: portale przez kratkę (FB, WB),
// K2 na przycisk B -> D1 (fizzler za drzwiami czyści portale). Komora potrzebuje DWÓCH kostek (przyciski C i E),
// a na półce jest tylko K3 – drugą (K4) trzeba przenieść portalami, bo kostka dotykająca fizzlera wraca na start:
// niebieski na X, pomarańczowy przez otwarte D1 i kratkę na łatę FB w klatce, K4 przez FB -> X na półkę.
// Potem Y (północ, wysoko, z boku wieży) i strzał POMARAŃCZOWYM przez niebieski X: promień wylatuje z Y
// (przed Y fizzler – wejście w Y to śmierć i utrata portali), leci nad kwasem przez kratę-okienko i stawia portal
// na białej płycie IP w komorze wieży (innej drogi nie ma). K3 na przycisk C -> drzwi D3 otwarte; wracasz przez IP
// po K4 i kładziesz ją na E; niebieski przez okienko i D3 na łatę FN w sali wyjścia.
// Drzwi D4 przed polem wyjścia wymagają C i E (kostki muszą zostać) ORAZ czasowego T (5 s, przy zachodniej ścianie
// komory, daleko od IP): wciśnij T i biegiem IP -> FN -> D4 -> pole wyjścia (ok. 1,6 s zużyte z 5 s).
// Bezpieczeństwo: K1 i K2 zostają na A/B, więc po ewentualnej śmierci (utrata portali) D1 pozostaje otwarte.
export default {
  name: 'Finał ostateczny',
  hint: 'Pole wyjścia widać od początku – to droga do niego jest ukryta. Co zamknięte, otworzą cudze ciężary; a to, czego nie widzisz, może zobaczyć twój strzał.',
  spawn: { x: 0, y: 0, z: 18, yaw: 0 },
  exit: { x: -14, y: 0, z: -59 },
  build(L) {
    L.room(-18, 18, -66, 22, 26, DARK_ALL);

    // podłoga z łatą (4 ciemne kawałki + łata)
    const fp = (x0, x1, z0, z1, p) => {
      L.floor(x0, x1, z0, p[2], 'dark'); L.floor(x0, x1, p[3], z1, 'dark');
      L.floor(x0, p[0], p[2], p[3], 'dark'); L.floor(p[1], x1, p[2], p[3], 'dark');
      L.floor(p[0], p[1], p[2], p[3], 'floor');
    };

    // ---- A: start ----
    L.floor(-18, 18, 6, 22, 'dark');
    L.box(-18, 0, 9, -17, 3.4, 16, 'white');              // WA
    L.pit(-18, 18, -8, 6);
    // szyba nad przepaścią: dolna szczelina 2 m przepuszcza portale i niskie strzały, wysokie łuki rzutu kostką – nie
    L.box(-18, 2.0, -1, 18, 26, -0.7, 'glass');
    L.cube(-9, 0, 14);                                    // K1

    // ---- B: śluza ----
    fp(-18, 9, -26, -8, [-8, -2, -16, -9]);               // FA
    fp(9, 18, -26, -8, [11, 14.5, -20.4, -15]);          // FB (w klatce)
    L.box(-18, 0, -23, -17, 3.4, -17, 'white');           // WB
    // klatka z kratek (strzał przelatuje, gracz nie)
    L.box(8.7, 0, -22.3, 9.0, 5, -13.7, 'grate');
    L.box(8.7, 0, -22.3, 16.3, 5, -22.0, 'grate');
    L.box(8.7, 0, -14.0, 16.3, 5, -13.7, 'grate');
    L.box(16.0, 0, -22.3, 16.3, 5, -13.7, 'grate');
    L.box(8.7, 5, -22.3, 16.3, 5.3, -13.7, 'grate');
    L.cube(13.8, 0, -21.4);                                 // K2
    L.cube(15.3, 0, -14.7);                                 // K4 (zapasowa, też w klatce)
    L.button('A', -9, -19);
    L.button('B', 3, -19);

    // szklana ściana z drzwiami D1
    // (drzwi przy wschodniej stronie: wieża „Serce” zasłania wtedy linię strzału z hali B do płyty Y)
    L.box(-18, 0, -26.4, 5, 26, -26, 'glass');
    L.box(11, 0, -26.4, 18, 26, -26, 'glass');
    L.box(5, 6, -26.4, 11, 26, -26, 'glass');
    L.door(['A', 'B'], 5, 0, -26.4, 11, 6, -26);
    L.fizzler(5, 0, -27.6, 11, 6, -27.3);

    // ---- C: półka ----
    L.floor(-18, 18, -34, -26, 'dark');
    L.box(-18, 0, -33, -17, 3.4, -27, 'white');           // X
    L.cube(-8, 0, -29);                                   // K3

    // ---- kwas wokół wieży ----
    L.pit(-18, -1, -52, -34);
    L.pit(-1, 4, -66, -34);
    L.pit(14, 18, -66, -34);
    L.pit(4, 14, -66, -46);

    // ---- wieża „Serce”: podstawa i komora na 10 m ----
    L.box(4, -8, -46, 14, 10, -34, 'dark');
    L.box(4, 10, -46, 5, 18, -34, 'dark');                // zachód
    L.box(13, 10, -46, 14, 18, -34, 'dark');              // wschód
    L.box(4, 10, -35, 14, 18, -34, 'dark');               // południe
    L.box(6, 10, -36, 12, 13.4, -35, 'white');            // IP (nisko – portal przykleja się do podłogi)
    L.box(4, 10, -46, 6, 18, -45, 'dark');                // północ: filary, nadproże, krata
    L.box(12, 10, -46, 14, 18, -45, 'dark');
    L.box(6, 16, -46, 12, 18, -45, 'dark');
    L.box(6, 10, -45.65, 12, 16, -45.35, 'grate');
    L.box(4, 17, -46, 14, 18, -34, 'dark');               // dach
    L.button('C', 11.2, -41, { y: 10, r: 1.3 });
    L.button('E', 11.6, -44, { y: 10, r: 0.9 });
    L.button('T', 6.8, -44, { y: 10, r: 0.9, timer: 5 });

    // ---- północ: płyta Y wysoko na ścianie, przed nią fizzler ----
    L.box(6, 11.4, -66, 12, 15, -65, 'white');            // Y
    L.fizzler(5, 10, -65.0, 13, 16, -64.7);

    // ---- sala wyjścia (zachód, za szkłem) ----
    fp(-18, -1, -66, -52, [-8, -3, -62, -56]);            // FN
    L.box(-18, 0, -52, -1, 26, -51.7, 'glass');           // południowa szyba
    L.box(-1.0, 0, -66, -0.7, 26, -61, 'glass');          // wschodnia szyba z drzwiami D3
    L.box(-1.0, 0, -53.4, -0.7, 26, -52, 'glass');
    L.box(-1.0, 8, -61, -0.7, 26, -53.4, 'glass');
    L.door('C', -1.0, 0, -61, -0.7, 8, -53.4);
    // wewnętrzna przegroda przed polem wyjścia: drzwi D4 = przycisk C (kostka) ORAZ czasowy T (komora wieży)
    L.box(-10, 0, -66, -9.7, 26, -62, 'glass');
    L.box(-10, 0, -56, -9.7, 26, -52, 'glass');
    L.box(-10, 6, -62, -9.7, 26, -56, 'glass');
    L.door(['C', 'E', 'T'], -10, 0, -62, -9.7, 6, -56);

    // ---- tablice ----
    L.sign('SERCE KOMPLEKSU', 'wyjście widać – drogę trzeba znaleźć', 9, 1.6, 17.95, 4, 8, Math.PI / 2);
    L.sign('A', 'przycisk', 1.6, 1.0, -9, 5, -25.95, 0);
    L.sign('B', 'przycisk', 1.6, 1.0, 3, 5, -25.95, 0);
    L.sign('D1', 'A + B', 3, 1.0, 8, 8, -25.95, 0);
    L.sign('C', 'przycisk', 1.6, 1.0, 12.95, 12, -41, Math.PI / 2);
    L.sign('E', 'przycisk', 1.6, 1.0, 12.95, 12, -44, Math.PI / 2);
    L.sign('T', 'czasowy 5 s', 2.2, 1.0, 5.05, 12, -44, -Math.PI / 2);
    L.sign('D3', 'C', 1.6, 1.0, -0.65, 9.5, -57, Math.PI / 2);
    L.sign('D4', 'C + E + T', 3.2, 1.0, -9.65, 7.3, -59, -Math.PI / 2);
    L.sign('D4', 'C + E + T', 3.2, 1.0, -10.05, 7.3, -59, Math.PI / 2);
    L.sign('WYJŚCIE', 'zielone pole – za szybami i kwasem', 22, 5, -7, 15, -65.95, 0);
  },
  solve(T) {
    const pl = T.game.player;
    // postaw trzymaną kostkę na (x,z): stań 1,9 m dalej na południe, patrz na północ, upuść
    const place = (x, z) => { T.walkTo(x, z + 1.9); T.face(0, 0); T.wait(0.6); T.drop(); T.wait(1); };
    // wejdź w portal i odejdź od niego (wylot z podłogi: nie wpadaj z powrotem)
    const hop = (i, yawAfter) => {
      const P = T.portal(i);
      T.assert(T.walkThrough(i), 'nie wszedłem w portal ' + i + ' (' + P.pos.map(v => v.toFixed(1)) + ')');
      T.face(yawAfter, 0); T.run(0.9, { KeyW: 1 }); T.land(3);
    };

    // 1. kostka K1 przez przepaść A: biała płyta WA (ściana) -> łata FA (podłoga za kwasem)
    T.walkTo(-9, 11);
    T.grab(0);
    T.shoot(1, -5, 0, -12.5);
    T.shoot(0, -17, 1.4, 12.5);
    let b = T.portal(0).pos;
    T.walkTo(b[0] + 2.2, b[2]);
    hop(0, 0);
    // 2. K1 na przycisk A
    place(-9, -19);
    T.assert(T.buttonPressed('A'), 'przycisk A niewciśnięty');

    // 3. klatka z K2: strzał przez kratkę na łatę FB, wejście od ściany WB
    T.walkTo(0, -17, 10); T.walkTo(0, -12.5, 10);                // (omiń portal FA na podłodze)
    T.shoot(1, 12.5, 0, -17.7);
    T.shoot(0, -17, 1.4, -20);
    b = T.portal(0).pos;
    T.walkTo(b[0] + 2.4, b[2]);
    hop(0, 0);                                   // jesteś w klatce
    T.grab(1);                                   // K2
    T.assert(T.game.mech.held, 'K2 nie w rękach');
    T.assert(T.walkThrough(1), 'nie wyszedłem z klatki');
    T.wait(0.3);
    // 4. K2 na przycisk B -> drzwi D1 (bokiem, żeby nie zahaczyć o K1)
    T.walkTo(-12, -13); T.walkTo(0, -13);
    place(3, -19);
    T.assert(T.buttonPressed('B'), 'przycisk B niewciśnięty');
    T.walkTo(7, -22, 10); T.walkTo(7, -30, 10);  // przez D1 (wschodnia strona) i fizzler na półkę

    // 5. kostki nie przejdą przez fizzler – drugą kostkę (K4, zostaje w klatce) trzeba przenieść portalami:
    //    niebieski na X (półka), pomarańczowy przez otwarte D1 i kratkę na łatę FB w klatce
    T.walkTo(7.5, -29.5);
    T.shoot(0, -17, 1.4, -30);
    T.shoot(1, 12.8, 0, -17.7);
    T.walkTo(-3, -31.5, 15);
    hop(0, 0);                                   // wylot z FB w klatce
    T.grab(2);                                   // K4
    T.assert(T.game.mech.held, 'K4 nie w rękach');
    T.assert(T.walkThrough(1), 'nie wróciłem przez FB');
    T.face(-Math.PI / 2, 0); T.run(0.9, { KeyW: 1 }); T.land(3);
    place(-12, -32);                             // K4 czeka na półce

    // 6. K3 w ręce; Y (pomarańczowy) wysoko na północnej ścianie – z boku wieży, by ona nie zasłaniała
    T.grab(3);                                   // K3
    T.walkTo(-4, -29.5);
    T.shoot(1, 9, 13.2, -65);
    // 7. niebieski X już stoi na półce: strzał pomarańczowym PRZEZ niebieski – promień wyleci z Y i trafi IP w komorze
    const X = T.portal(0).pos;
    T.walkTo(-4, X[2]);
    T.shoot(1, X[0], X[1], X[2]);
    T.assert(T.portal(1).pos[2] > -40, 'pomarańczowy nie trafił w komorę');
    T.wait(0.3);
    T.assert(T.walkThrough(0), 'nie wszedłem w X');
    T.wait(0.5);
    // 8. w komorze: K3 na przycisk C -> D3
    T.walkTo(11.2, -39.1); T.face(0, 0); T.wait(0.6); T.drop(); T.wait(1);
    T.assert(T.buttonPressed('C'), 'przycisk C niewciśnięty');
    // 9. z powrotem przez IP na półkę po K4 i do komory na przycisk E
    T.assert(T.walkThrough(1), 'nie wróciłem przez IP');
    T.face(-Math.PI / 2, 0); T.run(0.9, { KeyW: 1 }); T.land(3);
    T.grab(2);                                   // K4
    T.assert(T.game.mech.held, 'K4 nie w rękach (2)');
    T.assert(T.walkThrough(0), 'nie wszedłem w X (2)');
    T.wait(0.5);
    T.walkTo(9.5, -42.1); T.walkTo(11.6, -42.1);
    T.face(0, 0); T.wait(0.6); T.drop(); T.wait(1);
    T.assert(T.buttonPressed('E'), 'przycisk E niewciśnięty');
    // 10. niebieski przez okienko i otwarte drzwi D3 na łatę FN w sali wyjścia
    T.walkTo(9, -44.4);
    T.wait(0.3);
    T.shoot(0, -6, 0, -60);
    // 11. przycisk czasowy T (5 s) w komorze, potem biegiem przez IP -> FN -> drzwi D4 -> pole wyjścia
    T.walkTo(6.8, -44); T.wait(0.3);
    T.walkTo(8.4, -39.5, 5, true);
    T.assert(T.walkThrough(1, { run: true }), 'nie wszedłem w IP');
    T.face(Math.PI / 2, 0); T.run(0.5, { KeyW: 1, ShiftLeft: 1 });
    T.walkTo(-14, -59, 15, true);
  },
};
