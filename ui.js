// Interfejs gry: HUD, ekran tytułowy, pauza, wybór poziomu, ustawienia, ekrany ukończenia.
// Komunikuje się z silnikiem (game.js) wyłącznie przez window.game: zdarzenia game.events
// (levelstart, levelcomplete, death, toast, pause, resume, lockerror) i odczyty stanu.
// Opis: docs/ui.md.

const game = window.game;
const params = new URLSearchParams(location.search);
const TEST = !!params.get('test');          // tryb testów silnika: sam HUD, bez ekranów
const $ = (id) => document.getElementById(id);
const body = document.body;

// ------------------------------------------------------------- pomocnicze ----
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtClock(t) {                      // 1:05
  const s = Math.floor(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function fmtTime(t) {                       // 1:05.3
  const d = Math.round(t * 10);
  return `${Math.floor(d / 600)}:${((d % 600) / 10).toFixed(1).padStart(4, '0')}`;
}

function load(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* brak storage */ }
}

// ------------------------------------------------------------- ustawienia ----
const SETTINGS_KEY = 'maceaek.settings';
const BASE_SENS = 0.0022;                    // rad/px przy czułości 1.0×
const DEFAULTS = { sens: 1, invertY: false, fov: 75, showTimer: true, showHints: true, showLegend: true };
const saved = load(SETTINGS_KEY, {});
// volume / muted / quality należą do silnika i audio – nadpisujemy je tylko wtedy, gdy gracz je zmienił
let S = { ...DEFAULTS, ...saved };
const engineDefault = {};

let audio = null;
const engine = {
  volume:  { ok: () => !!audio, get: () => audio.getVolume(), set: (v) => audio.setVolume(v) },
  muted:   { ok: () => !!audio, get: () => audio.isMuted(), set: (v) => audio.setMuted(v) },
  quality: { ok: () => typeof game.setQuality === 'function' && typeof game.getQuality === 'function', get: () => game.getQuality(), set: (v) => game.setQuality(v) },
};
const current = (key) => S[key] ?? (engine[key]?.ok() ? engine[key].get() : undefined);

function persist() { save(SETTINGS_KEY, S); }

const APPLY = {
  sens() { game.settings.sensitivity = BASE_SENS * S.sens; },
  invertY() { game.settings.invertY = S.invertY; },
  fov() {
    game.baseFov = S.fov;
    game.camera.fov = S.fov;
    game.camera.updateProjectionMatrix();     // kamery wirtualne portali kopiują projekcję tej kamery
  },
  showTimer() { body.dataset.timer = S.showTimer ? '1' : '0'; },
  showLegend() { body.dataset.legend = S.showLegend ? '1' : '0'; },
  showHints() { pollPrompt(true); },
  volume() { if (S.volume != null) engine.volume.set(S.volume); },
  muted() { if (S.muted != null) engine.muted.set(S.muted); },
  quality() { if (S.quality != null) engine.quality.set(S.quality); },
};
function applySetting(key) {
  if (engine[key] && !engine[key].ok()) return;
  APPLY[key]();
}

function setSetting(key, value) {
  S[key] = value;
  persist();
  applySetting(key);
}

function resetSettings() {
  S = { ...DEFAULTS };
  try { localStorage.removeItem(SETTINGS_KEY); } catch { /* ignoruj */ }
  for (const k of Object.keys(engineDefault)) if (engine[k].ok()) engine[k].set(engineDefault[k]);
  for (const k of ['sens', 'invertY', 'fov', 'showTimer', 'showHints', 'showLegend']) APPLY[k]();
}

// moduł dźwięku dodaje inny fragment projektu – jego brak nie jest błędem
function loadAudio() {
  import('./audio.js').then((m) => {
    audio = m.audio || m.default || null;
    if (!audio) return;
    engineDefault.volume = audio.getVolume();
    engineDefault.muted = audio.isMuted();
    applySetting('volume');
    applySetting('muted');
  }).catch(() => { /* brak audio.js */ });
}
function sfx(name) { try { audio?.play(name); } catch { /* dźwięk nie jest krytyczny */ } }

// ---------------------------------------------------------------- statystyki ----
const STATS_KEY = 'maceaek.stats';
const LAST_KEY = 'maceaek.last';
const stats = load(STATS_KEY, {});            // { indeks: { t: najlepszy czas, d: zgony, c: resety kostek } }

function recordResult(d) {
  const prev = stats[d.index];
  const record = !prev || d.time < prev.t;
  if (record) { stats[d.index] = { t: +d.time.toFixed(2), d: d.deaths, c: d.cubeResets }; save(STATS_KEY, stats); }
  return { record, prev: prev ? prev.t : null };
}

const levelCount = () => game.LEVELS.length;
const levelAt = (i) => game.LEVELS[i];
function difficultyOf(i) {
  const d = levelAt(i)?.difficulty;
  return Number.isFinite(d) ? Math.max(1, Math.min(5, Math.round(d))) : Math.min(5, 1 + Math.floor(i * 5 / levelCount()));
}

// -------------------------------------------------------------------- HUD ----
const levelNum = $('levelnum'), levelNm = $('levelnm');
const statTime = $('statTime').querySelector('b'), statDeaths = $('statDeaths').querySelector('b');
const crosshairEl = $('crosshair'), promptEl = $('prompt'), flashEl = $('flash');
const timersEl = $('timers'), toastsEl = $('toasts'), introEl = $('intro'), noticeEl = $('notice');

function syncLevelHud() {
  const i = game.levelIndex();
  levelNum.textContent = `Poziom ${i + 1} / ${levelCount()}`;
  levelNm.textContent = levelAt(i)?.name || '';
  statTime.textContent = '0:00';
  statDeaths.textContent = '0';
  lastSecond = 0; lastDeaths = 0;
}

let lastSecond = 0, lastDeaths = 0, lastPoll = 0, promptState = 'none';
const portalOn = [false, false];

function pulse(i) {
  crosshairEl.classList.remove('pulse0', 'pulse1');
  void crosshairEl.offsetWidth;               // restart animacji
  crosshairEl.classList.add('pulse' + i);
}

function flash(kind) {
  flashEl.className = '';
  void flashEl.offsetWidth;
  flashEl.className = kind;
}

// podpowiedź interakcji pod celownikiem (odpytywana ~12 razy na sekundę)
function pollPrompt(force) {
  let state = 'none';
  if (S.showHints && !screen && game.isActive()) {
    if (game.mech.held) state = 'held';
    else if (game.lookTarget()) state = 'pick';
  }
  if (state === promptState && !force) return;
  promptState = state;
  promptEl.dataset.state = state;
  crosshairEl.dataset.state = state === 'pick' ? 'target' : state === 'held' ? 'held' : 'idle';
}

// liczniki przycisków czasowych (tylko odczyt game.buttons)
const chips = [];
function chip(n) {
  if (chips[n]) return chips[n];
  const el = document.createElement('div');
  el.className = 'tchip';
  el.innerHTML = '<span>Przycisk czasowy <b></b></span><i></i>';
  timersEl.appendChild(el);
  return (chips[n] = { el, val: el.querySelector('b'), p: -1, shown: true });
}
function updateChips() {
  let n = 0;
  for (const b of game.buttons) {
    if (!(b.timer > 0 && b.hold > 0)) continue;
    const c = chip(n++);
    const p = Math.min(1, b.hold / b.timer);
    if (Math.abs(p - c.p) > 0.005) {
      c.p = p;
      c.el.style.setProperty('--p', p.toFixed(3));
      c.el.classList.toggle('low', p < 0.3 && p < 1);
      c.val.textContent = b.hold.toFixed(1) + ' s';
    }
    if (!c.shown) { c.el.hidden = false; c.shown = true; }
  }
  for (let i = n; i < chips.length; i++) if (chips[i].shown) { chips[i].el.hidden = true; chips[i].shown = false; chips[i].p = -1; }
}

function tick(now) {
  requestAnimationFrame(tick);
  if (!inGame) return;
  for (let i = 0; i < 2; i++) {
    const on = game.portals[i].active;
    if (on !== portalOn[i]) { portalOn[i] = on; if (on) pulse(i); }
  }
  const sec = Math.floor(game.levelTime);
  if (sec !== lastSecond) { lastSecond = sec; statTime.textContent = fmtClock(sec); }
  if (game.mech.deaths !== lastDeaths) { lastDeaths = game.mech.deaths; statDeaths.textContent = String(lastDeaths); }
  if (now - lastPoll > 80) { lastPoll = now; pollPrompt(); }
  updateChips();
}

// ---- komunikaty (toasty): kolejka, ikony, rodzaje info / warn / success ----
const WARN_RE = /^(Kwas|Fizzler|Ta powierzchnia|Za mało|Portale nie|Nie ma|Nie udało)/;
const ICONS = { info: 'i', warn: '!', success: '✓' };
const liveToasts = [];
const MAX_TOASTS = 3;

function dismissToast(t) {
  const k = liveToasts.indexOf(t);
  if (k < 0) return;
  liveToasts.splice(k, 1);
  clearTimeout(t.timer);
  t.el.classList.add('out');
  setTimeout(() => t.el.remove(), 260);
}

function pushToast(msg, ms = 1800, kind) {
  if (!msg) return;
  kind = ICONS[kind] ? kind : WARN_RE.test(msg) ? 'warn' : 'info';
  const same = liveToasts.find((t) => t.msg === msg);
  if (same) {                                  // powtórzony komunikat odświeża istniejący zamiast się piętrzyć
    clearTimeout(same.timer);
    same.timer = setTimeout(() => dismissToast(same), ms);
    same.el.classList.remove('bump');
    void same.el.offsetWidth;
    same.el.classList.add('bump');
    return;
  }
  while (liveToasts.length >= MAX_TOASTS) dismissToast(liveToasts[0]);
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  const ico = document.createElement('span');
  ico.className = 'ico'; ico.setAttribute('aria-hidden', 'true'); ico.textContent = ICONS[kind];
  const txt = document.createElement('span');
  txt.textContent = msg;
  el.append(ico, txt);
  toastsEl.appendChild(el);
  const t = { el, msg, timer: setTimeout(() => dismissToast(t), ms) };
  liveToasts.push(t);
}

// ---- karta wstępna poziomu ----
let introTimer = 0, introHide = 0, introPending = true;
function showIntro(label, force) {
  const i = game.levelIndex(), lv = levelAt(i);
  if (!lv) return;
  introPending = false;
  introEl.querySelector('.intro-tag').textContent = label || `Poziom ${i + 1}`;
  introEl.querySelector('.intro-name').textContent = lv.name;
  const hint = (force || S.showHints) ? (lv.hint || '') : '';
  introEl.querySelector('.intro-hint').textContent = hint;
  clearTimeout(introTimer); clearTimeout(introHide);
  introEl.classList.remove('out');
  introEl.hidden = false;
  introEl.style.animation = 'none'; void introEl.offsetWidth; introEl.style.animation = '';
  introTimer = setTimeout(() => hideIntro(), Math.min(6000, 2500 + hint.length * 20));
}
function hideIntro(now) {
  clearTimeout(introTimer); clearTimeout(introHide);
  if (now || introEl.hidden) { introEl.hidden = true; return; }
  introEl.classList.add('out');
  introHide = setTimeout(() => { introEl.hidden = true; introEl.classList.remove('out'); }, 400);
}

let noticeTimer = 0;
function showNotice(msg, ms = 4500) {
  noticeEl.textContent = msg;
  noticeEl.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { noticeEl.hidden = true; }, ms);
}

// ----------------------------------------------------------------- ekrany ----
const screensEl = $('screens');
let screen = null;              // title | pause | levels | settings | complete | final | null (gra)
let returnTo = 'title';         // dokąd wraca „Wróć” z listy poziomów / ustawień
let inGame = false;             // czy gracz wszedł już do gry (pokazuje HUD)
let started = false;            // czy w tej sesji strony zaczęto grę (etykieta „Kontynuuj”)
let lastResult = null;          // wynik ostatnio ukończonego poziomu
const lockSupported = typeof HTMLCanvasElement.prototype.requestPointerLock === 'function';

const KEYS_LEGEND = [
  ['<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>', 'poruszanie się'],
  ['mysz', 'rozglądanie się'],
  ['<kbd class="b">LPM</kbd>', '<span class="b">niebieski</span> portal'],
  ['<kbd class="o">PPM</kbd>', '<span class="o">pomarańczowy</span> portal'],
  ['<kbd>Spacja</kbd> <kbd>Shift</kbd>', 'skok · bieg'],
  ['<kbd>E</kbd> <kbd>Q</kbd>', 'podnieś / upuść kostkę · rzuć'],
  ['<kbd>R</kbd>', 'restart poziomu'],
  ['<kbd>N</kbd> <kbd>P</kbd>', 'następny · poprzedni poziom'],
  ['<kbd>H</kbd> <kbd>M</kbd>', 'wskazówka · wyciszenie'],
  ['<kbd>Esc</kbd>', 'pauza i menu'],
];

const doneCount = () => [...game.doneSet].filter((i) => i < levelCount()).length;
const continueIndex = () => {
  const i = load(LAST_KEY, null);
  return Number.isInteger(i) && i >= 0 && i < levelCount() ? i : game.levelIndex();
};

function panel(tag, title, bodyHtml, o = {}) {
  return `<section class="screen ${o.cls || ''}" role="dialog" aria-modal="true" aria-labelledby="dlgTitle">
    <div class="panel ${o.panelCls || ''}">
      <header class="panel-head ${o.headCls || ''}">${o.icon || ''}<div><div class="tag">${tag}</div><h2 id="dlgTitle">${title}</h2></div></header>
      ${bodyHtml}
    </div></section>`;
}

const VIEWS = {
  title() {
    const cont = started || game.doneSet.size > 0 || load(LAST_KEY, null) > 0;
    const idx = continueIndex();
    const warn = lockSupported ? '' : '<p class="warnbox" role="alert">Twoja przeglądarka nie obsługuje przechwytywania kursora (Pointer Lock), którego gra wymaga do sterowania myszą. Użyj komputera z aktualną przeglądarką (Chrome, Firefox, Edge lub Safari).</p>';
    return `<section class="screen title" role="dialog" aria-modal="true" aria-labelledby="dlgTitle">
      <div class="title-wrap">
        <div class="logo">
          <div class="portal-pair" aria-hidden="true"><i></i><i></i></div>
          <div class="kicker">Komora testowa</div>
          <h1 id="dlgTitle">Maceaek</h1>
          <p class="tagline">Dwa portale, jedno wyjście. Opanuj działo portalowe i przejdź kolejne komory.</p>
          <nav class="menu" aria-label="Menu główne">
            <button class="btn primary" data-act="play" data-nav data-autofocus ${lockSupported ? '' : 'disabled'}>${cont ? 'Kontynuuj' : 'Graj'}<span class="sub">${cont ? `poziom ${idx + 1}` : 'poziom 1'}</span></button>
            <button class="btn" data-act="levels" data-nav>Wybór poziomu<span class="sub">${doneCount()} / ${levelCount()}</span></button>
            <button class="btn" data-act="settings" data-nav>Ustawienia</button>
          </nav>
          ${warn}
          <div class="title-meta">Ukończono ${doneCount()} z ${levelCount()} poziomów</div>
        </div>
        <aside class="paper" aria-label="Sterowanie">
          <h3>Panel sterowania</h3>
          <dl class="legend-grid">${KEYS_LEGEND.map(([k, d]) => `<dt>${k}</dt><dd>${d}</dd>`).join('')}</dl>
        </aside>
      </div></section>`;
  },

  pause() {
    const i = game.levelIndex();
    return panel(`Pauza · poziom ${i + 1} / ${levelCount()}`, esc(levelAt(i).name), `
      <div class="panel-body"><nav class="menu" aria-label="Menu pauzy">
        <button class="btn primary" data-act="resume" data-nav data-autofocus>Wznów<span class="sub">Enter</span></button>
        <button class="btn" data-act="restart" data-nav>Restart poziomu<span class="sub">R</span></button>
        <button class="btn" data-act="levels" data-nav>Wybór poziomu</button>
        <button class="btn" data-act="settings" data-nav>Ustawienia</button>
        <button class="btn ghost" data-act="exit" data-nav>Wyjście do tytułu</button>
      </nav></div>
      <div class="panel-foot"><span>Czas: ${fmtClock(game.levelTime)}</span><span>Zgony: ${game.mech.deaths}</span><span>Kliknij „Wznów”, aby wrócić do gry</span></div>`);
  },

  levels() {
    const cur = game.levelIndex();
    const items = game.LEVELS.map((lv, i) => {
      const done = game.doneSet.has(i), best = stats[i];
      const d = difficultyOf(i);
      const label = `Poziom ${i + 1}: ${lv.name}${done ? ', ukończony' : ''}${best ? `, najlepszy czas ${fmtTime(best.t)}` : ''}, trudność ${d} z 5`;
      return `<li><button class="lv${i === cur ? ' cur' : ''}${done ? ' done' : ''}" data-act="level" data-i="${i}" data-nav aria-label="${esc(label)}"${i === cur ? ' aria-current="true"' : ''}>
        <span class="n">${i + 1}</span>${i === cur && inGame ? '<span class="curtag">TU</span>' : ''}
        <span class="nm">${esc(lv.name)}</span>
        <span class="meta"><span class="pips" aria-hidden="true">${[1, 2, 3, 4, 5].map((k) => `<i${k <= d ? ' class="on"' : ''}></i>`).join('')}</span><span>${best ? fmtTime(best.t) : '—'}</span></span>
      </button></li>`;
    }).join('');
    return panel('Wybór poziomu', 'Komory testowe', `
      <div class="levels-body"><ul class="levels-grid">${items}</ul></div>
      <div class="panel-foot"><button class="btn ghost" data-act="back" data-nav>Wróć</button><span>Ukończono ${doneCount()} z ${levelCount()} · strzałki: wybór · Enter: start · Esc: wróć</span></div>`, { panelCls: 'wide' });
  },

  settings(o) {
    const ROWS = [
      ['Sterowanie', [
        { key: 'sens', type: 'range', label: 'Czułość myszy', min: 0.2, max: 3, step: 0.05, fmt: (v) => v.toFixed(2) + '×' },
        { key: 'invertY', type: 'toggle', label: 'Odwróć oś Y' },
      ]],
      ['Obraz', [
        { key: 'fov', type: 'range', label: 'Pole widzenia', min: 60, max: 110, step: 1, fmt: (v) => v + '°' },
        { key: 'quality', type: 'seg', label: 'Jakość grafiki', opts: [['low', 'Niska'], ['medium', 'Średnia'], ['high', 'Wysoka']] },
      ]],
      ['Dźwięk', [
        { key: 'volume', type: 'range', label: 'Głośność', min: 0, max: 1, step: 0.05, fmt: (v) => Math.round(v * 100) + '%' },
        { key: 'muted', type: 'toggle', label: 'Wycisz dźwięk' },
      ]],
      ['Interfejs', [
        { key: 'showTimer', type: 'toggle', label: 'Czas i zgony na ekranie' },
        { key: 'showHints', type: 'toggle', label: 'Podpowiedzi i wskazówki poziomu' },
        { key: 'showLegend', type: 'toggle', label: 'Legenda sterowania' },
      ]],
    ];
    const rows = ROWS.map(([group, list]) => {
      const html = list.filter((r) => !engine[r.key] || engine[r.key].ok()).map((r) => {
        const v = current(r.key);
        if (r.type === 'range') {
          const pct = ((v - r.min) / (r.max - r.min) * 100).toFixed(1);
          return `<div class="srow"><label for="s-${r.key}">${r.label}</label>
            <input id="s-${r.key}" type="range" min="${r.min}" max="${r.max}" step="${r.step}" value="${v}" style="--fill:${pct}%" data-nav data-setting="${r.key}">
            <output class="val" for="s-${r.key}">${r.fmt(v)}</output></div>`;
        }
        if (r.type === 'toggle') {
          return `<div class="srow toggle"><span class="lbl" id="l-${r.key}">${r.label}</span>
            <button type="button" class="switch" role="switch" aria-checked="${!!v}" aria-labelledby="l-${r.key}" data-nav data-setting="${r.key}"></button></div>`;
        }
        return `<div class="srow seg"><span class="lbl" id="l-${r.key}">${r.label}</span>
          <div class="segs" role="radiogroup" aria-labelledby="l-${r.key}">${r.opts.map(([val, name]) =>
            `<button type="button" role="radio" aria-checked="${v === val}" data-nav data-setting="${r.key}" data-value="${val}">${name}</button>`).join('')}</div></div>`;
      }).join('');
      return html ? `<div class="sgroup">${group}</div>${html}` : '';
    }).join('');
    return panel('Ustawienia', 'Dostosuj grę', `
      <div class="settings-body">${rows}</div>
      <div class="settings-actions"><button class="btn primary" data-act="back" data-nav>Wróć</button><button class="btn" data-act="reset" data-nav>Przywróć domyślne</button></div>
      <div class="panel-foot" id="sMsg" aria-live="polite"><span>${esc(o.msg || 'Zmiany zapisują się automatycznie.')}</span></div>`);
  },

  complete() {
    const r = lastResult, lv = levelAt(r.index);
    const recLine = r.record
      ? `<p class="record new">${r.prev == null ? 'Pierwsze ukończenie!' : `Nowy rekord! Poprzedni: ${fmtTime(r.prev)}`}</p>`
      : `<p class="record">Rekord: ${fmtTime(r.prev)}</p>`;
    return panel('Poziom ukończony', `${r.index + 1}. ${esc(lv.name)}`, `
      <div class="panel-body">
        <div class="statgrid">
          <div class="stat big"><small>Czas</small><b>${fmtTime(r.time)}</b></div>
          <div class="stat"><small>Zgony</small><b>${r.deaths}</b></div>
          <div class="stat"><small>Resety kostek</small><b>${r.cubeResets}</b></div>
        </div>${recLine}
        <nav class="row-btns" aria-label="Co dalej">
          <button class="btn primary" data-act="next" data-nav data-autofocus>Następny poziom</button>
          <button class="btn" data-act="replay" data-nav>Powtórz</button>
          <button class="btn" data-act="exit" data-nav>Menu</button>
        </nav>
      </div>`, { panelCls: 'ok', headCls: 'ok', icon: '<span class="check" aria-hidden="true"></span>' });
  },

  final() {
    const n = levelCount();
    let total = 0, deaths = 0, timed = 0;
    for (let i = 0; i < n; i++) if (stats[i]) { total += stats[i].t; deaths += stats[i].d; timed++; }
    const all = doneCount() >= n;
    return `<section class="screen final" role="dialog" aria-modal="true" aria-labelledby="dlgTitle">
      <div class="panel ok">
        <header class="panel-head ok"><span class="check" aria-hidden="true"></span><div><div class="tag">${all ? 'Koniec testów' : 'Ostatnia komora'}</div><h2 id="dlgTitle">${all ? 'Gratulacje – wszystkie poziomy ukończone!' : 'To był ostatni poziom'}</h2></div></header>
        <div class="panel-body">
          <div class="statgrid">
            <div class="stat big"><small>Łączny czas rekordów</small><b>${timed ? fmtTime(total) : '—'}</b></div>
            <div class="stat"><small>Poziomy</small><b>${doneCount()} / ${n}</b></div>
            <div class="stat"><small>Zgony (rekordy)</small><b>${deaths}</b></div>
          </div>
          <p class="record">${all ? 'Dziękujemy za udział w programie testowym.' : 'Wróć do wyboru poziomu, aby ukończyć pozostałe komory.'}</p>
          <nav class="row-btns" aria-label="Co dalej">
            <button class="btn primary" data-act="${all ? 'again' : 'levels'}" data-nav data-autofocus>${all ? 'Zagraj od początku' : 'Wybór poziomu'}</button>
            <button class="btn" data-act="${all ? 'levels' : 'again'}" data-nav>${all ? 'Wybór poziomu' : 'Zagraj od początku'}</button>
            <button class="btn" data-act="exit" data-nav>Menu</button>
          </nav>
        </div>
      </div></section>`;
  },
};

function show(name, o = {}) {
  screen = name;
  body.dataset.screen = name;
  screensEl.hidden = false;
  screensEl.innerHTML = VIEWS[name](o);
  noticeEl.hidden = true;
  hideIntro(true);
  pollPrompt(true);
  const root = screensEl.firstElementChild;
  if (!inGame && name !== 'title') root.classList.add('title');   // poza grą: tło tytułowe zamiast widoku poziomu
  const el = (o.focus && root.querySelector(o.focus)) || root.querySelector(name === 'levels' ? '.lv.cur' : '[data-autofocus]') || root.querySelector('[data-nav]');
  if (el) el.focus();
}

function hide() {
  screen = null;
  body.dataset.screen = 'play';
  screensEl.hidden = true;
  screensEl.innerHTML = '';
  if (document.activeElement && document.activeElement !== body) document.activeElement.blur();
  pollPrompt(true);
}

function setInGame(v) {
  inGame = v;
  body.dataset.ingame = v ? '1' : '0';
}

function tryResume() {
  if (!lockSupported) { showNotice('Ta przeglądarka nie obsługuje przechwytywania kursora.'); return; }
  game.requestLock();
}

// ---- akcje przycisków ----
function startLevel(i, reload) {
  started = true;
  if (reload || i !== game.levelIndex() || game.levelDone) game.loadLevel(i);
  tryResume();
}

const ACTIONS = {
  play() { startLevel(continueIndex()); },
  resume() { tryResume(); },
  restart() { game.restartLevel(); tryResume(); },
  levels() { returnTo = screen === 'pause' ? 'pause' : 'title'; show('levels'); },
  settings() { returnTo = screen === 'pause' ? 'pause' : 'title'; show('settings'); },
  back() { show(returnTo, { focus: `[data-act="${screen}"]` }); },
  level(el) { startLevel(Number(el.dataset.i)); },
  next() { startLevel((lastResult.index + 1) % levelCount()); },
  replay() { game.restartLevel(); started = true; tryResume(); },
  again() { startLevel(0, true); },
  exit() { setInGame(false); show('title'); },
  reset() { resetSettings(); show('settings', { focus: '[data-act="reset"]', msg: 'Przywrócono ustawienia domyślne.' }); },
};

screensEl.addEventListener('click', (e) => {
  const set = e.target.closest('[data-setting]');
  if (set && set.tagName === 'BUTTON') {
    const key = set.dataset.setting;
    if (set.getAttribute('role') === 'switch') {
      const v = set.getAttribute('aria-checked') !== 'true';
      set.setAttribute('aria-checked', v);
      setSetting(key, v);
    } else {
      setSetting(key, set.dataset.value);
      for (const b of set.parentElement.children) b.setAttribute('aria-checked', b === set);
    }
    sfx('ui-click');
    return;
  }
  const act = e.target.closest('[data-act]');
  if (!act || act.disabled) return;
  sfx('ui-click');
  ACTIONS[act.dataset.act]?.(act);
});

screensEl.addEventListener('input', (e) => {
  const el = e.target;
  if (el.type !== 'range') return;
  const v = Number(el.value);
  setSetting(el.dataset.setting, v);
  el.style.setProperty('--fill', ((v - el.min) / (el.max - el.min) * 100).toFixed(1) + '%');
  const fmt = { sens: (x) => x.toFixed(2) + '×', fov: (x) => x + '°', volume: (x) => Math.round(x * 100) + '%' }[el.dataset.setting];
  el.nextElementSibling.textContent = fmt(v);
});

// ---- klawiatura w menu ----
function navigate(dir) {
  const items = [...screensEl.querySelectorAll('[data-nav]:not([disabled])')];
  const cur = document.activeElement;
  const k = items.indexOf(cur);
  if (k < 0) { items[0]?.focus(); return; }
  const menu = cur.closest('.menu');
  if (menu) {                                    // pionowe menu: zawijanie
    const list = [...menu.querySelectorAll('[data-nav]:not([disabled])')];
    const j = list.indexOf(cur) + (dir === 'down' || dir === 'right' ? 1 : -1);
    list[(j + list.length) % list.length].focus();
    return;
  }
  const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let best = null, bestScore = Infinity;
  for (const it of items) {
    if (it === cur) continue;
    const b = it.getBoundingClientRect();
    const dx = b.left + b.width / 2 - cx, dy = b.top + b.height / 2 - cy;
    const main = dir === 'down' ? dy : dir === 'up' ? -dy : dir === 'right' ? dx : -dx;
    if (main < 4) continue;
    const side = (dir === 'down' || dir === 'up') ? Math.abs(dx) : Math.abs(dy);
    const score = main + side * 2.5;
    if (score < bestScore) { bestScore = score; best = it; }
  }
  if (best) best.focus();
}

const ARROWS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (screen) {
    if (e.code === 'Escape') {
      e.preventDefault();
      if (screen === 'levels' || screen === 'settings') ACTIONS.back();
      else if (screen === 'pause') tryResume();
    } else if (ARROWS[e.code]) {
      const onRange = e.target.type === 'range';
      if (onRange && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) return;   // suwak obsługuje je sam
      e.preventDefault();
      navigate(ARROWS[e.code]);
    }
    return;
  }
  if (e.repeat || !inGame || !game.isActive()) return;
  if (e.code === 'KeyH') showIntro('Wskazówka', true);
  else if (e.code === 'KeyM') {
    const muted = !current('muted');
    setSetting('muted', muted);
    pushToast(muted ? 'Dźwięk wyłączony' : 'Dźwięk włączony', 1200);
  }
});

// ---------------------------------------------------- zdarzenia silnika ----
const ev = game?.events;
let completeTimer = 0;

ev?.addEventListener('levelstart', (e) => {
  const d = e.detail;
  clearTimeout(completeTimer);
  syncLevelHud();
  updateChips();
  if (!d.restart && !TEST) {
    save(LAST_KEY, d.index);
    introPending = true;
    if (screen === null && game.isActive()) showIntro();
  }
});

ev?.addEventListener('resume', () => {
  if (TEST) return;
  setInGame(true);
  started = true;
  hide();
  if (introPending && !game.levelDone) showIntro();
});

ev?.addEventListener('pause', () => {
  if (TEST || screen !== null || !inGame) return;
  show('pause');
});

ev?.addEventListener('toast', (e) => pushToast(e.detail.msg, e.detail.ms, e.detail.kind));
ev?.addEventListener('death', () => flash('death'));
ev?.addEventListener('lockerror', () => {
  if (screen) showNotice('Nie udało się przechwycić kursora – kliknij jeszcze raz.');
});

ev?.addEventListener('levelcomplete', (e) => {
  if (TEST) return;
  const d = e.detail;
  const res = recordResult(d);
  lastResult = { ...d, ...res };
  save(LAST_KEY, (d.index + 1) % levelCount());
  flash('win');
  clearTimeout(completeTimer);
  completeTimer = setTimeout(() => {
    if (!game.levelDone || game.levelIndex() !== d.index) return;   // gracz zdążył zmienić poziom
    game.setActive(false);
    try { document.exitPointerLock(); } catch { /* ignoruj */ }
    show(d.index === levelCount() - 1 ? 'final' : 'complete');
  }, 900);
});

// ------------------------------------------------------------------- start ----
function fatal(msg) {
  const err = $('err');
  err.style.display = 'block';
  err.innerHTML = `${esc(msg)}<ul>
    <li>włącz przyspieszenie sprzętowe w ustawieniach przeglądarki,</li>
    <li>zaktualizuj przeglądarkę i sterowniki karty graficznej,</li>
    <li>spróbuj w Chrome, Firefox, Edge lub Safari na komputerze.</li></ul>`;
}

function init() {
  if (!TEST) loadAudio();                        // testy silnika nie potrzebują dźwięku
  for (const k of ['sens', 'invertY', 'fov', 'showTimer', 'showLegend']) APPLY[k]();
  if (engine.quality.ok()) {
    engineDefault.quality = engine.quality.get();
    applySetting('quality');
  }
  syncLevelHud();
  requestAnimationFrame(tick);

  if (TEST) {                                    // testy silnika: sam HUD, gra aktywna od razu
    setInGame(true);
    hide();
    return;
  }
  game.autoNext = false;                         // po ukończeniu poziomu pokazujemy ekran zamiast ładować następny
  const wantsLevel = params.get('level') || params.get('lvmod');
  const last = load(LAST_KEY, null);
  if (!wantsLevel && Number.isInteger(last) && last > 0 && last < levelCount()) game.loadLevel(last);
  setInGame(false);
  show('title');
}

window.ui = { show, hide, showIntro, pushToast, settings: () => S, stats, state: () => ({ screen, inGame }) };

if (!game) {
  // game.js nie zainicjował się (np. brak WebGL) – #err wypełnia już silnik; dopełniamy wskazówkami
  const err = $('err');
  if (err.style.display !== 'block') fatal('Nie udało się wczytać gry. Odśwież stronę lub użyj innej przeglądarki.');
  else fatal(err.textContent);
} else if (window.gameReady) init();
else ev.addEventListener('levelstart', init, { once: true });
