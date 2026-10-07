// Test dymny efektów (fx*.js) z renderowaniem: strzały, portale, kwas, kostki, drzwi, fizzler, ukończenie poziomu.
// Sprawdza, że nie ma błędów strony ani błędów kompilacji shaderów, że pule cząstek mieszczą się w limitach
// i że efekty nie psują stanu gry. Uruchom: node tests/fx.mjs [--port 8123]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const base = process.argv.includes('--port') ? 'http://localhost:' + process.argv[process.argv.indexOf('--port') + 1] : 'http://localhost:8123';

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = 0;

async function scenario(name, query, lvmod, fn, after) {
  const page = await browser.newPage({ viewport: { width: 320, height: 200 } });
  const logs = [];
  page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text().slice(0, 300)); });
  let url = `${base}/index.html?test=1&render=1&${query}`;
  if (lvmod) url += '&lvmod=' + encodeURIComponent(lvmod);
  await page.goto(url);
  await page.waitForFunction(() => window.gameReady === true, null, { timeout: 30000 });
  let err = null;
  try {
    await page.evaluate(fn);
    await page.waitForTimeout(600);   // kilka klatek z rysowaniem
    if (after) await page.evaluate(after);
    const pools = await page.evaluate(() => window.game.scene.children.filter(o => o.geometry && o.geometry.instanceCount !== undefined).map(o => o.geometry.instanceCount));
    if (pools.some(n => n > 1800)) err = 'pula cząstek przekroczyła limit: ' + pools;
  } catch (e) { err = String(e.message || e); }
  if (logs.length) err = (err ? err + ' | ' : '') + [...new Set(logs)].join(' | ');
  console.log(`${err ? 'FAIL' : 'OK  '} ${name}${err ? '\n  ' + err : ''}`);
  if (err) failed++;
  await page.close();
}

await scenario('portale, strzały, nieudane strzały, przestawianie', 'level=4', null, () => {
  const T = window.T, g = window.game;
  T.tp(0, 0, 8);
  T.shoot(0, 0, 3, -16, { allowFail: true });
  T.shoot(1, 0, 2, -4, { allowFail: true });           // ciemna ściana
  T.shoot(0, 6, 0, 8, { allowFail: true });
  T.shoot(1, -6, 0, 8, { allowFail: true });
  for (let i = 0; i < 40; i++) { T.shoot(i % 2, (i % 5) - 2, 0, 8, { allowFail: true }); g.step(1 / 120); }   // przestawianie portali = duchy zamykania
  g.resetPortals();
  T.assert(!g.portals[0].active && !g.portals[1].active, 'resetPortals nie usunął portali');
});

await scenario('kwas: wpadnięcie gracza i kostki', 'level=2', null, () => {
  const T = window.T, g = window.game;
  const d0 = g.mech.deaths;
  T.tp(0, 0, 0.3); T.face(0, 0);
  T.run(2, { KeyW: 1 }, null); T.land(3);
  T.assert(g.mech.deaths > d0, 'gracz powinien wpaść do kwasu');
  g.fx.acidSplash(0, -6, 0.9);
});

await scenario('mechanika: kostka, przycisk, drzwi, fizzler, teleportacja kostki', 'level=1', '/tests/fixtures/mech.js', () => {
  const T = window.T, g = window.game;
  T.grab(0); T.wait(0.3); T.drop(); T.wait(0.5);
  const c = g.cubes[0];
  c.pos.set(-6, 0.41, -3); c.vel.set(0, 0, 0); T.wait(0.4);
  T.assert(g.buttons[0].pressed && g.doors[0].box.disabled, 'kostka na przycisku powinna otworzyć drzwi');
  T.tp(0, 0, -11); T.face(0, 0); T.run(1.5, { KeyW: 1 }, null);   // przez fizzler
  g.cubes[1].pos.set(0, 0.41, -13.9); T.wait(0.3);                // kostka w fizzler -> reset
  T.assert(g.mech.cubeResets > 0, 'fizzler powinien zresetować kostkę');
  T.tp(0, 0, 6); T.shoot(0, 12, 1.6, 6); T.shoot(1, -12, 1.6, 6);
  g.cubes[0].pos.set(10, 1.5, 6); g.cubes[0].vel.set(8, 0, 0); T.wait(0.6);   // kostka przez portal
  g.restartLevel();
});

await scenario('ukończenie poziomu i przejście przez portal', 'level=1', null, () => {
  const T = window.T, g = window.game;
  T.shoot(1, 0, 9, -18); T.face(0, -0.9); T.shoot(0, 0, 0, 6); T.face(0, 0);
  T.walkTo(0, 5); T.run(1, { KeyW: 1 }); T.land();
  T.walkTo(0, -14);
  T.wait(0.3);
  T.assert(g.exitReached(), 'gracz powinien stać na wyjściu');
}, () => window.T.assert(window.game.levelDone, 'pętla gry powinna oznaczyć poziom jako ukończony (fx.levelComplete)'));

await browser.close();
console.log(failed ? `\n${failed} scenariuszy nie przeszło` : '\nwszystkie scenariusze fx OK');
process.exit(failed ? 1 : 0);
