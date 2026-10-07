export default {
  name: 'Pętla',
  hint: 'Ściana za Tobą jest ogromna, sufit też. Portal w podłodze i drugi nad nim to studnia bez dna – a w locie można przestawić portal.',
  spawn: { x: 0, y: 0, z: 2, yaw: 0 },
  exit: { x: 0, y: 0, z: -50 },
  build(L) {
    L.room(-10, 10, -64, 8, 36, { n: 'dark', e: 'dark', w: 'dark', ceil: 'dark' });
    L.box(-10, 34, -12, 10, 36, 8, 'white');       // biały fragment sufitu nad wejściem
    L.floor(-10, 10, -6, 8);
    L.pit(-10, 10, -34, -6);
    L.floor(-10, 10, -64, -34, 'dark');
  },
  solve(T) {
    const pl = T.game.player;
    T.shoot(0, 0, 0, 0);          // niebieski na podłodze
    T.shoot(1, 0, 34, 0);         // pomarańczowy dokładnie nad nim, na suficie
    T.creep(0, 0.2);              // wejście w niebieski – studnia
    let fired = false;
    for (let i = 0; i < 120 * 40 && !fired; i++) {
      T.game.step(T.DT);
      pl.vel.x *= 0.98; pl.vel.z *= 0.98;                 // drobna korekta dryfu
      if (pl.vel.y < -25 && pl.pos.y < 22) {
        T.face(Math.PI, 0);
        T.shoot(1, 0, 24, 8);                              // pomarańczowy na ścianie za plecami, wysoko
        fired = true;
      }
    }
    T.assert(fired, 'nie wpadłem w studnię');
    T.land(20);
    T.run(3, {});
    T.walkTo(0, -50);
  },
};
