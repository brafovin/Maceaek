// Zrzut ekranu poziomu z zadanej pozycji kamery (z renderowaniem).
//
//   node tests/shot.mjs --lvmod /levels/lv12.js --pos 0,1.6,12 --yaw 0 --pitch 0 --out /tmp/a.png [--size 900x560] [--setup skrypt.js]
//   --pos to POZYCJA STÓP (x,y,z); kamera jest 1.62 m wyżej. --setup: opcjonalny plik z funkcją (T)=>{…} uruchamianą przed zrzutem
//   (np. postawienie portali). Można podać kilka zrzutów: --pos/--yaw/--pitch/--out powtórzone w tej kolejności.
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const args = process.argv.slice(2);
let base = 'http://localhost:8123', lvmod = null, level = 1, size = [900, 560], setup = null;
const shots = [];
let cur = { pos: [0, 0, 0], yaw: 0, pitch: 0, out: '/tmp/shot.png' };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--lvmod') lvmod = args[++i];
  else if (a === '--level') level = Number(args[++i]);
  else if (a === '--size') size = args[++i].split('x').map(Number);
  else if (a === '--setup') setup = fs.readFileSync(args[++i], 'utf8');
  else if (a === '--port') base = 'http://localhost:' + args[++i];
  else if (a === '--pos') cur.pos = args[++i].split(',').map(Number);
  else if (a === '--yaw') cur.yaw = Number(args[++i]);
  else if (a === '--pitch') cur.pitch = Number(args[++i]);
  else if (a === '--out') { cur.out = args[++i]; shots.push(cur); cur = { pos: cur.pos, yaw: cur.yaw, pitch: cur.pitch, out: '/tmp/shot.png' }; }
}
if (!shots.length) shots.push(cur);

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: size[0], height: size[1] } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
let url = `${base}/index.html?test=1&render=1&level=${level}`;
if (lvmod) url += '&lvmod=' + encodeURIComponent(lvmod);
await page.goto(url);
await page.waitForFunction(() => window.gameReady === true, null, { timeout: 20000 });
if (setup) await page.evaluate((src) => (0, eval)('(' + src + ')')(window.T), setup);
for (const s of shots) {
  await page.evaluate(({ s }) => { const T = window.T; T.tp(...s.pos); T.face(s.yaw, s.pitch); }, { s });
  await page.waitForTimeout(700);   // kilka klatek na dojechanie kamery i portali
  await page.screenshot({ path: s.out });
  console.log('zapisano', s.out);
}
if (errors.length) console.log('błędy strony:', errors);
await browser.close();
