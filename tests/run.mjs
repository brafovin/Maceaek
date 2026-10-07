// Uruchamia scenariusze rozwiązań poziomów (solve) w prawdziwej przeglądarce (bez rysowania).
//
//   node tests/run.mjs                 – wszystkie poziomy
//   node tests/run.mjs 3 11 12         – wybrane (numeracja od 1)
//   node tests/run.mjs --jitter 0.2 --seeds 5 11   – z losowym szumem celowania (odporność)
//   node tests/run.mjs --lvmod /levels/lv11.js     – pojedynczy moduł poziomu (np. nowy, jeszcze nie w index.js)
//   node tests/run.mjs --port 8123 --base http://localhost:8123
//
// Wymaga serwera statycznego w katalogu repo (python3 -m http.server 8123) i playwrighta.
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const args = process.argv.slice(2);
const opt = { jitter: 0, seeds: 1, base: 'http://localhost:8123', lvmod: null, verbose: false, render: false };
const levels = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--jitter') opt.jitter = Number(args[++i]);
  else if (a === '--seeds') opt.seeds = Number(args[++i]);
  else if (a === '--base') opt.base = args[++i];
  else if (a === '--port') opt.base = 'http://localhost:' + args[++i];
  else if (a === '--lvmod') opt.lvmod = args[++i];
  else if (a === '--verbose' || a === '-v') opt.verbose = true;
  else if (a === '--render') opt.render = true;
  else levels.push(Number(a));
}

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function runOne(n, seed) {
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  let url = `${opt.base}/index.html?test=1&level=${n || 1}`;
  if (opt.lvmod) url += '&lvmod=' + encodeURIComponent(opt.lvmod);
  if (opt.render) url += '&render=1';
  await page.goto(url);
  await page.waitForFunction(() => window.gameReady === true, null, { timeout: 20000 }).catch(() => {});
  const t0 = Date.now();
  const res = await page.evaluate(({ jitter, seed }) => {
    const g = window.game, T = window.T;
    const lv = g.LEVELS[g.levelIndex()];
    T.setJitter(jitter, seed);
    const out = { name: lv.name, ok: false, err: null, deaths: 0, resets: 0, state: null };
    if (typeof lv.solve !== 'function') { out.err = 'brak solve()'; return out; }
    try { lv.solve(T); } catch (e) { out.err = String(e && e.message || e); }
    for (let i = 0; i < 6; i++) g.step(1 / 120);
    out.ok = !out.err && (g.exitHit || g.exitReached());
    out.deaths = g.mech.deaths;
    out.resets = g.mech.cubeResets;
    out.state = T.st();
    return out;
  }, { jitter: opt.jitter, seed });
  res.ms = Date.now() - t0;
  res.errors = errors;
  await page.close();
  return res;
}

let list = levels;
if (!list.length) {
  if (opt.lvmod) list = [1];
  else {
    const probe = await browser.newPage();
    await probe.goto(`${opt.base}/index.html?test=1`);
    await probe.waitForFunction(() => window.gameReady === true, null, { timeout: 20000 });
    const count = await probe.evaluate(() => window.game.LEVELS.length);
    await probe.close();
    list = Array.from({ length: count }, (_, i) => i + 1);
  }
}

let failed = 0;
for (const n of list) {
  let pass = 0; const msgs = [];
  for (let s = 1; s <= opt.seeds; s++) {
    const r = await runOne(n, s * 7919);
    const good = r.ok && r.errors.length === 0;
    if (good) pass++;
    else msgs.push(`  seed ${s}: ${r.err || 'wyjście nieosiągnięte'} ${JSON.stringify(r.state)} ${r.errors.join(' | ')}`);
    if (opt.verbose || (!good && opt.seeds === 1)) console.log(`  [${r.name}] ok=${r.ok} deaths=${r.deaths} cubeResets=${r.resets} ${r.ms}ms`);
  }
  const need = opt.seeds === 1 ? 1 : Math.ceil(opt.seeds * 0.8);
  const ok = pass >= need;
  if (!ok) failed++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} poziom ${n}: ${pass}/${opt.seeds}`);
  for (const m of msgs.slice(0, 3)) console.log(m);
}
await browser.close();
console.log(failed ? `\n${failed} poziomów nie przeszło` : '\nwszystkie poziomy OK');
process.exit(failed ? 1 : 0);
