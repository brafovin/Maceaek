export default {
  name: 'Szczelina',
  hint: 'Jedyne, co widać po drugiej stronie, to szczelina w ciemnej ścianie. Strzał też przez nią przeleci.',
  spawn: { x: 0, y: 0, z: 12, yaw: 0 },
  exit: { x: 0, y: 0, z: -19 },
  build(L) {
    L.room(-10, 10, -24, 16, 16, { e: 'dark', w: 'dark' });
    L.floor(-10, 10, -4, 16);
    L.floor(-10, 10, -24, -6, 'dark');
    L.box(-10, -8, -6, -1.2, 16, -4, 'dark');
    L.box(1.2, -8, -6, 10, 16, -4, 'dark');
    L.box(-1.2, 6.8, -6, 1.2, 16, -4, 'dark');
    L.box(-1.2, -8, -6, 1.2, 2.8, -4, 'dark');
  },
  solve(T) {
    T.shoot(1, 0, 8, -24);
    T.shoot(0, 0, 0, 8);
    T.walkTo(0, 7); T.run(1.5, { KeyW: 1 }); T.land();
    T.walkTo(0, -19);
  },
};
