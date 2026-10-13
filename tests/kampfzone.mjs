// Rauchtest für „Kampfzone“: Spiel laden, Spieler-Aktionen prüfen, eine Runde im Zeitraffer durchspielen.
//
//   python3 -m http.server 8123        (im Repo-Verzeichnis)
//   node tests/kampfzone.mjs [--base http://localhost:8123]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const args = process.argv.slice(2);
const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'http://localhost:8123';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
await page.goto(`${base}/kampfzone/index.html?test=1&auto=1&skipbus=1&seed=7`);
await page.waitForFunction(() => window.KZ && window.KZ.ready, null, { timeout: 60000 });

const res = await page.evaluate(() => {
  const G = window.KZ, p = G.player, out = {};
  const key = code => window.dispatchEvent(new KeyboardEvent('keydown', { code }));
  const aimCam = (x, y, z) => { for (let i = 0; i < 4; i++) { const c = G.camera.position; const dx = x - c.x, dy = y - c.y, dz = z - c.z; p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.atan2(dy, Math.hypot(dx, dz)); G.debug.step(1); } };
  const bots = G.bots.map(b => b.brain.update);
  for (const b of G.bots) { b.state = 'ground'; b.pos.set(150, 0, 150 - G.bots.indexOf(b) * 2); b.brain.update = () => {}; }
  out.buildings = G.mapInfo.buildings.length;
  out.church = !!G.mapInfo.church;
  out.trafficLights = G.trafficLights.length;
  out.bins = [...G.pieces.all].filter(q => q.name === 'Mülltonne').length;
  out.chests = G.loot.chests.length;
  // Truhe öffnen
  const ch = G.loot.chests.filter(c => c.pos.y < 0.5).sort((a, b) => a.pos.length() - b.pos.length())[0];
  G.debug.tp(ch.pos.x - Math.sin(ch.yaw) * 1.6, 0.2, ch.pos.z - Math.cos(ch.yaw) * 1.6);
  G.debug.step(10);
  key('KeyE');
  G.debug.step(40);
  out.chestOpened = ch.opened;
  // Schießen
  G.debug.give('sturmgewehr', 2);
  key('Digit' + (p.inv.slots.findIndex(s => s && s.id === 'sturmgewehr') + 2));
  const bot = G.bots[0];
  G.debug.tp(-30, 0.2, -2); bot.pos.set(-45, 0, -2);
  G.debug.step(20);
  G.mouse.l = true;
  for (let i = 0; i < 40 && bot.alive; i++) aimCam(bot.pos.x, bot.pos.y + 1.1, bot.pos.z);
  G.mouse.l = false;
  out.botKilled = !bot.alive;
  // Spitzhacke → Holz
  key('Digit1');
  const tr = [...G.pieces.all].filter(q => q.kind === 'tree').sort((a, b) => a.center.distanceTo(p.pos) - b.center.distanceTo(p.pos))[0];
  G.debug.tp(tr.center.x + 1.6, 0.05, tr.center.z);
  const holz = p.inv.mats.holz;
  G.mouse.l = true;
  for (let i = 0; i < 80; i++) aimCam(tr.center.x, 1.4, tr.center.z);
  G.mouse.l = false;
  out.woodGained = p.inv.mats.holz - holz;
  // Bauen
  G.debug.tp(100, 0.05, 102); p.yaw = 0; p.pitch = 0; p.inv.mats.holz = 100;
  G.debug.step(3);
  for (const k of ['KeyQ', 'KeyF', 'KeyC']) { key(k); G.debug.step(2); G.mouse.l = true; G.debug.step(3); G.mouse.l = false; G.debug.step(2); }
  out.built = [...G.pieces.all].filter(q => q.built).length;
  key('Digit1');
  // Treppe im Bürohaus hoch
  G.debug.tp(13, 0.05, -38); p.yaw = -Math.PI / 2;
  G.keys.KeyW = true; G.debug.step(90); G.keys.KeyW = false;
  out.stairsY = +p.pos.y.toFixed(2);
  // Runde mit Bots im Zeitraffer
  G.bots.forEach((b, i) => { b.brain.update = bots[i]; });
  G.debug.tp(0, 0.2, -6);
  for (let s = 0; s < 40 && G.actors.filter(a => a.alive).length > 1; s++) G.debug.step(300, 1 / 30);
  out.alive = G.actors.filter(a => a.alive).length;
  out.time = Math.round(G.time);
  return out;
});
await browser.close();

const checks = [
  ['10 Gebäude', res.buildings === 10],
  ['Kirche', res.church],
  ['Ampeln', res.trafficLights >= 10],
  ['Mülltonnen', res.bins >= 20],
  ['Truhen', res.chests >= 20],
  ['Truhe geöffnet', res.chestOpened],
  ['Bot getroffen und eliminiert', res.botKilled],
  ['Holz mit Spitzhacke', res.woodGained > 0],
  ['Wand/Boden/Rampe gebaut', res.built === 3],
  ['Treppe hoch (y ≈ 4,2)', res.stairsY > 4],
  ['Runde endet (≤ 1 übrig)', res.alive <= 1],
  ['keine Fehler', errors.length === 0],
];
console.log(JSON.stringify(res));
let failed = 0;
for (const [name, ok] of checks) { console.log((ok ? 'OK    ' : 'FEHLER') + ' ' + name); if (!ok) failed++; }
if (errors.length) console.log(errors.join('\n'));
process.exit(failed ? 1 : 0);
