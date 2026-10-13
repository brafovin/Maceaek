// Geräusche – alles live mit WebAudio erzeugt (keine Audiodateien).

export class Sfx {
  constructor(G) {
    this.G = G;
    this.ctx = null;
    this.volume = 0.7;
    this.muted = false;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 1.5;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // Sturm-Rauschen (läuft dauerhaft, Lautstärke wird geregelt)
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
    this.stormGain = this.ctx.createGain(); this.stormGain.gain.value = 0;
    src.connect(f).connect(this.stormGain).connect(this.master);
    src.start();
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = this.muted ? 0 : v; }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : this.volume; }

  storm(level) {
    if (!this.ctx) return;
    this.stormGain.gain.setTargetAtTime(level * 0.5, this.ctx.currentTime, 0.3);
  }

  // ---------- Bausteine ----------

  _out(vol, pan) {
    const g = this.ctx.createGain();
    g.gain.value = vol;
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p).connect(this.master);
    } else g.connect(this.master);
    return g;
  }

  _noise(out, { t = 0, dur = 0.2, type = 'lowpass', f = 2000, f2 = null, q = 0.7, vol = 1, attack = 0.002 }) {
    const c = this.ctx, now = c.currentTime + t;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const fl = c.createBiquadFilter();
    fl.type = type; fl.frequency.setValueAtTime(f, now); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, now + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    s.connect(fl).connect(g).connect(out);
    s.start(now, Math.random() * 0.5);
    s.stop(now + dur + 0.05);
  }

  _tone(out, { t = 0, dur = 0.2, type = 'sine', f = 440, f2 = null, vol = 0.5, attack = 0.003 }) {
    const c = this.ctx, now = c.currentTime + t;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, now);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, now + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g).connect(out);
    o.start(now);
    o.stop(now + dur + 0.05);
  }

  // Lautstärke und Stereo-Position relativ zur Kamera
  _spatial(pos) {
    const cam = this.G.camera;
    if (!pos || !cam) return [1, 0, 0];
    const dx = pos.x - cam.position.x, dy = pos.y - cam.position.y, dz = pos.z - cam.position.z;
    const d = Math.hypot(dx, dy, dz);
    const yaw = this.G.camYaw || 0;
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const pan = d > 0.5 ? (dx * rx + dz * rz) / d * 0.8 : 0;
    return [1 / (1 + d / 12), pan, d];
  }

  // ---------- Öffentliche Geräusche ----------

  play(name, vol = 1) { this.at(name, null, vol); }

  at(name, pos, vol = 1) {
    if (!this.ctx || this.muted) return;
    const [v, pan, d] = this._spatial(pos);
    const V = v * vol;
    if (V < 0.01) return;
    const o = this._out(V, pan);
    const far = d > 60;
    switch (name) {
      case 'equip': this._noise(o, { dur: 0.06, type: 'highpass', f: 2500, vol: 0.25 }); this._noise(o, { t: 0.07, dur: 0.05, type: 'highpass', f: 3000, vol: 0.2 }); break;
      case 'empty': this._tone(o, { dur: 0.04, type: 'square', f: 1600, vol: 0.12 }); break;
      case 'reload':
        this._noise(o, { dur: 0.05, type: 'bandpass', f: 1800, q: 3, vol: 0.4 });
        this._noise(o, { t: 0.35, dur: 0.06, type: 'bandpass', f: 1200, q: 3, vol: 0.45 });
        this._noise(o, { t: 0.7, dur: 0.05, type: 'bandpass', f: 2400, q: 3, vol: 0.35 });
        break;
      case 'swing': this._noise(o, { dur: 0.18, type: 'bandpass', f: 700, f2: 2500, q: 1.5, vol: 0.18, attack: 0.05 }); break;
      case 'pick-holz': this._tone(o, { dur: 0.12, type: 'triangle', f: 200, f2: 120, vol: 0.6 }); this._noise(o, { dur: 0.08, type: 'lowpass', f: 1500, vol: 0.5 }); break;
      case 'pick-stein': this._tone(o, { dur: 0.08, type: 'square', f: 420, f2: 300, vol: 0.18 }); this._noise(o, { dur: 0.1, type: 'highpass', f: 1800, vol: 0.5 }); break;
      case 'pick-metall': for (const [f, vv] of [[620, 0.3], [1310, 0.2], [2240, 0.12]]) this._tone(o, { dur: 0.45, f, vol: vv }); this._noise(o, { dur: 0.05, type: 'highpass', f: 3000, vol: 0.3 }); break;
      case 'break-holz': this._noise(o, { dur: 0.5, type: 'lowpass', f: 1200, f2: 200, vol: 0.8 }); this._tone(o, { dur: 0.3, type: 'triangle', f: 140, f2: 60, vol: 0.5 }); break;
      case 'break-stein': this._noise(o, { dur: 0.7, type: 'lowpass', f: 900, f2: 120, vol: 0.9 }); this._tone(o, { dur: 0.4, f: 80, f2: 40, vol: 0.6 }); break;
      case 'break-metall': this._noise(o, { dur: 0.6, type: 'bandpass', f: 1600, f2: 400, q: 2, vol: 0.8 }); for (const f of [520, 990]) this._tone(o, { dur: 0.6, f, f2: f * 0.7, vol: 0.2 }); break;
      case 'build': this._noise(o, { dur: 0.15, type: 'lowpass', f: 700, vol: 0.6 }); this._tone(o, { dur: 0.12, type: 'triangle', f: 160, f2: 90, vol: 0.4 }); break;
      case 'chest':
        [1047, 1319, 1568, 2093].forEach((f, i) => this._tone(o, { t: i * 0.07, dur: 0.35, type: 'triangle', f, vol: 0.28 }));
        this._noise(o, { dur: 0.5, type: 'highpass', f: 5000, vol: 0.15, attack: 0.1 });
        break;
      case 'pickup': this._tone(o, { dur: 0.1, type: 'triangle', f: 880, f2: 1320, vol: 0.25 }); break;
      case 'hit': this._tone(o, { dur: 0.05, f: 1900, vol: 0.25 }); break;
      case 'headshot': this._tone(o, { dur: 0.09, f: 2600, vol: 0.3 }); this._tone(o, { t: 0.03, dur: 0.12, f: 1300, vol: 0.25 }); break;
      case 'hurt': this._noise(o, { dur: 0.15, type: 'lowpass', f: 500, vol: 0.5 }); this._tone(o, { dur: 0.15, type: 'sawtooth', f: 160, f2: 90, vol: 0.15 }); break;
      case 'elim': this._tone(o, { dur: 0.25, type: 'triangle', f: 660, f2: 1320, vol: 0.3 }); this._noise(o, { dur: 0.4, type: 'highpass', f: 4000, vol: 0.2, attack: 0.05 }); break;
      case 'kill': this._tone(o, { dur: 0.12, f: 1320, vol: 0.3 }); this._tone(o, { t: 0.1, dur: 0.25, f: 1760, vol: 0.3 }); break;
      case 'explosion':
        this._noise(o, { dur: far ? 1.6 : 1.3, type: 'lowpass', f: far ? 300 : 900, f2: 80, vol: 1.2, attack: 0.005 });
        this._tone(o, { dur: 0.8, f: 70, f2: 30, vol: 0.9 });
        break;
      case 'jump': this._noise(o, { dur: 0.08, type: 'lowpass', f: 600, vol: 0.2 }); break;
      case 'land': this._noise(o, { dur: 0.12, type: 'lowpass', f: 400, vol: 0.5 }); break;
      case 'use': this._noise(o, { dur: 0.25, type: 'bandpass', f: 1200, q: 0.8, vol: 0.2, attack: 0.08 }); break;
      case 'healed': this._tone(o, { dur: 0.3, type: 'triangle', f: 880, f2: 1760, vol: 0.25 }); break;
      case 'glider': this._noise(o, { dur: 0.5, type: 'bandpass', f: 400, f2: 1200, q: 1, vol: 0.4, attack: 0.05 }); break;
      case 'horn': this._tone(o, { dur: 0.5, type: 'sawtooth', f: 330, vol: 0.18 }); this._tone(o, { dur: 0.5, type: 'sawtooth', f: 415, vol: 0.14 }); break;
      case 'zone': [523, 392, 523, 392].forEach((f, i) => this._tone(o, { t: i * 0.22, dur: 0.2, type: 'square', f, vol: 0.12 })); break;
      case 'win': [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this._tone(o, { t: i * 0.13, dur: 0.3, type: 'triangle', f, vol: 0.3 })); break;
      case 'lose': [392, 330, 262].forEach((f, i) => this._tone(o, { t: i * 0.25, dur: 0.4, type: 'triangle', f, vol: 0.3 })); break;
      case 'click': this._tone(o, { dur: 0.03, type: 'square', f: 1200, vol: 0.1 }); break;
      case 'step': this._noise(o, { dur: 0.07, type: 'bandpass', f: 380 + Math.random() * 200, q: 1.2, vol: 0.5 }); break;
      case 'wade': this._noise(o, { dur: 0.22, type: 'bandpass', f: 900 + Math.random() * 400, q: 0.8, vol: 0.35, attack: 0.03 }); break;
      case 'swim': this._noise(o, { dur: 0.35, type: 'lowpass', f: 700, f2: 300, vol: 0.4, attack: 0.08 }); break;
      case 'splash': this._noise(o, { dur: 0.6, type: 'bandpass', f: 1400, f2: 400, q: 0.7, vol: 0.9, attack: 0.01 }); this._noise(o, { dur: 0.3, type: 'lowpass', f: 300, vol: 0.5 }); break;
      case 'slide': this._noise(o, { dur: 0.7, type: 'bandpass', f: 500, f2: 200, q: 0.6, vol: 0.5, attack: 0.03 }); break;
      case 'edit': this._tone(o, { dur: 0.06, type: 'square', f: 700, vol: 0.12 }); this._tone(o, { t: 0.06, dur: 0.1, type: 'square', f: 1050, vol: 0.12 }); break;
    }
  }

  // Schritte: Sprinten laut, Gehen leiser, Schwimmen platscht; geduckt wird gar nicht aufgerufen
  step(a, speed) {
    if (!this.ctx || this.muted) return;
    const cam = this.G.camera;
    if (!cam || a.pos.distanceToSquared(cam.position) > 40 * 40) return;
    const kind = a.swimming ? 'swim' : a.wading ? 'wade' : 'step';
    const v = (speed > 7 ? 1 : 0.55) * (a.isPlayer ? 0.35 : 0.9);
    this.at(kind, a.pos, v);
  }

  // Schussgeräusch je Waffe; entfernte Schüsse dumpfer
  shot(kind, pos, own) {
    if (!this.ctx || this.muted) return;
    const [v, pan, d] = own ? [1, 0, 0] : this._spatial(pos);
    const V = v * (own ? 0.8 : 1.1);
    if (V < 0.01) return;
    const o = this._out(V, pan);
    const dull = Math.max(0.15, 1 - d / 140);
    const P = {
      pistol:  { f: 2600, dur: 0.14, thump: 140, tv: 0.5, nv: 0.8 },
      smg:     { f: 3200, dur: 0.09, thump: 160, tv: 0.35, nv: 0.6 },
      ar:      { f: 2200, dur: 0.18, thump: 110, tv: 0.6, nv: 0.9 },
      shotgun: { f: 1400, dur: 0.38, thump: 70, tv: 0.9, nv: 1.1 },
      sniper:  { f: 1800, dur: 0.7, thump: 60, tv: 1.0, nv: 1.1 },
      rocket:  { f: 900, dur: 0.6, thump: 90, tv: 0.6, nv: 0.8 },
    }[kind] || { f: 2000, dur: 0.15, thump: 120, tv: 0.5, nv: 0.8 };
    this._noise(o, { dur: P.dur, type: 'lowpass', f: P.f * dull, f2: 200, vol: P.nv });
    this._tone(o, { dur: P.dur * 0.7, f: P.thump, f2: P.thump * 0.4, vol: P.tv });
    if (kind === 'sniper') this._noise(o, { t: 0.05, dur: 0.9, type: 'bandpass', f: 500, q: 0.6, vol: 0.4 * dull });
    if (kind === 'rocket') this._noise(o, { dur: 0.8, type: 'bandpass', f: 600, f2: 2000, q: 1, vol: 0.5, attack: 0.05 });
  }
}
