export default {
  name: 'Sufit',
  hint: 'Ciemna ściana blokuje drogę, a za nią wszystko jest ciemne. Czy na pewno widzisz stąd tylko ścianę?',
  spawn: { x: 0, y: 0, z: 12, yaw: 0 },
  exit: { x: 0, y: 0, z: -18 },
  build(L) {
    L.room(-10, 10, -26, 16, 16, { n: 'dark', e: 'dark', w: 'dark' });
    L.floor(-10, 10, -4, 16);
    L.floor(-10, 10, -26, -6, 'dark');
    L.box(-10, -8, -6, 10, 7, -4, 'dark');
  },
  solve(T) {
    T.shoot(1, 0, 16, -14);
    T.shoot(0, 0, 0, 8);
    T.walkTo(0, 7); T.run(1.5, { KeyW: 1 }); T.land();
    T.walkTo(0, -18);
  },
};
