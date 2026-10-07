// Poziom testowy mechanik (nie wchodzi do gry): grate, glass, fizzler, kostki, drzwi, strzał przez portal.
export default {
  name: 'Test mechanik',
  hint: '',
  spawn: { x: 0, y: 0, z: 8, yaw: 0 },
  exit: { x: 0, y: 0, z: -60 },
  build(L) {
    L.room(-12, 12, -40, 12, 14);
    L.floor(-12, 12, -40, 12);
    // kratka i szkło w poprzek sali
    L.box(-12, 0, -8.2, 0, 8, -7.9, 'grate');
    L.box(0, 0, -8.2, 12, 8, -7.9, 'glass');
    // fizzler
    L.fizzler(-12, 0, -14.3, 12, 8, -13.7);
    L.cube(-6, 0, 2);
    L.cube(6, 0, 2);
    L.button('B', -6, -3);
    L.door('B', 8, 0, -4, 11, 5, -3.5);
  },
  solve() {},
};
