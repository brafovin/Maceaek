import { DARK_ALL, stairs } from './util.js';

export default {
  name: 'Winda',
  hint: 'Portal na podłodze i drugi wyżej, na tej samej podłodze… Skacząc w dół, wylecisz z niego wyżej, niż zacząłeś. Oba portale postaw, patrząc w tę samą stronę.',
  spawn: { x: -8, y: 0, z: 15, yaw: 0 },
  exit: { x: 9, y: 8.5, z: 2 },
  build(L) {
    L.room(-12, 16, -6, 16, 16, DARK_ALL);
    L.floor(-12, 16, -6, 16);
    L.box(-12, 0, -6, -4, 4, 6, 'white');
    stairs(L, -12, -4, 6, 4);
    L.box(1, 0, -6, 16, 8.5, 10, 'white');
  },
  solve(T) {
    const E = -Math.PI / 2;
    const pl = T.game.player;
    T.walkTo(-8, 9); T.walkTo(-8, 3.2);          // schody na podest
    T.face(E, 0); T.shoot(1, -5.1, 4, 3.2);      // wyjście na podeście (patrz na wschód)
    T.walkTo(-5, 1.2, 5); T.walkTo(-4.6, 1, 5);
    T.face(E, 0); T.shoot(0, -1.0, 0, 1);        // wejście na podłodze szczeliny (też na wschód)
    T.face(E, 0);
    T.run(0.9, { KeyW: 1 });
    T.run(0.35, { KeyW: 1, ShiftLeft: 1 });
    T.run(2, { KeyW: 1, ShiftLeft: 1 }, () => pl.onGround && pl.pos.y > 8);
    T.land(10);
    T.walkTo(9, 2);
  },
};
