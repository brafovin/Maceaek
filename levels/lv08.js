import { DARK_ALL, stairs } from './util.js';

export default {
  name: 'Wieża',
  hint: 'Jeden skok w dół nie wystarczy. Najpierw wejdź tam, gdzie się da – a potem skocz stamtąd jeszcze raz.',
  spawn: { x: -8, y: 0, z: 15, yaw: 0 },
  exit: { x: -18, y: 12.5, z: 0 },
  build(L) {
    L.room(-24, 10, -6, 16, 22, DARK_ALL);
    L.floor(-24, 10, -6, 16);
    L.box(-12, 0, -6, -4, 4, 6, 'white');
    stairs(L, -12, -4, 6, 4);
    L.box(1, 0, -6, 10, 8.5, 10, 'white');
    L.box(-24, 0, -6, -12, 12.5, 6, 'white');
  },
  solve(T) {
    const E = -Math.PI / 2, W = Math.PI / 2;
    const pl = T.game.player;
    // pierwszy skok: na półkę H
    T.walkTo(-8, 9); T.walkTo(-8, 3.2);
    T.face(E, 0); T.shoot(1, -5.1, 4, 3.2);
    T.walkTo(-5, 1.2, 5); T.walkTo(-4.6, 1, 5);
    T.face(E, 0); T.shoot(0, -1.0, 0, 1);
    T.face(E, 0);
    T.run(0.9, { KeyW: 1 });
    T.run(0.35, { KeyW: 1, ShiftLeft: 1 });
    T.run(2, { KeyW: 1, ShiftLeft: 1 }, () => pl.onGround && pl.pos.y > 8);
    T.land(10);
    // drugi skok: z półki H w ten sam portal, ale na zachód – prosto na wieżę
    T.creep(1.5, 1.0);
    T.face(W, 0);
    let launched = false;
    for (let k = 0; k < 800; k++) {
      if (pl.pos.y < 8.4) launched = true;
      const fly = launched && pl.pos.y > 8.6 && pl.pos.x < -3;
      T.run(0.02, { KeyW: fly || (!launched && pl.vel.x > -1.5) ? 1 : 0, ShiftLeft: fly ? 1 : 0 });
      if (fly && pl.onGround) break;
    }
    T.walkTo(-18, 0);
  },
};
