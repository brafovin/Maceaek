// Testy dźwięku (audio.js + haczyki w game.js). Uruchom: node tests/audio.mjs [--port 8123]
//
// Chromium z --autoplay-policy=no-user-gesture-required, strona BEZ ?test=1: sprawdzamy, że kontekst audio startuje,
// każda nazwa dźwięku gra bez wyjątków, głośność/wyciszenie działają na węźle master, limit głosów jest respektowany,
// poziomy sygnału nie przesterowują, a w ?test=1 moduł jest no-opem. Na końcu – haczyki w grze (strzał, skok, kroki…).
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const portArg = process.argv.indexOf('--port');
const base = portArg > 0 ? 'http://localhost:' + process.argv[portArg + 1] : 'http://localhost:8123';
const browser = await chromium.launch({
  args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${!ok && detail ? '\n     ' + detail : ''}`);
  if (!ok) failed++;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function open(query) {
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  const errors = [], warns = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push('console.error: ' + m.text());
    if (m.type() === 'warning') warns.push(m.text());
  });
  await page.goto(`${base}/index.html${query}`);
  await page.waitForFunction(() => window.gameReady === true, null, { timeout: 30000 });
  return { page, errors, warns };
}

// ---------------------------------------------------------------- tryb normalny ----
{
  const { page, errors, warns } = await open('');
  const A = () => page.evaluate(async () => (await import('/audio.js')).audio.debug());

  check('przed init: audio.ready == false', await page.evaluate(async () => !(await import('/audio.js')).audio.ready));
  await page.evaluate(async () => (await import('/audio.js')).audio.init());
  await page.evaluate(async () => { window.__a = (await import('/audio.js')).audio; });
  await page.waitForFunction(() => window.__a.debug().state === 'running', null, { timeout: 5000 }).catch(() => {});
  const st = await A();
  check('po init: audio.ready i kontekst działa', st.state === 'running' && await page.evaluate(async () => (await import('/audio.js')).audio.ready), JSON.stringify(st));
  await page.evaluate(async () => (await import('/audio.js')).audio.init());
  check('init wielokrotnie bezpieczne', (await A()).state === 'running');

  // wszystkie nazwy: bez opcji i z pełnymi opcjami; po każdej rzucony wyjątek = błąd
  const res = await page.evaluate(async () => {
    const { audio } = await import('/audio.js');
    const out = { names: audio.debug().names, thrown: [] };
    for (const n of out.names) {
      try { audio.play(n); audio.play(n, { pos: [3, 1, -4], volume: 0.8, rate: 1.3, delay: 0.01 }); }
      catch (e) { out.thrown.push(n + ': ' + e.message); }
    }
    try { audio.play('nie-ma-takiego'); audio.play('nie-ma-takiego'); } catch (e) { out.thrown.push('nieznany: ' + e.message); }
    return out;
  });
  const required = ['shoot-blue', 'shoot-orange', 'portal-open-blue', 'portal-open-orange', 'portal-close', 'shot-fail', 'teleport', 'jump', 'land', 'step',
    'acid-splash', 'button-on', 'button-off', 'door-open', 'door-close', 'cube-pick', 'cube-drop', 'cube-throw', 'cube-hit', 'cube-reset', 'fizzle',
    'level-complete', 'ui-click', 'ui-hover', 'ui-back', 'pause', 'resume', 'hum'];
  const missing = required.filter(n => !res.names.includes(n));
  check('wszystkie wymagane nazwy dźwięków istnieją', missing.length === 0, 'brak: ' + missing);
  check('play() każdej nazwy bez wyjątków', res.thrown.length === 0, res.thrown.join('; '));
  check('nieznana nazwa = ostrzeżenie w konsoli, nie wyjątek', warns.some(w => w.includes('nie-ma-takiego')) && !res.thrown.length);

  // głośność i wyciszenie
  const vol = await page.evaluate(async () => {
    const { audio } = await import('/audio.js');
    audio.setMuted(false);
    const o = { def: audio.getVolume() };
    audio.setVolume(0.3);
    o.v = audio.getVolume(); o.stored = localStorage.getItem('maceaek.volume');
    return o;
  });
  check('setVolume/getVolume + localStorage', vol.v === 0.3 && vol.stored === '0.3', JSON.stringify(vol));
  await sleep(500);
  const g03 = (await A()).master;
  await page.evaluate(async () => (await import('/audio.js')).audio.setVolume(0.9));
  await sleep(500);
  const g09 = (await A()).master;
  check('gain mastera rośnie z głośnością', g03 > 0.01 && g09 > g03 * 2, `0.3 -> ${g03}, 0.9 -> ${g09}`);
  await page.evaluate(async () => (await import('/audio.js')).audio.setMuted(true));
  await sleep(500);
  const mu = await page.evaluate(async () => {
    const { audio } = await import('/audio.js');
    const before = audio.debug().voices;
    audio.play('shoot-blue'); audio.play('level-complete');
    return { muted: audio.isMuted(), stored: localStorage.getItem('maceaek.muted'), master: audio.debug().master, grew: audio.debug().voices - before };
  });
  check('setMuted: gain mastera = 0, stan zapisany, play() nic nie tworzy', mu.muted && mu.stored === '1' && mu.master < 1e-3 && mu.grew === 0, JSON.stringify(mu));
  await page.evaluate(async () => { const { audio } = await import('/audio.js'); audio.setMuted(false); audio.setVolume(0.7); });
  await sleep(500);
  check('odciszenie przywraca gain', (await A()).master > 0.3);

  // klawisz M
  await page.keyboard.press('KeyM');
  let toast = await page.textContent('#toast');
  const m1 = await page.evaluate(async () => (await import('/audio.js')).audio.isMuted());
  await page.keyboard.press('KeyM');
  const m2 = await page.evaluate(async () => (await import('/audio.js')).audio.isMuted());
  check('klawisz M przełącza wyciszenie i pokazuje toast', m1 === true && m2 === false && toast === 'Dźwięk wyłączony', `m1=${m1} m2=${m2} toast=${toast}`);

  // limit głosów
  const lim = await page.evaluate(async () => {
    const { audio } = await import('/audio.js');
    let max = 0;
    const names = audio.debug().names.filter(n => n !== 'hum');
    for (let i = 0; i < 400; i++) {
      audio.play(names[i % names.length], { delay: 0.3 });
      max = Math.max(max, audio.debug().voices);
    }
    return max;
  });
  check('limit równoczesnych głosów (≤ 24)', lim <= 24 && lim >= 16, 'max=' + lim);
  await page.waitForFunction(() => window.__a.debug().voices === 0, null, { timeout: 10000 }).catch(() => {});
  check('głosy są sprzątane po zakończeniu', (await A()).voices === 0, 'voices=' + (await A()).voices);

  // poziomy: każdy dźwięk osobno – nie może być bez śladu ani przesterowany (master = 1, żeby zmierzyć pełną skalę)
  await page.evaluate(async () => { const { audio } = await import('/audio.js'); audio.setVolume(1); });
  await sleep(500);
  const peaks = {};
  for (const n of res.names.filter(n => n !== 'hum')) {
    await page.evaluate(async (n) => { (await import('/audio.js')).audio.play(n); }, n);
    let pk = 0;
    for (let i = 0; i < 40; i++) { await sleep(25); pk = Math.max(pk, (await A()).peak); }
    peaks[n] = +pk.toFixed(3);
    await sleep(1400);
  }
  const loud = Object.entries(peaks).filter(([, p]) => p > 0.98), quietOnes = Object.entries(peaks).filter(([, p]) => p < 0.02);
  console.log('     szczyty (master=1, tło wliczone):', JSON.stringify(peaks));
  check('żaden dźwięk nie klipuje (szczyt ≤ 0.98)', loud.length === 0, JSON.stringify(loud));
  check('każdy dźwięk jest słyszalny (szczyt ≥ 0.02)', quietOnes.length === 0, JSON.stringify(quietOnes));
  await page.evaluate(async () => (await import('/audio.js')).audio.setVolume(0.7));

  // pętle portali: głośność rośnie, gdy portale są aktywne, i wygasa po zniknięciu
  const loops = await page.evaluate(async () => {
    const { audio } = await import('/audio.js');
    const mk = (x) => ({ active: true, linked: true, pos: { x, y: 1, z: -5 } });
    const L = { pos: [0, 1.6, 0], yaw: 0, pitch: 0, portals: [mk(-2), mk(3)] };
    for (let i = 0; i < 60; i++) audio.update(0.05, L);
    const on = audio.debug().portalLoops;
    L.portals = [{ active: false, pos: { x: 0, y: 0, z: 0 } }, { active: false, pos: { x: 0, y: 0, z: 0 } }];
    for (let i = 0; i < 120; i++) audio.update(0.05, L);
    return { on, off: audio.debug().portalLoops };
  });
  check('szum portali: włącza się i wyłącza', loops.on.every(g => g > 0.1) && loops.off.every(g => g < 0.01), JSON.stringify(loops));

  // haczyki w grze: podsłuch wywołań audio.play
  await page.evaluate(async () => {
    const { audio } = await import('/audio.js');
    window.__calls = [];
    const orig = audio.play.bind(audio);
    audio.play = (n, o) => { window.__calls.push(n); return orig(n, o); };
    window.__clear = () => { window.__calls.length = 0; };
    game.setActive(true);             // gra aktywna bez pointer-locka (mysz i klawisze działają)
  });
  const calls = () => page.evaluate(() => [...new Set(window.__calls)]);
  const clear = () => page.evaluate(() => window.__clear());
  const has = (list, ...names) => names.every(n => list.includes(n));

  await clear();
  await page.evaluate(() => { game.player.yaw = 0; game.player.pitch = 0; document.dispatchEvent(new MouseEvent('mousedown', { button: 0 })); });
  let c = await calls();
  check('strzał LPM: shoot-blue + portal-open-blue', has(c, 'shoot-blue', 'portal-open-blue'), c.join(','));
  await clear();
  await page.evaluate(() => { document.dispatchEvent(new MouseEvent('mousedown', { button: 2 })); });
  c = await calls();
  check('strzał PPM: shoot-orange', has(c, 'shoot-orange'), c.join(','));
  await clear();
  await page.evaluate(() => { game.player.pitch = 1.5; document.dispatchEvent(new MouseEvent('mousedown', { button: 0 })); });
  await page.evaluate(() => { game.player.pitch = 0; });
  await sleep(100);
  await clear();
  await page.keyboard.press('KeyR');
  c = await calls();
  check('restart (R) z portalami: portal-close', has(c, 'portal-close'), c.join(','));

  await clear();
  await page.evaluate(() => { game.keys.Space = true; });
  await sleep(150);
  await page.evaluate(() => { game.keys.Space = false; });
  for (let i = 0; i < 80 && !(await calls()).includes('land'); i++) await sleep(100);
  c = await calls();
  check('skok i lądowanie: jump, land', has(c, 'jump', 'land'), c.join(','));

  await clear();
  await page.evaluate(() => { game.keys.KeyW = true; game.keys.ShiftLeft = true; });
  for (let i = 0; i < 40 && !(await calls()).includes('step'); i++) await sleep(100);
  await page.evaluate(() => { game.keys.KeyW = false; game.keys.ShiftLeft = false; });
  c = await calls();
  check('bieg: kroki', has(c, 'step'), c.join(','));

  await clear();
  await page.evaluate(() => { game.loadLevel(1); game.player.pos.set(0, -5.3, -7); });   // poziom 2 ma dół z kwasem
  await sleep(500);
  c = await calls();
  check('kwas: acid-splash', has(c, 'acid-splash'), c.join(','));

  await clear();
  await page.evaluate(() => { game.setActive(false); game.setActive(true); });
  c = await calls();
  check('pauza/wznowienie: pause, resume', has(c, 'pause', 'resume'), c.join(','));

  await clear();
  await page.evaluate(() => {
    const ex = game.LEVELS[game.levelIndex()].exit;
    game.player.pos.set(ex.x, ex.y + 0.02, ex.z); game.player.vel.set(0, 0, 0);
  });
  for (let i = 0; i < 30 && !(await calls()).includes('level-complete'); i++) await sleep(100);
  c = await calls();
  check('ukończenie poziomu: level-complete', has(c, 'level-complete'), c.join(','));

  check('brak błędów w konsoli / wyjątków strony', errors.length === 0, errors.join('\n     '));
  await page.close();
}

// -------------------------------------------------------- haczyki mechanizmów (poziom z fixture) ----
{
  const { page, errors } = await open('?lvmod=' + encodeURIComponent('/tests/fixtures/mech.js'));
  await page.evaluate(async () => { const { audio } = await import('/audio.js'); audio.init(); });
  await page.evaluate(async () => { window.__a = (await import('/audio.js')).audio; });
  await page.waitForFunction(() => window.__a.debug().state === 'running', null, { timeout: 5000 }).catch(() => {});
  await page.evaluate(async () => {
    const { audio } = await import('/audio.js');
    window.__calls = [];
    const orig = audio.play.bind(audio);
    audio.play = (n, o) => { window.__calls.push(n); return orig(n, o); };
    game.forceActive = true;
  });
  await sleep(4000);   // czas gry płynie wolno (programowy WebGL) – poczekaj, aż minie ciche okno po wczytaniu poziomu
  await page.evaluate(() => { window.__calls.length = 0; });
  // kostka na przycisku -> przycisk + drzwi
  await page.evaluate(() => { const c = game.cubes[0]; c.pos.set(-6, 0.4 + 0.001, -3); c.vel.set(0, 0, 0); });
  await sleep(1200);
  let c = await page.evaluate(() => [...new Set(window.__calls)]);
  check('przycisk i drzwi: button-on, door-open', c.includes('button-on') && c.includes('door-open'), c.join(','));
  await page.evaluate(() => { window.__calls.length = 0; const k = game.cubes[0]; k.pos.set(-6, 0.4, 2); k.vel.set(0, 0, 0); });
  await sleep(1200);
  c = await page.evaluate(() => [...new Set(window.__calls)]);
  check('zwolnienie przycisku: button-off, door-close', c.includes('button-off') && c.includes('door-close'), c.join(','));
  await page.evaluate(() => { window.__calls.length = 0; const k = game.cubes[0]; k.pos.set(-6, 5, 2); k.vel.set(0, 0, 0); });
  await page.waitForFunction(() => window.__calls.includes('cube-hit'), null, { timeout: 10000 }).catch(() => {});
  c = await page.evaluate(() => [...new Set(window.__calls)]);
  check('upadek kostki: cube-hit', c.includes('cube-hit'), c.join(','));
  await page.evaluate(() => { window.__calls.length = 0; });
  await page.keyboard.press('KeyM'); await page.keyboard.press('KeyM');
  check('brak błędów w konsoli / wyjątków strony (mechanizmy)', errors.length === 0, errors.join('\n     '));
  await page.close();
}

// ------------------------------------------------------------------- ?test=1 ----
{
  const { page, errors } = await open('?test=1');
  const r = await page.evaluate(async () => {
    const { audio } = await import('/audio.js');
    audio.init();
    audio.play('shoot-blue'); audio.play('nie-ma'); audio.update(0.016, { pos: [0, 0, 0], yaw: 0, pitch: 0 });
    return { ready: audio.ready, state: audio.debug().state, voices: audio.debug().voices };
  });
  check('?test=1: init/play/update to no-op (ready=false, brak kontekstu)', r.ready === false && r.state === 'none' && r.voices === 0, JSON.stringify(r));
  check('?test=1: brak błędów', errors.length === 0, errors.join('; '));
  await page.close();
}

await browser.close();
console.log(failed ? `\n${failed} testów dźwięku nie przeszło` : '\nwszystkie testy dźwięku OK');
process.exit(failed ? 1 : 0);
