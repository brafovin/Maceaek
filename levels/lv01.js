export default {
  name: 'Wysoka półka',
  hint: 'Półka jest za wysoka na skok. Portal wejściowy postaw tam, gdzie stoisz, wyjściowy – tam, gdzie chcesz się znaleźć.',
  spawn: { x: 0, y: 0, z: 12, yaw: 0 },
  exit: { x: 0, y: 6, z: -14 },
  build(L) {
    L.room(-10, 10, -18, 16, 14);
    L.floor(-10, 10, -18, 16);
    L.box(-10, 0, -18, 10, 6, -10, 'white');
  },
  solve(T) {
    T.shoot(1, 0, 9, -18);               // pomarańczowy wysoko na dalekiej ścianie
    T.face(0, -0.9); T.shoot(0, 0, 0, 6); // niebieski na podłodze przed sobą
    T.face(0, 0);
    T.walkTo(0, 5); T.run(1, { KeyW: 1 }); T.land();
    T.walkTo(0, -14);
  },
};
