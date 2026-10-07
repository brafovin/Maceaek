// Dźwięk gry – cała synteza w Web Audio API (oscylatory, filtrowany szum, obwiednie), bez plików dźwiękowych.
// Opis API i listy dźwięków: docs/audio.md.
//
//   import { audio, gameAudio } from './audio.js';
//   audio.init();                    // przy pierwszym geście użytkownika
//   audio.play('shoot-blue', { pos: [x, y, z], volume: 0.8, rate: 1.1, delay: 0 });
//   audio.update(dt, { pos: [x, y, z], yaw, pitch, portals });   // co klatkę
//
// `gameAudio` to cienka warstwa „co zagrać przy zdarzeniach gry” – dzięki niej game.js ma tylko jednolinijkowe haczyki.
// Gdy AudioContext jest niedostępny lub zablokowany, wszystko jest cichym no-opem. W trybie ?test=1 dźwięk jest wyłączony.

const TEST = !!new URLSearchParams(location.search).get('test');

const KEY_VOLUME = 'maceaek.volume';
const KEY_MUTED = 'maceaek.muted';
const MAX_VOICES = 24;       // maks. równoczesnych głosów (efekty); ciche, mało ważne dźwięki mają niższy limit
const MAX_VOICES_LOW = 16;
const NOISE_SEC = 3;         // długość buforów szumu
const HUM_LEVEL = 0.05;      // głośność tła pomieszczenia (bardzo dyskretnie)
const PORTAL_LEVEL = 0.5;    // głośność szumu portalu z odległości odniesienia

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- ustawienia ----
let volume = 0.7;
let muted = false;
try {
  const v = parseFloat(localStorage.getItem(KEY_VOLUME));
  if (Number.isFinite(v)) volume = clamp(v, 0, 1);
  muted = localStorage.getItem(KEY_MUTED) === '1';
} catch { /* brak storage */ }

function store(key, val) {
  try { localStorage.setItem(key, val); } catch { /* ignoruj */ }
}

// ------------------------------------------------------------------ graf audio ----
let ctx = null;              // AudioContext (tworzony przy pierwszym geście)
let failed = false;          // tworzenie kontekstu się nie udało – nie próbuj ponownie
let master = null;           // GainNode: głośność użytkownika (za kompresorem)
let analyser = null;         // tylko do testów/diagnostyki (audio.debug)
let dryBus = null;           // wejście na dźwięki bezpośrednie
let sendBus = null;          // wejście pogłosu
let whiteBuf = null;         // szum biały (krótkie uderzenia)
let pinkBuf = null;          // szum różowy (pętle)
let voices = 0;              // aktywne głosy efektów
let quiet = 0;               // krótko po wczytaniu poziomu wyciszamy dźwięki mechanizmów (np. drzwi „startowo otwarte”)
let loops = null;            // pętle: hum + dwa portale
const lastPlay = Object.create(null);
const warned = new Set();

const masterTarget = () => (muted ? 0 : volume * volume);

// płynna zmiana głośności (po stronie audio, niezależnie od liczby klatek)
function applyMaster() {
  if (master) master.gain.setTargetAtTime(masterTarget(), ctx.currentTime, 0.03);
}

function setPannerPos(p, x, y, z) {
  if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; }
  else p.setPosition(x, y, z);
}

function makeNoise(seconds, pink) {
  const sr = ctx.sampleRate, n = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
  if (!pink) { for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return buf; }
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;    b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return buf;
}

// Syntetyczna odpowiedź impulsowa małej, „kosmicznej” sali: zanikający szum, z czasem coraz ciemniejszy.
function makeReverbIR(seconds) {
  const sr = ctx.sampleRate, n = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, n, sr);
  const pre = Math.floor(sr * 0.012);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      lp += ((Math.random() * 2 - 1) - lp) * (0.85 * (1 - t) + 0.1);
      d[i] = i < pre ? 0 : lp * Math.pow(1 - t, 2.4);
    }
  }
  return buf;
}

function build() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) throw new Error('brak AudioContext');
  ctx = new AC({ latencyHint: 'interactive' });

  const comp = ctx.createDynamicsCompressor();       // limiter na końcu toru
  comp.threshold.value = -12; comp.knee.value = 8; comp.ratio.value = 20;
  comp.attack.value = 0.002; comp.release.value = 0.15;

  master = ctx.createGain();
  master.gain.value = masterTarget();
  comp.connect(master);
  master.connect(ctx.destination);

  analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  master.connect(analyser);

  dryBus = ctx.createGain();
  dryBus.connect(comp);

  // pogłos: wysyłka -> górnoprzepustowy (bez dudnienia) -> splot -> powrót
  sendBus = ctx.createGain();
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 260;
  const conv = ctx.createConvolver();
  conv.buffer = makeReverbIR(1.7);
  const wetOut = ctx.createGain();
  wetOut.gain.value = 0.55;
  sendBus.connect(hp); hp.connect(conv); conv.connect(wetOut); wetOut.connect(comp);

  whiteBuf = makeNoise(NOISE_SEC, false);
  pinkBuf = makeNoise(4, true);
  loops = buildLoops(comp);
}

// ------------------------------------------------------------------ pętle ----
function loopSource() {
  const s = ctx.createBufferSource();
  s.buffer = pinkBuf; s.loop = true;
  s.start(0, Math.random() * 3);
  return s;
}

function lfo(freq, depth, target) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.value = freq; g.gain.value = depth;
  o.connect(g); g.connect(target);
  o.start();
  return o;
}

// Tło pomieszczenia (niski, lekko „oddychający” szum + dudnienie) i szum dwóch portali (źródła pozycyjne).
function buildLoops(dest) {
  // tło
  const hum = ctx.createGain();
  hum.gain.value = 0;
  hum.connect(dest);
  for (const [f, a] of [[55, 0.5], [55.7, 0.4], [110.4, 0.2]]) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = f; g.gain.value = a;
    o.connect(g); g.connect(hum);
    o.start();
  }
  const air = loopSource(), airHp = ctx.createBiquadFilter(), airLp = ctx.createBiquadFilter(), airG = ctx.createGain();
  airHp.type = 'highpass'; airHp.frequency.value = 140;
  airLp.type = 'lowpass'; airLp.frequency.value = 420; airLp.Q.value = 0.8;
  airG.gain.value = 0.9;
  air.connect(airHp); airHp.connect(airLp); airLp.connect(airG); airG.connect(hum);
  lfo(0.07, 160, airLp.frequency);                  // powolne „oddychanie” barwy
  lfo(0.11, HUM_LEVEL * 0.3, hum.gain);              // i głośności
  hum.gain.setValueAtTime(0, ctx.currentTime);
  hum.gain.linearRampToValueAtTime(HUM_LEVEL, ctx.currentTime + 2.5);

  // portale: niebieski jaśniejszy i szybszy, pomarańczowy niższy i wolniejszy
  const cfg = [
    { f: 950, q: 4, tone: 330, rate: 0.9 },
    { f: 540, q: 3, tone: 196, rate: 0.6 },
  ];
  const portal = cfg.map((c) => {
    const src = loopSource(), bp = ctx.createBiquadFilter(), ng = ctx.createGain();
    bp.type = 'bandpass'; bp.frequency.value = c.f; bp.Q.value = c.q;
    ng.gain.value = 3;
    src.connect(bp); bp.connect(ng);
    lfo(c.rate, c.f * 0.35, bp.frequency);          // wirowanie barwy
    const osc = ctx.createOscillator(), og = ctx.createGain();
    osc.frequency.value = c.tone; og.gain.value = 0.22;
    osc.connect(og);
    lfo(c.rate * 1.7, c.tone * 0.03, osc.frequency); // wibrato
    osc.start();
    const level = ctx.createGain();
    level.gain.value = 0;
    ng.connect(level); og.connect(level);
    const pan = ctx.createPanner();
    pan.panningModel = 'equalpower'; pan.distanceModel = 'inverse';
    pan.refDistance = 2; pan.rolloffFactor = 1.5; pan.maxDistance = 100;
    level.connect(pan); pan.connect(dest);
    return { level, pan, cur: 0, x: NaN, y: NaN, z: NaN };
  });
  return { hum, portal };
}

function updateLoops(dt, portals) {
  const k = 1 - Math.exp(-dt * 6);
  for (let i = 0; i < 2; i++) {
    const lp = loops.portal[i], P = portals && portals[i];
    const target = P && P.active ? (P.linked ? 1 : 0.55) : 0;
    if (lp.cur === target) continue;
    lp.cur += (target - lp.cur) * k;
    if (Math.abs(lp.cur - target) < 0.002) lp.cur = target;
    lp.level.gain.value = lp.cur * PORTAL_LEVEL;
  }
  for (let i = 0; i < 2; i++) {
    const lp = loops.portal[i], P = portals && portals[i];
    if (!P || !P.active) continue;
    const p = P.pos;
    if (p.x !== lp.x || p.y !== lp.y || p.z !== lp.z) {
      lp.x = p.x; lp.y = p.y; lp.z = p.z;
      setPannerPos(lp.pan, p.x, p.y, p.z);
    }
  }
}

// ------------------------------------------------------------------ głos ----
// Obwiednia: szybkie narastanie (a), opcjonalne podtrzymanie (hold), wykładniczy zanik do końca (dur).
function env(p, t, a, hold, dur, peak) {
  p.setValueAtTime(0.0001, t);
  p.linearRampToValueAtTime(peak, t + a);
  if (hold > 0) p.setValueAtTime(peak, t + a + hold);
  p.exponentialRampToValueAtTime(0.0001, t + dur);
}

// Jeden odtwarzany dźwięk: zbiór źródeł (oscylatory/szum) → wspólna głośność → (panner) → szyna.
class Voice {
  constructor(o) {
    this.t0 = ctx.currentTime + 0.004 + (o.delay > 0 ? o.delay : 0);
    this.rate = clamp(o.rate || 1, 0.5, 2);
    this.wet = 0.12;                  // ile sygnału idzie do pogłosu (recepta może zmienić)
    this.n = 0;                       // liczba niezakończonych źródeł
    this.send = null;
    this.in = ctx.createGain();
    this.in.gain.value = clamp(o.volume ?? 1, 0, 1.5);
    this.out = this.in;
    const p = o.pos;
    if (p) {
      const x = p[0] ?? p.x, y = p[1] ?? p.y, z = p[2] ?? p.z;
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        const pan = ctx.createPanner();
        pan.panningModel = 'equalpower'; pan.distanceModel = 'inverse';
        pan.refDistance = 3; pan.rolloffFactor = 1.1; pan.maxDistance = 100;
        setPannerPos(pan, x, y, z);
        this.in.connect(pan);
        this.out = pan;
      }
    }
    this.out.connect(dryBus);
    this.onEnd = () => { if (--this.n === 0) this.dispose(); };
    voices++;
  }

  // wołane po przygotowaniu źródeł: podłącza wysyłkę do pogłosu albo sprząta pusty głos
  seal() {
    if (this.n === 0) { this.dispose(); return; }
    if (this.wet > 0) {
      this.send = ctx.createGain();
      this.send.gain.value = this.wet;
      this.out.connect(this.send);
      this.send.connect(sendBus);
    }
  }

  dispose() {
    if (!this.in) return;
    this.in.disconnect();
    if (this.out !== this.in) this.out.disconnect();
    if (this.send) this.send.disconnect();
    this.in = null;
    voices--;
  }

  source(node, t, dur, offset) {
    node.start(t, offset);
    node.stop(t + dur + 0.03);
    node.onended = this.onEnd;
    this.n++;
  }

  // oscylator: f -> f2 (sweep wykładniczy w czasie `sweep`), lp = filtr dolnoprzepustowy, fm = [Hz, głębokość]
  tone(o) {
    const t = this.t0 + (o.t || 0), r = this.rate, dur = o.dur;
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    const f0 = o.f * r, f1 = (o.f2 || o.f) * r;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + (o.sweep || dur));
    const g = ctx.createGain();
    env(g.gain, t, o.a ?? 0.004, o.hold || 0, dur, o.peak ?? 0.3);
    if (o.lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = o.lp * r; f.Q.value = 0.7;
      osc.connect(f); f.connect(g);
    } else osc.connect(g);
    g.connect(this.in);
    if (o.fm) {
      const m = ctx.createOscillator(), mg = ctx.createGain();
      m.frequency.value = o.fm[0]; mg.gain.value = o.fm[1] * r;
      m.connect(mg); mg.connect(osc.frequency);
      this.source(m, t, dur);
    }
    this.source(osc, t, dur);
  }

  // szum filtrowany (type: bandpass/lowpass/highpass), f -> f2 – sweep częstotliwości środkowej
  noise(o) {
    const t = this.t0 + (o.t || 0), r = this.rate, dur = o.dur;
    const src = ctx.createBufferSource();
    src.buffer = whiteBuf; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'bandpass'; f.Q.value = o.q ?? 1;
    f.frequency.setValueAtTime(o.f * r, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2 * r, t + (o.sweep || dur));
    const g = ctx.createGain();
    env(g.gain, t, o.a ?? 0.004, o.hold || 0, dur, o.peak ?? 0.2);
    src.connect(f); f.connect(g); g.connect(this.in);
    this.source(src, t, dur, Math.random() * NOISE_SEC);
  }
}

// ----------------------------------------------------------- przepisy na dźwięki ----
function portalOpen(v, base) {
  v.wet = 0.4;
  v.tone({ f: base, f2: base * 4, sweep: 0.25, dur: 0.38, a: 0.03, peak: 0.28, fm: [7, base * 0.05] });
  v.tone({ type: 'triangle', f: base * 1.5, f2: base * 6, sweep: 0.25, t: 0.03, dur: 0.36, a: 0.03, peak: 0.12, lp: 3500 });
  v.noise({ f: base * 2, f2: base * 10, q: 1.5, dur: 0.35, a: 0.05, peak: 0.12 });
  v.tone({ f: base * 6, t: 0.18, dur: 0.6, a: 0.05, peak: 0.06 });
}

function note(v, f, t, dur, peak) {
  v.tone({ f, t, dur, a: 0.01, peak });
  v.tone({ type: 'triangle', f: f * 2, t, dur: dur * 0.6, a: 0.01, peak: peak * 0.3 });
}

const SOUNDS = {
  'shoot-blue'(v) {                                       // wysokie, jasne „pyknięcie” energii
    v.wet = 0.25;
    v.tone({ f: 1500, f2: 420, sweep: 0.12, dur: 0.2, peak: 0.34 });
    v.tone({ type: 'triangle', f: 750, f2: 210, sweep: 0.12, dur: 0.16, peak: 0.2 });
    v.tone({ f: 2400, f2: 3200, dur: 0.32, a: 0.02, peak: 0.07, lp: 4000 });
    v.noise({ f: 3500, f2: 900, q: 1.2, dur: 0.08, peak: 0.16 });
  },
  'shoot-orange'(v) {                                     // niższe, cieplejsze
    v.wet = 0.3;
    v.tone({ f: 640, f2: 150, sweep: 0.16, dur: 0.26, peak: 0.4 });
    v.tone({ type: 'triangle', f: 320, f2: 80, sweep: 0.16, dur: 0.22, peak: 0.3 });
    v.tone({ f: 1100, f2: 1500, dur: 0.34, a: 0.02, peak: 0.06, lp: 3000 });
    v.noise({ f: 1800, f2: 450, q: 1, dur: 0.11, peak: 0.2 });
  },
  'portal-open-blue'(v) { portalOpen(v, 200); },
  'portal-open-orange'(v) { portalOpen(v, 150); },
  'portal-close'(v) {
    v.wet = 0.3;
    v.tone({ f: 800, f2: 160, sweep: 0.22, dur: 0.3, peak: 0.26, lp: 2500 });
    v.noise({ type: 'lowpass', f: 3000, f2: 300, q: 0.8, dur: 0.28, peak: 0.18 });
    v.tone({ type: 'triangle', f: 90, f2: 50, dur: 0.2, peak: 0.2 });
  },
  'shot-fail'(v) {                                        // krótki buczek + trzask
    v.wet = 0.05;
    v.tone({ type: 'sawtooth', f: 130, f2: 70, dur: 0.2, a: 0.003, peak: 0.3, lp: 420 });
    v.noise({ type: 'highpass', f: 2200, q: 0.7, dur: 0.05, peak: 0.15 });
  },
  teleport(v) {                                           // świst; wysokość i siła z opts.rate / opts.volume
    v.wet = 0.35;
    v.noise({ f: 350, f2: 2600, q: 1.4, sweep: 0.2, dur: 0.32, a: 0.04, peak: 0.5 });
    v.noise({ f: 2600, f2: 500, q: 1.2, sweep: 0.3, t: 0.12, dur: 0.4, a: 0.02, peak: 0.35 });
    v.tone({ f: 260, f2: 1300, sweep: 0.22, dur: 0.3, a: 0.02, peak: 0.14, lp: 2500 });
    v.tone({ f: 90, f2: 40, dur: 0.25, peak: 0.35 });
  },
  jump(v) {
    v.wet = 0.05;
    v.noise({ f: 500, f2: 1000, q: 0.8, dur: 0.12, a: 0.015, peak: 0.1 });
    v.tone({ f: 170, f2: 250, dur: 0.1, peak: 0.1 });
  },
  land(v) {
    v.wet = 0.08;
    v.tone({ f: 130, f2: 45, dur: 0.2, peak: 0.55 });
    v.noise({ type: 'lowpass', f: 700, f2: 200, dur: 0.1, peak: 0.3 });
  },
  step(v) {
    v.wet = 0.06;
    const k = rnd(0.85, 1.15);
    v.noise({ f: 700 * k, f2: 260 * k, q: 1.1, dur: 0.075, peak: 0.22 });
    v.tone({ f: 105 * k, f2: 62 * k, dur: 0.09, peak: 0.2 });
  },
  'acid-splash'(v) {                                      // bulgot
    v.wet = 0.3;
    v.noise({ type: 'lowpass', f: 1100, f2: 250, q: 0.8, dur: 0.7, a: 0.01, peak: 0.4 });
    for (let i = 0; i < 7; i++) {
      const f = rnd(260, 780);
      v.tone({ f, f2: f * rnd(1.6, 2.6), t: rnd(0, 0.55), dur: rnd(0.07, 0.13), a: 0.006, peak: rnd(0.12, 0.22) });
    }
    v.noise({ type: 'highpass', f: 3500, q: 0.7, dur: 0.6, a: 0.05, peak: 0.07 });
    v.tone({ f: 110, f2: 55, dur: 0.5, peak: 0.3 });
  },
  'button-on'(v) {                                        // mechaniczny klik + sygnał
    v.wet = 0.15;
    v.noise({ f: 2600, q: 2, dur: 0.025, a: 0.001, peak: 0.35 });
    v.tone({ type: 'square', f: 160, f2: 90, dur: 0.04, peak: 0.12, lp: 600 });
    v.tone({ f: 880, t: 0.03, dur: 0.14, peak: 0.14 });
    v.tone({ f: 1320, t: 0.07, dur: 0.18, peak: 0.12 });
  },
  'button-off'(v) {
    v.wet = 0.15;
    v.noise({ f: 2000, q: 2, dur: 0.02, a: 0.001, peak: 0.25 });
    v.tone({ type: 'square', f: 110, f2: 70, dur: 0.04, peak: 0.1, lp: 500 });
    v.tone({ f: 660, t: 0.03, dur: 0.12, peak: 0.1 });
    v.tone({ f: 440, t: 0.07, dur: 0.16, peak: 0.1 });
  },
  'door-open'(v) {                                        // syk + silnik + stuk na końcu
    v.wet = 0.25;
    v.noise({ f: 5000, f2: 2500, q: 0.7, dur: 0.5, a: 0.02, peak: 0.22 });
    v.tone({ type: 'sawtooth', f: 60, f2: 110, sweep: 0.45, dur: 0.55, a: 0.05, peak: 0.18, lp: 260 });
    v.tone({ f: 85, f2: 55, t: 0.42, dur: 0.14, peak: 0.3 });
    v.noise({ type: 'lowpass', f: 800, t: 0.42, dur: 0.06, peak: 0.15 });
  },
  'door-close'(v) {
    v.wet = 0.25;
    v.noise({ f: 4000, f2: 5500, q: 0.7, dur: 0.35, a: 0.02, peak: 0.2 });
    v.tone({ type: 'sawtooth', f: 110, f2: 60, sweep: 0.3, dur: 0.4, a: 0.03, peak: 0.18, lp: 260 });
    v.tone({ f: 100, f2: 50, t: 0.3, dur: 0.18, peak: 0.4 });
    v.noise({ type: 'lowpass', f: 900, t: 0.3, dur: 0.08, peak: 0.22 });
  },
  'cube-pick'(v) {
    v.wet = 0.2;
    v.tone({ f: 300, f2: 620, sweep: 0.12, dur: 0.2, a: 0.01, peak: 0.28 });
    v.tone({ type: 'triangle', f: 900, f2: 1400, t: 0.04, dur: 0.14, peak: 0.1, lp: 3000 });
    v.noise({ f: 2000, q: 1.5, dur: 0.03, peak: 0.12 });
  },
  'cube-drop'(v) {
    v.wet = 0.12;
    v.tone({ f: 520, f2: 240, sweep: 0.1, dur: 0.16, peak: 0.28 });
    v.noise({ type: 'lowpass', f: 1200, f2: 300, dur: 0.06, peak: 0.2 });
  },
  'cube-throw'(v) {
    v.wet = 0.18;
    v.noise({ f: 600, f2: 1800, q: 1, dur: 0.18, a: 0.02, peak: 0.3 });
    v.tone({ f: 260, f2: 520, dur: 0.15, a: 0.01, peak: 0.15 });
  },
  'cube-hit'(v) {                                         // metaliczne „tonk”
    v.wet = 0.18;
    v.tone({ f: 170, f2: 110, sweep: 0.1, dur: 0.2, peak: 0.4 });
    v.tone({ f: 587, dur: 0.22, peak: 0.08 });
    v.tone({ f: 913, dur: 0.16, peak: 0.05 });
    v.tone({ f: 1480, dur: 0.1, peak: 0.03 });
    v.noise({ type: 'lowpass', f: 1500, f2: 400, dur: 0.05, peak: 0.25 });
  },
  'cube-reset'(v) {                                       // iskry
    v.wet = 0.35;
    for (let i = 0; i < 8; i++) {
      v.noise({ type: 'highpass', f: rnd(3000, 6000), q: 0.7, t: rnd(0, 0.22), dur: rnd(0.015, 0.035), a: 0.001, peak: rnd(0.15, 0.3) });
    }
    v.tone({ f: 1800, f2: 280, sweep: 0.25, dur: 0.3, a: 0.005, peak: 0.14, fm: [30, 200] });
    v.tone({ f: 420, f2: 840, t: 0.18, dur: 0.18, a: 0.01, peak: 0.1 });
  },
  fizzle(v) {                                             // elektryczny trzask
    v.wet = 0.3;
    for (let i = 0; i < 12; i++) {
      v.noise({ type: 'highpass', f: rnd(2500, 6000), q: 0.7, t: rnd(0, 0.4), dur: rnd(0.02, 0.05), a: 0.001, peak: rnd(0.15, 0.4) });
    }
    v.tone({ type: 'sawtooth', f: 100, f2: 70, dur: 0.4, a: 0.01, peak: 0.18, lp: 700, fm: [50, 40] });
    v.tone({ f: 1400, f2: 180, sweep: 0.3, dur: 0.35, peak: 0.16, fm: [22, 300] });
    v.noise({ f: 1800, q: 3, dur: 0.4, a: 0.01, peak: 0.1 });
  },
  'level-complete'(v) {                                   // C-E-G-C i akord
    v.wet = 0.5;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(v, f, i * 0.13, i === 3 ? 1.0 : 0.55, 0.22));
    note(v, 659.25, 0.39, 1.0, 0.08);
    note(v, 783.99, 0.39, 1.0, 0.08);
  },
  'ui-click'(v) {
    v.wet = 0.1;
    v.tone({ f: 1200, f2: 900, sweep: 0.04, dur: 0.07, peak: 0.18 });
    v.noise({ f: 3000, q: 2, dur: 0.015, peak: 0.08 });
  },
  'ui-hover'(v) {
    v.wet = 0.08;
    v.tone({ f: 1600, dur: 0.05, a: 0.01, peak: 0.05 });
  },
  'ui-back'(v) {
    v.wet = 0.1;
    v.tone({ f: 800, f2: 500, sweep: 0.08, dur: 0.1, peak: 0.15 });
  },
  pause(v) {
    v.wet = 0.3;
    v.tone({ type: 'triangle', f: 784, dur: 0.18, peak: 0.15, lp: 2500 });
    v.tone({ type: 'triangle', f: 523.25, t: 0.08, dur: 0.22, peak: 0.15, lp: 2500 });
  },
  resume(v) {
    v.wet = 0.3;
    v.tone({ type: 'triangle', f: 523.25, dur: 0.18, peak: 0.15, lp: 2500 });
    v.tone({ type: 'triangle', f: 784, t: 0.08, dur: 0.22, peak: 0.15, lp: 2500 });
  },
  hum() { /* tło gra od inicjalizacji – nazwa jest tylko po to, by play('hum') było poprawne */ },
};

const LOW_PRIORITY = new Set(['step', 'ui-hover', 'cube-hit', 'jump', 'land']);
const MIN_GAP = { step: 0.12, land: 0.12, 'cube-hit': 0.08, 'ui-hover': 0.04 };

// --------------------------------------------------------------------- API ----
const NO_OPTS = {};

export const audio = {
  init() {
    if (TEST || failed) return;
    try {
      if (!ctx) build();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch (e) {
      failed = true; ctx = null;
      console.warn('[audio] dźwięk niedostępny:', e.message || e);
    }
  },

  play(name, o = NO_OPTS) {
    const fn = SOUNDS[name];
    if (!fn) {
      if (!warned.has(name)) { warned.add(name); console.warn('[audio] nieznany dźwięk:', name); }
      return;
    }
    if (!ctx || muted || volume <= 0) return;
    if (ctx.state !== 'running') { ctx.resume().catch(() => {}); return; }
    if (voices >= (LOW_PRIORITY.has(name) ? MAX_VOICES_LOW : MAX_VOICES)) return;
    const now = ctx.currentTime;
    if (now - (lastPlay[name] ?? -1) < (MIN_GAP[name] ?? 0.015)) return;
    lastPlay[name] = now;
    let v;
    try {
      v = new Voice(o);
      fn(v);
      v.seal();
    } catch (e) {
      if (v) v.dispose();
      if (!warned.has(name)) { warned.add(name); console.warn('[audio] błąd dźwięku', name, e.message || e); }
    }
  },

  setVolume(v) {
    volume = clamp(Number(v) || 0, 0, 1);
    store(KEY_VOLUME, String(volume));
    applyMaster();
  },
  getVolume() { return volume; },
  setMuted(b) {
    muted = !!b;
    store(KEY_MUTED, muted ? '1' : '0');
    applyMaster();
  },
  isMuted() { return muted; },

  // listener = { pos:[x,y,z], yaw, pitch, portals? } – portals: tablica 2 portali { active, linked, pos:{x,y,z} }
  update(dt, L) {
    if (!ctx) return;
    quiet = Math.max(0, quiet - dt);
    if (!L) return;
    const p = L.pos, cp = Math.cos(clamp(L.pitch || 0, -1.4, 1.4)), yaw = L.yaw || 0;
    const fx = -Math.sin(yaw) * cp, fy = Math.sin(clamp(L.pitch || 0, -1.4, 1.4)), fz = -Math.cos(yaw) * cp;
    const l = ctx.listener;
    if (l.positionX) {
      l.positionX.value = p[0]; l.positionY.value = p[1]; l.positionZ.value = p[2];
      l.forwardX.value = fx; l.forwardY.value = fy; l.forwardZ.value = fz;
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else {
      l.setPosition(p[0], p[1], p[2]);
      l.setOrientation(fx, fy, fz, 0, 1, 0);
    }
    updateLoops(dt, L.portals);
  },

  get ready() { return !!ctx; },

  // diagnostyka (testy): stan kontekstu, liczba głosów, wzmocnienie mastera, szczyt sygnału, głośności pętli
  debug() {
    let peak = 0;
    if (analyser) {
      const d = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(d);
      for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    }
    return {
      state: ctx ? ctx.state : 'none',
      voices,
      master: master ? master.gain.value : 0,
      peak,
      portalLoops: loops ? loops.portal.map(p => p.level.gain.value) : [],
      names: Object.keys(SOUNDS),
    };
  },
};

// --------------------------------------------- dźwięki zdarzeń gry (haczyki z game.js) ----
const stepOpts = { volume: 0.6, rate: 1 };   // używane wielokrotnie – brak alokacji przy każdym kroku
let stepDist = 0;                            // przebyta droga od ostatniego kroku

export const gameAudio = {
  // co klatkę: pozycja/orientacja słuchacza z kamery, portale (szum) i update modułu
  frame(dt, camera, player, portals) {
    if (!ctx) return;
    const L = gameAudio.listener || (gameAudio.listener = { pos: [0, 0, 0], yaw: 0, pitch: 0, portals });
    L.pos[0] = camera.position.x; L.pos[1] = camera.position.y; L.pos[2] = camera.position.z;
    L.yaw = player.yaw; L.pitch = player.pitch;
    audio.update(dt, L);
  },

  // strzał: wywołuje fire(index) i dobiera dźwięki wg wyniku
  shoot(index, portals, fire) {
    const P = portals[index], had = P.active, ox = P.pos.x, oy = P.pos.y, oz = P.pos.z;
    const ok = fire(index);
    audio.play(index ? 'shoot-orange' : 'shoot-blue');
    if (!ok) audio.play('shot-fail', { delay: 0.04, volume: 0.8 });
    else {
      if (had) audio.play('portal-close', { pos: [ox, oy, oz], volume: 0.6, delay: 0.02 });
      audio.play(index ? 'portal-open-orange' : 'portal-open-blue', { pos: [P.pos.x, P.pos.y, P.pos.z], delay: 0.07 });
    }
    return ok;
  },

  // po fizyce: kroki i lądowanie (vyBefore = prędkość pionowa tuż przed ruchem)
  move(dt, pl, wasGround, vyBefore) {
    if (!ctx) return;
    if (!pl.onGround) { stepDist = 1.2; return; }
    if (!wasGround && vyBefore < -4.5) {
      audio.play('land', { volume: clamp((-vyBefore - 4) / 22 + 0.2, 0.2, 1), rate: clamp(1.1 - (-vyBefore) / 80, 0.7, 1.1) });
      stepDist = 0;
    }
    const sp = Math.hypot(pl.vel.x, pl.vel.z);
    if (sp <= 1) { stepDist = Math.max(stepDist, 1.2); return; }
    stepDist += sp * dt;
    if (stepDist >= 1.7 + sp * 0.07) {
      stepDist = 0;
      stepOpts.volume = 0.45 + 0.4 * Math.min(sp / 10, 1);
      stepOpts.rate = rnd(0.92, 1.1);
      audio.play('step', stepOpts);
    }
  },

  teleport(speed) {
    const k = Math.min(speed / 25, 1);
    audio.play('teleport', { volume: 0.4 + 0.6 * k, rate: 0.75 + 0.75 * k });
  },

  cubeTeleport(c) {
    audio.play('teleport', { pos: [c.pos.x, c.pos.y, c.pos.z], volume: 0.45, rate: 1.35 });
  },

  cubeHit(c, speed) {
    audio.play('cube-hit', { pos: [c.pos.x, c.pos.y - 0.4, c.pos.z], volume: clamp((speed - 2.5) / 14, 0.12, 1) });
  },

  cubeDrop(c) {
    audio.play('cube-drop', { volume: clamp(0.35 + c.vel.length() * 0.05, 0.35, 1) });
  },

  cubeReset(c) {
    audio.play('cube-reset', { pos: [c.pos.x, c.pos.y, c.pos.z] });
  },

  acid(x, y, z, volume = 1) {
    audio.play('acid-splash', { pos: [x, y, z], volume });
  },

  // zdarzenia mechanizmów z mechEvent(type, obj): przycisk (x,y,z), drzwi (box), fizzler (min/max)
  mech(type, obj) {
    if (!ctx) return;
    if (quiet > 0 && type.startsWith('door')) return;
    if (type.startsWith('button')) audio.play(type, { pos: [obj.x, obj.y + 0.05, obj.z] });
    else {
      const b = obj.box || obj;
      audio.play(type, { pos: [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2] });
    }
  },

  // wczytanie poziomu / restart (portals != null przy restarcie: jeśli były portale, słychać ich znikanie)
  levelStart(portals) {
    quiet = 0.4;
    if (portals && (portals[0].active || portals[1].active)) audio.play('portal-close', { volume: 0.6 });
  },
};
