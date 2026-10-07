// Testy grafiki świata (gfx.js / bake.js / textures.js) – z renderowaniem.
// Uruchom: node tests/gfx.mjs [--port 8123]
// Sprawdza: czas wypalania, liczbę wywołań rysowania, raycast przez proxy brył, presety jakości
// (zapis w localStorage, ponowne wypalanie), światło dla kostek, brak wycieków geometrii przy zmianie poziomu.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const base = process.argv.includes('--port') ? 'http://localhost:' + process.argv[process.argv.indexOf('--port') + 1] : 'http://localhost:8123';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
await page.goto(`${base}/index.html?test=1&render=1`);
await page.waitForFunction(() => window.gameReady === true, null, { timeout: 30000 });

const tests = {
  'każdy poziom: wypalanie < 1.5 s, kilka wywołań rysowania, proxy niewidoczne': () => {
    const g = game, n = g.LEVELS.length;
    for (let i = 0; i < n; i++) {
      g.loadLevel(i);
      const s = g.gfx.stats;
      if (!(s.bakeMs < 1500)) throw new Error(`poziom ${i + 1}: bake ${s.bakeMs.toFixed(0)} ms`);
      if (!(s.triangles > 100)) throw new Error(`poziom ${i + 1}: brak geometrii`);
      if (s.drawCalls > 40) throw new Error(`poziom ${i + 1}: ${s.drawCalls} wywołań rysowania`);
      let vis = 0;
      g.scene.traverse(o => { if (o.isMesh && o.visible && o.userData.box && o.userData.box.kind !== 'door') vis++; });
      if (vis) throw new Error(`poziom ${i + 1}: widoczne proxy brył (${vis})`);
    }
  },
  'raycast i portale działają na proxy brył': () => {
    const T = window.T, g = game;
    g.loadLevel(0);
    g.resetPortals();
    T.tp(0, 0, 12);
    T.shoot(1, 0, 9, -18);
    T.assert(g.portals[1].active && Math.abs(g.portals[1].pos.z + 18) < 0.01, 'portal powinien powstać na dalekiej ścianie');
  },
  'presety jakości: zapis, ponowne wypalanie, render': () => {
    const g = game;
    g.loadLevel(8);
    const high = g.gfx.stats.triangles;
    if (!g.setQuality('low')) throw new Error('setQuality(low) odrzucone');
    if (g.getQuality() !== 'low' || localStorage.getItem('maceaek.quality') !== 'low') throw new Error('brak zapisu jakości');
    const low = g.gfx.stats.triangles;
    if (!(low < high)) throw new Error(`low (${low}) powinno mieć mniej trójkątów niż high (${high})`);
    if (g.rtCache.size !== 0) throw new Error('rtCache powinien zostać wyczyszczony');
    if (g.setQuality('nieistniejacy')) throw new Error('nieznany preset powinien być odrzucony');
    g.setQuality('medium');
    g.setQuality('high');
    if (g.gfx.stats.triangles !== high) throw new Error('high po powrocie powinno dać tę samą siatkę');
    localStorage.removeItem('maceaek.quality');
  },
  'światło dla kostek i kolory wierzchołków są skończone': () => {
    const g = game;
    g.loadLevel(10);
    const c = { r: 0, g: 0, b: 0 };
    g.gfx.lightAt(0, 1, 10, c);
    if (![c.r, c.g, c.b].every(v => Number.isFinite(v) && v > 0.05 && v < 1.6)) throw new Error('lightAt: ' + JSON.stringify(c));
    g.gfx.updateDynamics(g.cubes, 0.016);
    const m = g.cubes[0].mesh.material;
    if (!(m.color.r > 0.05 && m.color.r < 1.6)) throw new Error('kostka nie dostała oświetlenia');
    g.scene.traverse(o => {
      const col = o.geometry && o.geometry.attributes.color;
      if (col && !o.userData.gfx) for (const v of col.array) if (!Number.isFinite(v) || v < 0 || v > 1.6) throw new Error('zły kolor wierzchołka ' + v);
    });
  },
  'zmiana poziomu nie zostawia geometrii': () => {
    // pierwsze przejście rozgrzewa współdzielone pule (fx, tekstury); wyciek = przyrost między 2. a 3. przejściem
    const g = game, info = g.renderer.info;
    const counts = [];
    for (let pass = 0; pass < 3; pass++) for (let i = 0; i < g.LEVELS.length; i++) {
      g.loadLevel(i);
      g.renderer.render(g.scene, g.camera);
      if (pass === 2 && info.memory.geometries > counts[i] + 2) throw new Error(`poziom ${i + 1}: geometrie ${counts[i]} → ${info.memory.geometries}`);
      if (pass === 1) counts[i] = info.memory.geometries;
    }
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  const r = await page.evaluate(`(() => { try { (${fn.toString()})(); return null; } catch (e) { return String(e.message || e); } })()`);
  console.log(`${r ? 'FAIL' : 'OK  '} ${name}${r ? '\n     ' + r : ''}`);
  if (r) failed++;
}
if (errors.length) { console.log('błędy strony:', errors.slice(0, 5)); failed++; }
await browser.close();
process.exit(failed ? 1 : 0);
