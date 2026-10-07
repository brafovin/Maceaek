// Zestaw narzędzi do testów poziomów (ładowany przy ?test=1, dostępny jako window.T).
// Fizyka jest krokowana ręcznie (game.step), więc wynik jest deterministyczny i szybki.
//
// Typowy poziom ma `solve(T)` – skrypt, który przechodzi poziom jak człowiek:
// celuje, strzela, chodzi, skacze. Zobacz docs/ENGINE.md.

export function install(game) {
  const pl = game.player;
  const DT = 1 / 120;
  const KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft'];

  // deterministyczny „szum” celowania, żeby sprawdzić, że rozwiązanie nie wisi na włosku
  let jitter = 0, seed = 1;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  const T = {
    game,
    DT,
    setJitter(amount, s = 1) { jitter = amount; seed = s >>> 0 || 1; },

    // ---- stan ----
    eye() { return [pl.pos.x, pl.pos.y + 1.62, pl.pos.z]; },
    st() {
      return { p: pl.pos.toArray().map(v => +v.toFixed(2)), v: pl.vel.toArray().map(v => +v.toFixed(1)), yaw: +pl.yaw.toFixed(2), pitch: +pl.pitch.toFixed(2), ground: pl.onGround, done: game.exitReached() };
    },
    reached() { return game.exitReached(); },

    // ---- patrzenie i strzelanie ----
    face(yaw, pitch = 0) { pl.yaw = yaw; pl.pitch = pitch; },
    aim(x, y, z) {
      pl.camOffset.set(0, 0, 0);
      const e = T.eye();
      const dx = x - e[0], dy = y - e[1], dz = z - e[2];
      pl.yaw = Math.atan2(-dx, -dz);
      pl.pitch = Math.max(-1.5533, Math.min(1.5533, Math.atan2(dy, Math.hypot(dx, dz))));
    },
    // strzał w punkt świata; index 0 = niebieski, 1 = pomarańczowy. Rzuca wyjątek, jeśli portal nie powstał.
    shoot(index, x, y, z, opt = {}) {
      if (jitter > 0 && !opt.exact) { x += (rnd() * 2 - 1) * jitter; y += (rnd() * 2 - 1) * jitter; z += (rnd() * 2 - 1) * jitter; }
      T.aim(x, y, z);
      const ok = game.fire(index);
      if (!ok && !opt.allowFail) throw new Error(`strzał ${index} w (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}) nie postawił portalu`);
      return ok;
    },

    // ---- ruch ----
    tp(x, y, z) { pl.pos.set(x, y, z); pl.vel.set(0, 0, 0); pl.onGround = false; pl.camOffset.set(0, 0, 0); },
    release() { for (const k of KEYS) game.keys[k] = false; },
    // trzymaj klawisze przez `sec` sekund; przerwij, gdy until() zwróci true
    // (domyślnie przerywa po dotarciu na wyjście; `null` wyłącza warunek)
    run(sec, keys = {}, until) {
      if (until === undefined) until = T.reached;
      for (const k of KEYS) game.keys[k] = !!keys[k];
      const n = Math.round(sec / DT);
      let i = 0;
      for (; i < n; i++) {
        game.step(DT);
        if (until && until()) break;
      }
      T.release();
      return i * DT;
    },
    wait(sec) { return T.run(sec, {}); },
    // spadaj/leć bez klawiszy, aż staniesz na ziemi
    land(maxSec = 8) {
      for (let i = 0; i < maxSec / DT; i++) { game.step(DT); if (pl.onGround) break; }
      return T.st();
    },
    // idź (W) w stronę punktu (x,z); kończy w promieniu 0.25 lub gdy dotrzesz do wyjścia
    walkTo(x, z, maxSec = 15, run = false) {
      for (let i = 0; i < maxSec / DT; i++) {
        const dx = x - pl.pos.x, dz = z - pl.pos.z;
        if (Math.hypot(dx, dz) < 0.25) break;
        pl.yaw = Math.atan2(-dx, -dz);
        game.keys.KeyW = true; game.keys.ShiftLeft = run;
        game.step(DT);
        if (T.reached()) break;
      }
      T.release();
      return T.st();
    },
    // jak walkTo, ale małymi krokami i z hamowaniem – dojście z małą prędkością
    creep(x, z, maxSec = 10) {
      for (let i = 0; i < maxSec / DT; i++) {
        const dx = x - pl.pos.x, dz = z - pl.pos.z;
        if (Math.hypot(dx, dz) < 0.12) break;
        pl.yaw = Math.atan2(-dx, -dz);
        const sp = Math.hypot(pl.vel.x, pl.vel.z);
        game.keys.KeyW = sp < 1.5 || Math.hypot(dx, dz) > 1;
        game.step(DT);
      }
      T.release();
      return T.st();
    },
    jump() { game.keys.Space = true; game.step(DT); game.keys.Space = false; },

    // ---- portale ----
    // aktualny stan portalu i (0 niebieski, 1 pomarańczowy): {active,pos,normal,up}
    portal(i) {
      const P = game.portals[i];
      return { active: P.active, pos: P.pos.toArray(), normal: P.normal.toArray(), up: P.up.toArray() };
    },
    // idź w stronę portalu i (poziomo) aż do teleportacji (skok pozycji > 2 m w jednym kroku); true = przeszedłeś
    walkThrough(i, { run = false, maxSec = 8 } = {}) {
      const P = game.portals[i];
      let prev = pl.pos.clone();
      for (let k = 0; k < maxSec / DT; k++) {
        const dx = P.pos.x - pl.pos.x, dz = P.pos.z - pl.pos.z;
        if (Math.hypot(dx, dz) > 0.05) pl.yaw = Math.atan2(-dx, -dz);
        game.keys.KeyW = true; game.keys.ShiftLeft = run;
        game.step(DT);
        if (pl.pos.distanceTo(prev) > 2) { T.release(); return true; }
        prev.copy(pl.pos);
      }
      T.release();
      return false;
    },

    // ---- kostki ----
    // podnieś najbliższą kostkę (patrz na nią wcześniej)
    pick() { if (!game.pickCube()) throw new Error('nie udało się podnieść kostki'); },
    drop() { game.dropCube(false); },
    throwCube() { game.dropCube(true); },
    // podejdź do kostki, spójrz na nią i podnieś
    grab(i = 0) {
      const c = game.cubes[i];
      const dx = c.pos.x - pl.pos.x, dz = c.pos.z - pl.pos.z;
      if (Math.hypot(dx, dz) > 1.8) T.walkTo(c.pos.x - dx / Math.hypot(dx, dz) * 1.4, c.pos.z - dz / Math.hypot(dx, dz) * 1.4, 10);
      T.release();
      for (let k = 0; k < 30; k++) game.step(DT);
      T.aim(c.pos.x, c.pos.y, c.pos.z);
      T.pick();
    },
    cube(i = 0) { return game.cubes[i]; },
    buttonPressed(id) { return game.buttons.some(b => b.id === id && b.pressed); },

    // ---- asercje ----
    assert(cond, msg = 'asercja nie przeszła') { if (!cond) throw new Error(msg); },
    // czy gracz stoi na wyjściu (po solve)
    assertExit() { for (let i = 0; i < 6; i++) game.step(DT); if (!game.exitReached()) throw new Error('gracz nie stoi na wyjściu: ' + JSON.stringify(T.st())); },
  };
  return T;
}
