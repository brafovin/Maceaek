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
    T.shoot(1, 4, 0, -18);                         // drugi brzeg, obok pola wyjścia
    T.shoot(0, 0, 0, 6);                           // tuż przed kwasem
    T.assert(T.walkThrough(0), 'nie wszedłeś w portal');
    T.run(0.8, { KeyW: 1 }, null);                 // po wyjściu – dalej od portalu, żeby nie wpaść z powrotem
    T.land();
    T.walkTo(0, -18);
  },
};
