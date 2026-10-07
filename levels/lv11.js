export default {
  name: 'Pierwsza kostka',
  hint: 'Drzwi otwiera przycisk, ale ktoś musi na nim zostać. Podnieś kostkę (E), zabierz ją ze sobą i połóż na przycisku.',
  spawn: { x: 0, y: 0, z: 12, yaw: 0 },
  exit: { x: 0, y: 0, z: -28.5 },
  build(L) {
    L.room(-9, 9, -30, 16, 12);
    L.floor(-9, 9, -4, 16);
    L.pit(-9, 9, -16, -4);
    L.floor(-9, 9, -30, -16);
    L.cube(3, 0, 10);
    L.button('A', 4, -21);
    // ściana działowa z drzwiami
    L.box(-9, 0, -27, -3, 12, -26, 'dark');
    L.box(3, 0, -27, 9, 12, -26, 'dark');
    L.box(-3, 6, -27, 3, 12, -26, 'dark');
    L.door('A', -3, 0, -27, 3, 6, -26);
  },
  solve(T) {
    T.walkTo(3, 8);
    T.grab(0);                                   // podnieś kostkę
    T.shoot(1, -3, 0, -20);                      // wyjście po drugiej stronie przepaści
    T.shoot(0, 0, 0, 5);                         // wejście przed sobą
    T.walkTo(0, 7); T.face(0, 0); T.run(1, { KeyW: 1 }); T.land();
    T.assert(T.game.mech.held, 'kostka powinna być w rękach');
    T.walkTo(4, -18.9); T.wait(0.6);             // stań przed przyciskiem
    T.face(0, 0); T.wait(0.4);                   // kostka dojeżdża przed nos
    T.drop();                                    // upuść ją na przycisk
    T.wait(1.2);
    T.assert(T.buttonPressed('A'), 'przycisk niewciśnięty');
    T.walkTo(0, -28.5);
  },
};
