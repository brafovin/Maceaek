export default {
  name: 'Kwas',
  hint: 'Kwas zabija. Portal możesz postawić nawet bardzo daleko – o ile widzisz tam białą powierzchnię.',
  spawn: { x: 0, y: 0, z: 12, yaw: 0 },
  exit: { x: 0, y: 0, z: -18 },
  build(L) {
    L.room(-9, 9, -22, 16, 10);
    L.floor(-9, 9, 0, 16);
    L.pit(-9, 9, -14, 0);
    L.floor(-9, 9, -22, -14);
  },
  solve(T) {
    T.shoot(1, 0, 0, -18);
    T.shoot(0, 0, 0, 6);
    T.walkTo(0, 5); T.run(1, { KeyW: 1 }); T.land();
    T.walkTo(0, -18);
  },
};
