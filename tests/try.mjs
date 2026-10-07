// Uruchamia dowolny skrypt-eksperyment na poziomie i wypisuje wynik – do szukania obejść i prób rozwiązań.
//
//   node tests/try.mjs --lvmod /levels/lv12.js moj_skrypt.js [--level N] [--jitter 0.1 --seed 3] [--keep]
//
// Plik skryptu zawiera JEDNĄ funkcję strzałkową lub deklarację, np.:
//   (T) => { T.shoot(1, 0, 8, -18); T.walkTo(0, 5); /* … */ return T.st(); }
// Zwrócona wartość jest wypisywana jako JSON. Na końcu: czy wyjście osiągnięte, liczba śmierci i resetów kostek.
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const args = process.argv.slice(2);
let base = 'http://localhost:8123', lvmod = null, level = 1, jitter = 0, seed = 1, file = null;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--lvmod') lvmod = args[++i];
  else if (a === '--level') level = Number(args[++i]);
  else if (a === '--jitter') jitter = Number(args[++i]);
  else if (a === '--seed') seed = Number(args[++i]);
  else if (a === '--port') base = 'http://localhost:' + args[++i];
  else file = a;
}
if (!file) { console.error('podaj plik ze skryptem'); process.exit(2); }
const src = fs.readFileSync(file, 'utf8');

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
let url = `${base}/index.html?test=1&level=${level}`;
if (lvmod) url += '&lvmod=' + encodeURIComponent(lvmod);
await page.goto(url);
await page.waitForFunction(() => window.gameReady === true, null, { timeout: 20000 });
const res = await page.evaluate(({ src, jitter, seed }) => {
  const T = window.T, g = window.game;
  T.setJitter(jitter, seed);
  const out = { value: null, error: null };
  try { out.value = (0, eval)('(' + src + ')')(T); } catch (e) { out.error = String(e && e.stack || e).split('\n').slice(0, 4).join(' | '); }
  for (let i = 0; i < 6; i++) g.step(1 / 120);
  out.exit = g.exitReached();
  out.deaths = g.mech.deaths;
  out.cubeResets = g.mech.cubeResets;
  out.state = T.st();
  return out;
}, { src, jitter, seed });
console.log(JSON.stringify(res));
if (errors.length) console.log('błędy strony:', errors);
await browser.close();
