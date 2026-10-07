export default {
  name: 'Finał',
  hint: 'Półka po drugiej stronie jest wysoko i daleko. Liczy się nie tylko prędkość, ale i wysokość, z której wylecisz.',
  spawn: { x: 0, y: 0, z: 2, yaw: 0 },
  exit: { x: 0, y: 8, z: -50 },
  build(L) {
    L.room(-10, 10, -64, 8, 36, { n: 'dark', e: 'dark', w: 'dark', ceil: 'dark' });
    L.box(-10, 34, -12, 10, 36, 8, 'white');
    L.floor(-10, 10, -6, 8);
    L.pit(-10, 10, -40, -6);
    L.box(-10, -8, -64, 10, 8, -40, 'dark');
  },
  solve(T) {
    const pl = T.game.player;
    T.shoot(0, 0, 0, 0);
    T.shoot(1, 0, 34, 0);
    T.creep(0, 0.2);
    let fired = false;
    for (let i = 0; i < 120 * 40 && !fired; i++) {
      T.game.step(T.DT);
      pl.vel.x *= 0.98; pl.vel.z *= 0.98;
      if (pl.vel.y < -25 && pl.pos.y < 22) {
        T.face(Math.PI, 0);
        T.shoot(1, 0, 28, 8);                              // wysoko na ścianie – wylot ponad krawędzią półki
        fired = true;
      }
    }
    T.assert(fired, 'nie wpadłem w studnię');
    T.land(20);
    T.run(3, {});
    T.walkTo(0, -50);
  },
};
