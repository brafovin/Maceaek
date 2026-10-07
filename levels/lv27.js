import { DARK_ALL } from './util.js';

// Poziom 27 – „Zamek”
//
// Trzy komnaty w rzędzie (zachód -> wschód), trzy zamki, jedna kostka. Każde drzwi otwiera przycisk, który leży tuż przed
// nimi (stojąc na nim nie zdążysz przejść). Przejść można tylko z kostką: drzwi nie zamykają się na tym, co w nich tkwi,
// więc kostka trzymana przed sobą (albo zabrana z przycisku z progu) „podpiera” otwarte drzwi. Za drzwiami II i III są
// przyciski o tym samym id po drugiej stronie, więc od tyłu da się je otworzyć, stojąc na nich (powrót bez ślepych zaułków).
//
//   I   WYRZUTNIA (x -38…-16)  przepaść 12 m (kwas). Wieża 13 m, na froncie wysoki biały pas (jedyny biały cel poza pasem
//                              podłogi przed wieżą). Niebieski w podłodze + pomarańczowy na pasie = wyrzut ponad przepaścią.
//                              Gracz niesie kostkę. Wyspa: przycisk A1 + drzwi D1.
//   II  KLATKA    (x -14…6)    klatka z kratek (pełna wysokość) przy drzwiach D2: przedsionek z białą podłogą, kurtyna fizzlera
//                              (kostka dotykająca kurtyny wraca na start), dalej przycisk A2 i wyjście z klatki Q2 (otwiera je
//                              przycisk Q2 od środka). Do klatki wchodzi się tylko portalem (do przedsionka) – ale kostka nie
//                              przejdzie kurtyny, więc musi czekać przed Q2 i zostać wciągnięta zza otwartych drzwi.
//   III ZAPORA    (x 8…36)     dwie zamknięte komory za kratkami: Y (przycisk A3, biała łatka) i Z (przycisk B3 przed drzwiami D3,
//                              biała łatka). Drzwi D3 wymagają A3 i B3 naraz. Dwa portale: najpierw kostka do Y (spada w niebieski),
//                              potem pomarańczowy do Z – gracz wchodzi do Z tym samym niebieskim.
//
// Zamierzone rozwiązanie: patrz solve().
export default {
  name: 'Zamek',
  hint: 'Trzy zamki, jedna kostka. Drzwi zamykają się, gdy zwolnisz przycisk – ale nie na tym, co w nich tkwi. Nie wszystko przejdzie przez każdą przeszkodę.',
  spawn: { x: -27, y: 0, z: 2, yaw: 0 },
  exit: { x: 21.5, y: 0, z: -30.5 },
  build(L) {
    L.room(-38, 36, -34, 30, 20, DARK_ALL);

    // ================= przegrody między komnatami (z otworami na drzwi) =================
    // P12: x -16…-14, otwór z -27…-24
    L.box(-16, -8, -34, -14, 20, -27, 'dark');
    L.box(-16, -8, -24, -14, 20, 30, 'dark');
    L.box(-16, 4, -27, -14, 20, -24, 'dark');
    L.door('A1', -16, 0, -27, -14, 4, -24);
    L.box(-16, -8, -27, -14, 0, -24, 'dark');
    // P23: x 6…8, otwór z 19…22
    L.box(6, -8, -34, 8, 20, 19, 'dark');
    L.box(6, -8, 22, 8, 20, 30, 'dark');
    L.box(6, 4, 19, 8, 20, 22, 'dark');
    L.door('A2', 6, 0, 19, 8, 4, 22);
    L.box(6, -8, 19, 8, 0, 22, 'dark');

    // ================= KOMNATA I – wyrzutnia =================
    L.floor(-38, -16, -2, 6, 'floor');         // pas startowy (biały)
    L.floor(-38, -16, 6, 30, 'dark');
    L.floor(-38, -16, -34, -14, 'dark');       // wyspa F1
    L.pit(-38, -16, -14, -2);
    L.box(-38, 0, -14.4, -16, 0.03, -14, 'door');         // pas ostrzegawczy przy krawędzi przepaści (wyspa)
    L.box(-34, 0, 6.5, -24, 13, 27, 'dark');             // wieża
    L.box(-34, 10.5, 6, -24, 13, 6.5, 'white');          // wysoki biały pas na froncie
    for (let i = 1; i <= 26; i++) L.box(-38, 0, 6 + 0.8 * (i - 1), -34, 0.5 * i, 27, 'dark');
    L.cube(-23, 0, 0.5);
    L.sign('I · WYRZUTNIA', 'pierwszy zamek', 7.5, 1.9, -29, 8.2, 6.45, Math.PI);
    L.sign('ZAMEK I', 'przycisk A1', 4.2, 1.3, -16.06, 5.6, -25.5, Math.PI / 2);
    L.sign('A1', 'przycisk', 2.4, 1.2, -17.4, 2.4, -33.94, 0);
    L.button('A1', -17.4, -25.5);                          // przycisk zamka I
    L.button('A1', -12.9, -25.5, { r: 1.3 });              // ten sam id po drugiej stronie drzwi (powrót)

    // ================= KOMNATA II – klatka =================
    L.floor(-14, 6, -34, -6, 'dark');
    L.floor(-14, -12, -6, 2, 'dark');
    L.floor(-12, -2, -6, 2, 'floor');                     // biała łatka podłogi (portal wejściowy)
    L.floor(-2, 6, -6, 2, 'dark');
    L.floor(-14, 0, 2, 30, 'dark');
    L.floor(0, 6, 2, 12, 'dark');
    L.floor(0, 6, 12, 16, 'floor');                       // przedsionek klatki: jedyna biała łatka wewnątrz
    L.floor(0, 6, 16, 30, 'dark');
    // klatka z kratek (pełna wysokość): x 0…6, z 12…30; wewnątrz kurtyna fizzlera na z = 16
    L.box(0, 0, 11.85, 6, 20, 12.15, 'grate');
    L.box(-0.15, 0, 12, 0.15, 20, 22.5, 'grate');
    L.box(-0.15, 0, 25.5, 0.15, 20, 30, 'grate');
    L.box(-0.15, 3.8, 22.5, 0.15, 20, 25.5, 'grate');
    L.fizzler(0, 0, 15.9, 6, 20, 16.1);
    L.button('A2', 4.4, 20.5);
    L.door('Q2', -0.3, 0, 22.5, 0.3, 3.8, 25.5);          // wejście/wyjście klatki (otwiera je przycisk Q2 od środka)
    L.button('Q2', 1.0, 24.0);
    L.button('A2', 9.1, 20.5, { r: 1.3 });                // powrót (po stronie komnaty III)
    L.sign('II · KLATKA', 'drugi zamek', 7.5, 1.9, -5, 6, -33.94, 0);
    L.sign('ZAMEK II', 'przycisk A2', 4.2, 1.3, 5.94, 5.6, 20.5, -Math.PI / 2);
    L.sign('A2', 'przycisk', 2.4, 1.2, 4.4, 2.4, 29.94, Math.PI);
    L.sign('Q2', 'wyjście', 2.4, 1.2, 1.0, 2.4, 29.94, Math.PI);

    // ================= KOMNATA III – zapora =================
    L.floor(8, 36, -34, 10, 'dark');
    L.floor(8, 12, 10, 18, 'dark');
    L.floor(12, 20, 10, 18, 'floor');                     // biała łatka podłogi (portal wejściowy)
    L.floor(20, 36, 10, 18, 'dark');
    L.floor(8, 36, 18, 30, 'dark');
    // komora Y (zamknięta): x 30…36, z 12…30; okno z kratki od strony hali
    L.box(29.85, 0, 12, 30.15, 20, 30, 'grate');
    L.box(30, -8, 10, 36, 20, 12, 'dark');
    L.box(31, 0, 29.5, 35, 4, 30, 'white');               // jedyna łatka w Y (na południowej ścianie)
    L.button('A3', 33, 27.4, { r: 2.0 });
    // komora Z (zamknięta kratką): przed drzwiami D3; wejście tylko przez portal
    L.box(8, 0, -4.15, 36, 20, -3.85, 'grate');
    L.box(10, 0, -25.5, 16, 4, -25, 'white');             // łatka w Z
    L.box(8, -8, -27, 20, 20, -26, 'dark');
    L.box(23, -8, -27, 36, 20, -26, 'dark');
    L.box(20, 4, -27, 23, 20, -26, 'dark');
    L.box(20, -8, -27, 23, 0, -26, 'dark');
    L.door(['A3', 'B3'], 20, 0, -27, 23, 4, -26);
    L.button('B3', 21.5, -24.9, { r: 1.2 });
    L.sign('III · ZAPORA', 'trzeci zamek', 7.5, 1.9, 8.06, 6, 8, -Math.PI / 2);
    L.sign('ZAMEK III', 'A3 + B3 naraz', 5, 1.4, 21.5, 5.6, -25.94, 0);
    L.sign('A3', 'przycisk', 2.4, 1.2, 33, 6, 29.94, Math.PI);
    L.sign('B3', 'przycisk', 2.4, 1.2, 27, 2.2, -25.94, 0);
    L.sign('WYJŚCIE', 'komnata wyjściowa', 7, 1.8, 21.5, 4.2, -33.94, 0);
  },
  solve(T) {
    const pl = T.game.player, g = T.game;
    const E = -Math.PI / 2, S = Math.PI;
    const held = () => !!g.mech.held;
    const cubeAt = () => T.cube(0).pos.toArray();
    // ======== I. WYRZUTNIA ========
    T.grab(0);                                                   // kostka w ręce (niesiemy ją przez wyrzut)
    T.shoot(1, -29, 12, 6);                                      // pomarańczowy: wysoki pas na froncie wieży
    T.walkTo(-36, 5); T.face(S, 0);
    T.walkTo(-36, 26.5, 30); T.walkTo(-30, 26.3); T.walkTo(-29, 8, 20);   // schody i wieża
    T.creep(-29, 6.3, 5);                                        // krawędź wieży
    T.face(0, -0.9); T.shoot(0, -29, 0, 2.3);                    // niebieski: pas podłogi przed wieżą
    T.assert(T.portal(1).pos[1] > 10, 'pomarańczowy za nisko');
    T.face(0, 0);
    for (let i = 0; i < 400 && pl.pos.z > 5.85; i++) { g.keys.KeyW = true; g.step(T.DT); }   // wolne zejście z krawędzi
    T.release();
    for (let i = 0; i < 1500; i++) { g.step(T.DT); if (pl.onGround && pl.pos.y < 5) break; }
    T.wait(1);
    T.assert(pl.pos.z < -15 && g.mech.deaths === 0, 'wyrzut nie doleciał');
    T.assert(held(), 'kostka wypadła z rąk w locie');
    T.walkTo(-17.4, -23.7, 10); T.face(0, -0.3); T.wait(0.5);
    T.drop(); T.wait(1.2);                                       // kostka na A1
    T.assert(T.buttonPressed('A1'), 'A1 niewciśnięty');
    T.walkTo(-15.4, -25.5, 10);                                  // w progu: drzwi nie zamkną się na nas
    T.aim(...cubeAt()); T.pick();                                // zabieramy kostkę z przycisku
    T.walkTo(-11, -25.5, 10);
    T.assert(held(), 'kostka nie przeszła przez drzwi I');
    // ======== II. KLATKA ========
    T.walkTo(-3.8, 24, 30);                                      // kostka zostaje przed wyjściem Q2 (nie przejdzie przez kurtynę)
    T.face(E, -0.3); T.wait(0.6); T.drop(); T.wait(1.2);
    T.walkTo(-4, 8, 10);
    T.shoot(1, 3, 0, 14);                                        // przedsionek klatki widać przez kratkę
    T.walkTo(-7, -9, 20);
    T.shoot(0, -7, 0, -2);                                       // biała łatka podłogi
    T.assert(T.walkThrough(0), 'nie wszedłem w niebieski portal');
    T.land(6);
    T.walkTo(3, 19, 10);                                         // przez kurtynę (portale znikają)
    T.walkTo(1.0, 24.0, 10); T.wait(0.5);                        // Q2 otwiera wyjście
    T.assert(T.buttonPressed('Q2'), 'Q2 niewciśnięty');
    T.aim(...cubeAt()); T.pick();                                // kostka zza otwartych drzwi
    T.assert(held(), 'nie wziąłem kostki zza drzwi');
    T.walkTo(4.4, 18.4, 10); T.face(S, -0.3); T.wait(0.6); T.drop(); T.wait(1.2);
    T.assert(T.buttonPressed('A2'), 'A2 niewciśnięty');
    T.walkTo(5.4, 20.5, 10);
    T.aim(...cubeAt()); T.pick();
    T.walkTo(11, 20.5, 10);
    T.assert(held(), 'kostka nie przeszła przez drzwi II');
    // ======== III. ZAPORA ========
    T.walkTo(22, 22, 10);
    T.shoot(1, 33, 2, 29.5);                                     // pomarańczowy: łatka w zamkniętej komorze Y
    T.shoot(0, 16, 0, 14);                                       // niebieski: łatka podłogi
    const B = T.portal(0).pos;
    T.walkTo(B[0], B[2] + 2.8, 10);
    T.face(0, -0.05); T.wait(0.8);
    T.drop(); T.wait(2);                                         // kostka wpada w niebieski i ląduje w Y
    T.assert(T.buttonPressed('A3'), 'A3 niewciśnięty');
    T.shoot(1, 13, 2, -25);                                      // pomarańczowy przenosimy do komory Z (przy drzwiach)
    T.assert(T.walkThrough(0), 'nie wszedłem w niebieski (Z)');
    T.land(5);
    T.walkTo(21.5, -23, 25);
    T.walkTo(21.5, -30.5, 10);
  },
};
