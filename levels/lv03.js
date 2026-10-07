export default {
  name: 'Wyspy',
  hint: 'Wyspa pośrodku ma tylko wąski biały pas. Portale można przestawiać w każdej chwili – strzał zastępuje portal tego samego koloru.',
  spawn: { x: 0, y: 0, z: 12, yaw: 0 },
  exit: { x: 0, y: 0, z: -46 },
  build(L) {
    L.room(-8, 8, -50, 16, 10);
    L.floor(-8, 8, 0, 16);
    L.pit(-8, 8, -14, 0);
    L.floor(-8, -3, -22, -14, 'dark');
    L.floor(-3, 3, -22, -14, 'floor');
    L.floor(3, 8, -22, -14, 'dark');
    L.pit(-8, 8, -36, -22);
    L.floor(-8, 8, -50, -36);
  },
  solve(T) {
    T.shoot(1, 0, 0, -18);                         // pas na wyspie
    T.shoot(0, 0, 0, 6);                           // tuż przed kwasem
    T.assert(T.walkThrough(0), 'nie wszedłeś w portal');
    T.run(0.4, { KeyD: 1 }, null);                 // po wyjściu – na bok, żeby nie wpaść z powrotem
    T.land();
    // na wyspie: pomarańczowy na drugi brzeg, niebieski na pas wyspy
    T.run(0.05, {});
    T.shoot(1, 0, 0, -39);
    T.shoot(0, 0, 0, -18);
    T.assert(T.walkThrough(0), 'nie wszedłeś w drugi portal');
    T.run(0.8, { KeyW: 1 }, null);
    T.land();
    T.walkTo(0, -46);
  },
};
