// Testy interfejsu (ui.js) w prawdziwej przeglądarce, bez ?test=1.
// Uruchom: node tests/ui.mjs [--port 8123] [--shots /tmp/maceaek-ui]
// Pointer lock w headless bywa niedostępny, więc „wejście do gry” symulujemy przez game.setActive(true/false)
// (to samo robi zdarzenie pointerlockchange). Zrzuty ekranu każdego ekranu trafiają do katalogu --shots.
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const args = process.argv.slice(2);
const arg = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
const base = 'http://localhost:' + arg('--port', '8123');
const shots = arg('--shots', '/tmp/maceaek-ui');
fs.mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const context = await browser.newContext({ viewport: { width: 1100, height: 680 } });
const page = await context.newPage();
page.setDefaultTimeout(60000);
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => {
  // audio.js dodaje osobny fragment projektu – jego brak (404 przy dynamicznym imporcie) nie jest błędem
  if (m.type() === 'error' && !/404/.test(m.text())) errors.push('console.error: ' + m.text());
});
page.on('response', (r) => { if (r.status() >= 400 && !r.url().endsWith('/audio.js') && !r.url().endsWith('/favicon.ico')) errors.push(`HTTP ${r.status()} ${r.url()}`); });

// Rysowanie sceny jest wyłączone (game.noRender), żeby testy były szybkie na programowym WebGL;
// na czas zrzutu ekranu włączamy je na dwie klatki.
const shot = async (name) => {
  await page.evaluate(() => { window.game.noRender = false; return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); });
  await page.screenshot({ path: `${shots}/${name}.png` });
  await page.evaluate(() => { window.game.noRender = true; });
};
const ui = () => page.evaluate(() => window.ui.state());
const settle = (ms = 350) => page.waitForTimeout(ms);
// jak Esc: zwolnienie pointer lock (jeśli headless go przyznał) i utrata aktywności
const leaveGame = async () => { await page.evaluate(() => { document.exitPointerLock(); window.game.setActive(false); }); await settle(); };
const enterGame = async () => { await page.evaluate(() => window.game.setActive(true)); await settle(); };

async function boot(url = `${base}/index.html`) {
  await page.goto(url);
  await page.waitForFunction(() => window.gameReady === true, null, { timeout: 20000 });
  await page.evaluate(() => { window.game.noRender = true; });
  await settle(300);
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const ok = (cond, msg) => { if (!cond) throw new Error(msg); };

test('ekran tytułowy: przyciski i legenda', async () => {
  await boot();
  ok((await ui()).screen === 'title', 'po wejściu powinien być ekran tytułowy');
  const labels = await page.$$eval('.screen.title .btn', (bs) => bs.map((b) => b.textContent.trim()));
  ok(labels.length === 3 && /^Graj/.test(labels[0]) && /Wybór poziomu/.test(labels[1]) && /Ustawienia/.test(labels[2]), 'przyciski tytułu: ' + labels.join(' | '));
  ok(await page.$('.legend-grid kbd'), 'brak legendy sterowania');
  ok(await page.evaluate(() => document.activeElement.dataset.act === 'play'), 'fokus powinien być na „Graj”');
  await shot('01-tytul');
});

test('wybór poziomu: siatka, klawiatura, start poziomu', async () => {
  await page.click('[data-act="levels"]');
  ok((await ui()).screen === 'levels', 'ekran wyboru poziomu');
  const n = await page.evaluate(() => window.game.LEVELS.length);
  ok((await page.$$('.lv')).length === n, 'liczba kafelków poziomów = LEVELS.length');
  await page.keyboard.press('ArrowRight');
  ok(await page.evaluate(() => document.activeElement.dataset.i === '1'), 'strzałka w prawo powinna przesunąć fokus na poziom 2');
  await page.keyboard.press('ArrowDown');
  ok(await page.evaluate(() => Number(document.activeElement.dataset.i) > 1), 'strzałka w dół przesuwa w dół siatki');
  await shot('02-wybor-poziomu');
  await page.keyboard.press('Escape');
  ok((await ui()).screen === 'title', 'Esc wraca do tytułu');
  await page.click('[data-act="levels"]');
  await page.click('.lv[data-i="2"]');
  ok(await page.evaluate(() => window.game.levelIndex()) === 2, 'kliknięcie kafelka ładuje poziom 3');
  await enterGame();
  const s = await ui();
  ok(s.screen === null && s.inGame, 'po wejściu do gry ekrany znikają');
  ok(await page.evaluate(() => document.getElementById('levelnum').textContent) === `Poziom 3 / ${await page.evaluate(() => window.game.LEVELS.length)}`, 'nagłówek poziomu w HUD');
});

test('karta wstępna poziomu i klawisz H', async () => {
  const visible = () => page.evaluate(() => !document.getElementById('intro').hidden);
  await page.evaluate(() => window.game.loadLevel(2));      // świeży start poziomu: karta pojawia się od razu
  ok(await visible(), 'karta wstępna powinna być widoczna po starcie poziomu');
  const t = await page.evaluate(() => document.getElementById('intro').textContent);
  ok(/Poziom 3/.test(t) && t.includes(await page.evaluate(() => window.game.LEVELS[2].name)), 'karta ma numer i nazwę: ' + t);
  await shot('03-karta-poziomu');
  await page.waitForFunction(() => document.getElementById('intro').hidden, null, { timeout: 15000 });
  await page.keyboard.press('KeyH');
  ok(await visible(), 'H pokazuje wskazówkę ponownie');
  ok(/Wskazówka/.test(await page.evaluate(() => document.getElementById('intro').textContent)), 'etykieta wskazówki');
});

test('HUD: podpowiedź kostki, timery, toasty', async () => {
  await page.evaluate(() => window.game.loadLevel(10));
  await enterGame();
  // patrzymy na kostkę z (3, 0.4, 10): stoimy 2 m przed nią
  await page.evaluate(() => {
    const g = window.game;
    g.player.pos.set(3, 0.02, 12); g.player.vel.set(0, 0, 0); g.player.yaw = 0; g.player.pitch = -0.55;
  });
  await page.waitForFunction(() => document.getElementById('prompt').dataset.state === 'pick', null, { timeout: 5000 }).catch(() => {});
  const p1 = await page.evaluate(() => ({ s: document.getElementById('prompt').dataset.state, t: window.game.lookTarget() }));
  ok(p1.s === 'pick' && p1.t && p1.t.type === 'cube' && p1.t.dist < 3.4, 'podpowiedź „Podnieś kostkę”: ' + JSON.stringify(p1));
  await page.evaluate(() => window.game.keys.KeyE = false);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => document.getElementById('prompt').dataset.state === 'held', null, { timeout: 5000 }).catch(() => {});
  const p2 = await page.evaluate(() => ({ s: document.getElementById('prompt').dataset.state, held: !!window.game.mech.held, c: document.getElementById('crosshair').dataset.state }));
  ok(p2.held && p2.s === 'held' && p2.c === 'held', 'podpowiedź „Upuść / Rzuć”: ' + JSON.stringify(p2));
  await page.evaluate(() => {
    const g = window.game;
    g.buttons[0].timer = 6; g.buttons[0].hold = 5;   // przycisk czasowy w trakcie odliczania
    g.events.dispatchEvent(new CustomEvent('toast', { detail: { msg: 'Ta powierzchnia nie przyjmuje portali', ms: 6000 } }));
    g.events.dispatchEvent(new CustomEvent('toast', { detail: { msg: 'Zdobyto coś miłego', ms: 6000, kind: 'success' } }));
    g.events.dispatchEvent(new CustomEvent('toast', { detail: { msg: 'Poziom zaczęty od nowa', ms: 6000 } }));
  });
  await page.waitForFunction(() => document.querySelectorAll('.toast').length === 3 && document.querySelector('.tchip:not([hidden])'), null, { timeout: 5000 }).catch(() => {});
  const hud = await page.evaluate(() => ({
    chips: [...document.querySelectorAll('.tchip:not([hidden])')].length,
    toasts: [...document.querySelectorAll('.toast')].map((t) => t.className),
  }));
  ok(hud.chips === 1, 'licznik przycisku czasowego');
  ok(hud.toasts.length === 3 && hud.toasts[0].includes('warn') && hud.toasts[1].includes('success') && hud.toasts[2].includes('info'), 'rodzaje toastów: ' + hud.toasts.join(' | '));
  await page.evaluate(() => { window.game.buttons[0].timer = 0; });
  await page.waitForTimeout(500);
  await page.evaluate(() => { document.getElementById('intro').hidden = true; });
  await shot('04-hud-kostka');
});

test('śmierć: błysk i licznik zgonów w HUD', async () => {
  await page.evaluate(() => { window.game.loadLevel(0); });
  await enterGame();
  await page.evaluate(() => { const g = window.game; g.mech.deaths++; g.events.dispatchEvent(new CustomEvent('death')); });
  ok(await page.evaluate(() => document.getElementById('flash').className) === 'death', 'błysk śmierci');
  await page.waitForFunction(() => document.querySelector('#statDeaths b').textContent === '1', null, { timeout: 5000 }).catch(() => {});
  ok(await page.evaluate(() => document.querySelector('#statDeaths b').textContent) === '1', 'licznik zgonów');
  // prawdziwa śmierć w kwasie
  await page.evaluate(() => window.game.player.pos.set(0, -6, 0));
  await page.waitForFunction(() => window.game.mech.deaths === 2, null, { timeout: 5000 }).catch(() => {});
  ok(await page.evaluate(() => window.game.mech.deaths) === 2, 'gra liczy zgon w kwasie');
});

test('pauza: menu, klawiatura, wznowienie', async () => {
  await leaveGame();
  await settle();
  ok((await ui()).screen === 'pause', 'utrata aktywności pokazuje pauzę');
  const labels = await page.$$eval('.panel .btn', (bs) => bs.map((b) => b.textContent.trim().replace(/\s+/g, ' ')));
  ok(/Wznów/.test(labels[0]) && /Restart/.test(labels[1]) && /Wybór poziomu/.test(labels[2]) && /Ustawienia/.test(labels[3]) && /Wyjście/.test(labels[4]), 'przyciski pauzy: ' + labels.join(' | '));
  await page.keyboard.press('ArrowDown');
  ok(await page.evaluate(() => document.activeElement.dataset.act) === 'restart', 'strzałka w dół');
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');
  ok(await page.evaluate(() => document.activeElement.dataset.act) === 'exit', 'zawijanie fokusu w menu');
  await page.keyboard.press('ArrowDown');
  ok(await page.evaluate(() => document.activeElement.dataset.act) === 'resume', 'zawijanie fokusu w dół');
  await shot('05-pauza');
  // Restart poziomu z pauzy zeruje liczniki
  await page.click('[data-act="restart"]');
  ok(await page.evaluate(() => window.game.mech.deaths) === 0 && await page.evaluate(() => window.game.levelTime) === 0, 'restart zeruje czas i zgony');
  await enterGame();
  ok((await ui()).screen === null, 'wznowienie chowa menu');
  ok(await page.evaluate(() => document.activeElement === document.body), 'fokus nie zostaje na ukrytym przycisku');
});

test('czas poziomu liczy się tylko w aktywnej grze', async () => {
  const t0 = await page.evaluate(() => window.game.levelTime);
  await page.waitForFunction((t) => window.game.levelTime > t + 0.3, t0, { timeout: 10000 }).catch(() => {});
  const t1 = await page.evaluate(() => window.game.levelTime);
  ok(t1 > t0 + 0.3, `czas powinien płynąć (${t0} -> ${t1})`);
  await leaveGame();
  const t2 = await page.evaluate(() => window.game.levelTime);
  await settle(500);
  ok(await page.evaluate(() => window.game.levelTime) === t2, 'w pauzie czas stoi');
  await page.evaluate(() => window.game.setActive(true));
});

test('ustawienia: zapis, zastosowanie, przywracanie', async () => {
  await leaveGame();
  await settle();
  await page.click('[data-act="settings"]');
  ok((await ui()).screen === 'settings', 'ekran ustawień');
  await page.$eval('#s-sens', (el) => { el.value = '2'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.$eval('#s-fov', (el) => { el.value = '95'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.click('[data-setting="invertY"]');
  await page.click('[data-setting="showLegend"]');
  const st = await page.evaluate(() => ({ s: window.game.settings, fov: window.game.camera.fov, base: window.game.baseFov, stored: JSON.parse(localStorage.getItem('maceaek.settings')), legend: document.body.dataset.legend }));
  ok(Math.abs(st.s.sensitivity - 0.0044) < 1e-9 && st.s.invertY === true, 'czułość i odwrócenie Y trafiają do game.settings: ' + JSON.stringify(st.s));
  ok(st.fov === 95 && st.base === 95, 'FOV ustawia camera.fov i game.baseFov');
  ok(st.stored.sens === 2 && st.stored.fov === 95 && st.stored.invertY === true && st.stored.showLegend === false && st.legend === '0', 'zapis w localStorage: ' + JSON.stringify(st.stored));
  await shot('06-ustawienia');
  // „Wróć” przywraca pauzę z fokusem na „Ustawienia”
  await page.keyboard.press('Escape');
  ok((await ui()).screen === 'pause' && await page.evaluate(() => document.activeElement.dataset.act) === 'settings', 'Esc wraca do pauzy');
  // po odświeżeniu ustawienia są zastosowane
  await boot();
  const after = await page.evaluate(() => ({ s: window.game.settings, fov: window.game.camera.fov }));
  ok(Math.abs(after.s.sensitivity - 0.0044) < 1e-9 && after.s.invertY && after.fov === 95, 'ustawienia po odświeżeniu: ' + JSON.stringify(after));
  await page.click('[data-act="settings"]');
  await page.click('[data-act="reset"]');
  const rst = await page.evaluate(() => ({ s: window.game.settings, fov: window.game.camera.fov, stored: localStorage.getItem('maceaek.settings') }));
  ok(Math.abs(rst.s.sensitivity - 0.0022) < 1e-9 && !rst.s.invertY && rst.fov === 75 && rst.stored === null, 'przywracanie domyślnych: ' + JSON.stringify(rst));
});

test('ukończenie poziomu: ekran, rekord, następny poziom', async () => {
  await boot();
  await page.evaluate(() => localStorage.removeItem('maceaek.stats'));
  await page.click('[data-act="levels"]'); await page.click('.lv[data-i="0"]');
  await enterGame();
  await page.evaluate(() => { const g = window.game, ex = g.LEVELS[0].exit; g.player.pos.set(ex.x, ex.y + 0.05, ex.z); g.player.vel.set(0, 0, 0); });
  await page.waitForFunction(() => window.ui.state().screen === 'complete', null, { timeout: 8000 });
  const info = await page.evaluate(() => ({ t: document.querySelector('.stat.big b').textContent, stored: JSON.parse(localStorage.getItem('maceaek.stats')), done: [...window.game.doneSet], autoNext: window.game.autoNext, idx: window.game.levelIndex() }));
  ok(/^\d+:\d\d\.\d$/.test(info.t) && info.stored['0'] && info.done.includes(0) && info.idx === 0, 'ekran ukończenia: ' + JSON.stringify(info));
  await settle(3200);
  ok(await page.evaluate(() => window.game.levelIndex()) === 0, 'poziom nie ładuje się sam po ukończeniu');
  await shot('07-ukonczenie');
  await page.click('[data-act="next"]');
  ok(await page.evaluate(() => window.game.levelIndex()) === 1, '„Następny poziom” ładuje poziom 2');
  await enterGame();
  ok((await ui()).screen === null, 'gra wznowiona');
});

test('ostatni poziom: ekran końcowy z podsumowaniem', async () => {
  await page.evaluate(() => { const g = window.game; g.loadLevel(g.LEVELS.length - 1); });
  await enterGame();
  await page.evaluate(() => { const g = window.game, ex = g.LEVELS[g.LEVELS.length - 1].exit; g.player.pos.set(ex.x, ex.y + 0.05, ex.z); g.player.vel.set(0, 0, 0); });
  await page.waitForFunction(() => window.ui.state().screen === 'final', null, { timeout: 8000 });
  ok(await page.$('.screen.final .stat.big'), 'podsumowanie końcowe');
  await shot('08-koniec');
  await page.click('.screen.final [data-act="exit"]');
  ok((await ui()).screen === 'title' && !(await ui()).inGame, 'Menu wraca do tytułu');
  ok(/Kontynuuj/.test(await page.$eval('[data-act="play"]', (b) => b.textContent)), 'po grze przycisk to „Kontynuuj”');
});

test('małe okno: tytuł i wybór poziomu mieszczą się w poziomie', async () => {
  await page.setViewportSize({ width: 420, height: 700 });
  await settle(300);
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'brak poziomego przewijania (tytuł)');
  await shot('09-tytul-maly');
  await page.click('[data-act="levels"]');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'brak poziomego przewijania (poziomy)');
  await shot('10-poziomy-maly');
  await page.setViewportSize({ width: 1100, height: 680 });
});

test('brak obsługi pointer lock: komunikat na tytule', async () => {
  await page.addInitScript(() => { delete Element.prototype.requestPointerLock; });
  await boot();
  ok(await page.$('.warnbox'), 'ostrzeżenie o braku Pointer Lock');
  ok(await page.$eval('[data-act="play"]', (b) => b.disabled), '„Graj” jest wyłączone');
});

let failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log('OK   ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + e.message); try { await shot('FAIL-' + tests.findIndex((t) => t[0] === name)); } catch { /* ignoruj */ } }
}
if (errors.length) { failed++; console.log('FAIL błędy konsoli/strony:\n  ' + [...new Set(errors)].join('\n  ')); }
else console.log('OK   brak błędów konsoli i strony');
await browser.close();
console.log(failed ? `\n${failed} testów nie przeszło` : `\nwszystkie testy UI OK (zrzuty: ${shots})`);
process.exit(failed ? 1 : 0);
