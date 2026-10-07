// Testy mechanik silnika na poziomie-fixturze. Uruchom: node tests/mechanics.mjs [--port 8123]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const base = process.argv.includes('--port') ? 'http://localhost:' + process.argv[process.argv.indexOf('--port') + 1] : 'http://localhost:8123';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(`${base}/index.html?test=1&lvmod=${encodeURIComponent('/tests/fixtures/mech.js')}`);
await page.waitForFunction(() => window.gameReady === true, null, { timeout: 20000 });

const tests = {
  'kratka przepuszcza strzał, szkło nie': () => {
    const g = game, T = window.T;
    T.tp(-6, 0, 4);
    const ok = T.shoot(0, -6, 3, -30, { allowFail: true });          // przez kratkę w dalszą ścianę
    T.assert(ok, 'strzał przez kratkę powinien postawić portal');
    T.assert(Math.abs(g.portals[0].pos.z + 40) < 0.01, 'portal powinien być na dalekiej ścianie, jest: ' + g.portals[0].pos.z);
    g.resetPortals();
    T.tp(6, 0, 4);
    const ok2 = T.shoot(0, 6, 3, -30, { allowFail: true });          // przez szkło
    T.assert(!ok2, 'szkło powinno blokować strzał');
  },
  'gracz nie przechodzi przez kratkę': () => {
    const T = window.T, g = game;
    T.tp(-6, 0, -5); T.face(0, 0);
    T.run(1.5, { KeyW: 1 }, null);
    T.assert(g.player.pos.z > -7.6, 'kratka powinna zatrzymać gracza, z=' + g.player.pos.z);
  },
  'strzał przelatuje przez portal': () => {
    const T = window.T, g = game;
    g.resetPortals();
    // niebieski na wschodniej ścianie (z=6), pomarańczowy na zachodniej (z=-6)
    T.tp(0, 0, 6); T.shoot(0, 12, 1.6, 6);
    T.tp(0, 0, -6); T.shoot(1, -12, 1.6, -6);
    // strzał w niebieski portal z (0,6): wylot z zachodniej ściany leci na wschód i trafia ścianę w z=-6
    T.tp(0, 0, 6);
    T.shoot(0, 12, 1.6, 6, { exact: true });
    const b = g.portals[0];
    T.assert(b.active && Math.abs(b.pos.x - 12) < 0.01 && Math.abs(b.pos.z + 6) < 0.6,
      'niebieski powinien przeskoczyć na wschodnią ścianę w z≈-6, jest ' + b.pos.toArray().map(v => +v.toFixed(2)));
  },
  'fizzler usuwa portale': () => {
    const T = window.T, g = game;
    g.resetPortals();
    T.tp(0, 0, -10); T.shoot(0, 12, 1.6, -10); T.shoot(1, -12, 1.6, -10);
    T.assert(g.portals[0].active && g.portals[1].active, 'portale powinny być');
    T.tp(0, 0, -10); T.face(0, 0);
    T.run(1.0, { KeyW: 1 }, null);
    T.assert(!g.portals[0].active && !g.portals[1].active, 'fizzler powinien usunąć portale (z=' + g.player.pos.z + ')');
  },
  'na kostce można stanąć, w kostkę nie można wejść': () => {
    const T = window.T, g = game;
    g.restartLevel();
    T.tp(-6, 2.0, 2); T.wait(0.5);
    T.assert(Math.abs(g.player.pos.y - 0.8) < 0.05 && g.player.onGround, 'gracz powinien stać na kostce (y≈0.8), jest ' + g.player.pos.y);
    T.tp(-6, 0, 4); T.face(0, 0); T.run(1, { KeyW: 1 }, null);
    T.assert(g.player.pos.z > 2.6, 'kostka powinna blokować gracza, z=' + g.player.pos.z);
  },
  'kostka przechodzi przez portal': () => {
    const T = window.T, g = game;
    g.restartLevel();
    // portal wejściowy na podłodze, wyjście na zachodniej ścianie (z=6)
    T.tp(6, 0, 6); T.face(0, -0.8); T.shoot(0, 6, 0, 3, { exact: true });
    T.tp(6, 0, 6); T.shoot(1, -12, 3, 6, { exact: true });
    const c = g.cubes[1];
    c.pos.set(6, 3, 3); c.vel.set(0, 0, 0);       // spadnie w portal
    for (let i = 0; i < 240; i++) g.step(T.DT);
    T.assert(c.pos.x < 0 && Math.abs(c.pos.z - 6) < 1.5, 'kostka powinna wylecieć z zachodniej ściany, jest ' + c.pos.toArray().map(v => +v.toFixed(2)));
  },
  'drzwi otwierają się od przycisku i zamykają po zwolnieniu': () => {
    const T = window.T, g = game;
    g.restartLevel();
    const door = g.doors[0];
    T.assert(!door.box.disabled, 'drzwi powinny być zamknięte');
    const c = g.cubes[0];
    c.pos.set(-6, 0.4 + 0.001, -3); c.vel.set(0, 0, 0);
    for (let i = 0; i < 60; i++) g.step(T.DT);
    T.assert(door.box.disabled, 'drzwi powinny się otworzyć');
    c.pos.set(-6, 0.4, 2); c.vel.set(0, 0, 0);
    for (let i = 0; i < 60; i++) g.step(T.DT);
    T.assert(!door.box.disabled, 'drzwi powinny się zamknąć');
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  const r = await page.evaluate(`(() => { try { (${fn.toString()})(); return null; } catch (e) { return String(e.message || e); } })()`);
  console.log(`${r ? 'FAIL' : 'OK  '} ${name}${r ? '\n     ' + r : ''}`);
  if (r) failed++;
}
if (errors.length) { console.log('błędy strony:', errors); failed++; }
await browser.close();
process.exit(failed ? 1 : 0);
