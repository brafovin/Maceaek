// Sprawdza, że żadna tablica (L.sign) nie jest zwrócona w głąb bryły (wtedy jest niewidoczna – tablice są jednostronne).
//   node tests/signs.mjs [--port 8123]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const base = process.argv.includes('--port') ? 'http://localhost:' + process.argv[process.argv.indexOf('--port') + 1] : 'http://localhost:8123';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.goto(`${base}/index.html?test=1`);
await page.waitForFunction(() => window.gameReady === true, null, { timeout: 20000 });
const bad = await page.evaluate(() => {
  const g = window.game, out = [];
  for (let i = 0; i < g.LEVELS.length; i++) {
    g.loadLevel(i);
    for (const m of g.scene.children) {
      if (!m.userData.sign) continue;
      const a = m.rotation.y, nx = Math.sin(a), nz = Math.cos(a);
      const x = m.position.x + nx * 0.2, y = m.position.y, z = m.position.z + nz * 0.2;
      const inside = g.boxes.find(b => x > b.min.x && x < b.max.x && y > b.min.y && y < b.max.y && z > b.min.z && z < b.max.z);
      if (inside) out.push(`poziom ${i + 1} (${g.LEVELS[i].name}): tablica w (${m.position.x.toFixed(1)}, ${m.position.y.toFixed(1)}, ${m.position.z.toFixed(1)}) ry=${a.toFixed(2)} patrzy w bryłę`);
    }
  }
  return out;
});
for (const b of bad) console.log('ZŁE ' + b);
console.log(bad.length ? `\n${bad.length} tablic niewidocznych` : 'wszystkie tablice zwrócone w stronę wolnej przestrzeni');
await browser.close();
process.exit(bad.length ? 1 : 0);
