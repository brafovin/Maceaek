export default {
  name: 'Pęd',
  hint: 'Przepaść jest za szeroka, a po drugiej stronie nic nie przyjmie portalu. Wysokość to prędkość – a prędkość portal zachowuje. Zanim wejdziesz na górę, przygotuj sobie wyjście.',
  spawn: { x: 0, y: 0, z: 0, yaw: Math.PI },
  exit: { x: 0, y: 0, z: -26 },
  build(L) {
    L.room(-8, 8, -36, 28, 26, { n: 'dark', ceil: 'dark' });
    L.floor(-8, 8, -4, 6);
    L.floor(-8, -4, 6, 28);
    L.box(-4, 0, 6, 8, 12, 28, 'white');
    for (let i = 1; i <= 24; i++) L.box(-8, 0, 6 + 0.8 * (i - 1), -4, 0.5 * i, 28, 'white');
    L.pit(-8, 8, -14, -4);
    L.floor(-8, 8, -36, -14, 'dark');
  },
  solve(T) {
    T.shoot(1, 2, 10, 6);                       // wyjście na froncie platformy
    T.walkTo(-6, 5); T.face(Math.PI);
    T.walkTo(-6, 26.5, 30); T.walkTo(-1, 27);  // schody na górę
    T.walkTo(0, 6.6);                           // stań przy krawędzi, żeby zajrzeć w dół
    T.face(0, -0.9); T.shoot(0, 0, 0, -0.5);    // wejście na pasie podłogi
    T.walkTo(0, -0.5); T.run(0.2, {}); T.land(10);
    T.walkTo(0, -26);
  },
};
