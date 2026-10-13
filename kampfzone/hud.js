// HUD: Leben (unten links), Inventar mit Spitzhacke + 6 Plätzen (unten rechts), Minikarte, Zone,
// Abschussliste, Schadenszahlen, Trefferanzeige und die Menüs.

import { fmtTime, HALF } from './util.js';
import { iconFor, RARITY, WEAPONS, HEALS, itemName, itemRarity } from './items.js';
import { current, SLOTS } from './inventory.js';
import { MAT_ORDER, KIND_LABEL, BUILD_MATS } from './pieces.js';
import { ROADS, PLACES } from './map.js';
import { LAKES, RIVERS } from './terrain.js';
import * as THREE from '../vendor/three.module.js';

const $ = id => document.getElementById(id);
const _v = new THREE.Vector3();

const MAT_ICON = {
  holz: '<svg viewBox="0 0 24 24"><path d="M3 8h18v3H3zM3 13h18v3H3z" fill="currentColor"/></svg>',
  stein: '<svg viewBox="0 0 24 24"><path d="M3 6h8v5H3zM13 6h8v5h-8zM7 13h8v5H7z" fill="currentColor"/></svg>',
  metall: '<svg viewBox="0 0 24 24"><path d="M4 5h16v14H4z" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M8 5v14M12 5v14M16 5v14" stroke="currentColor" stroke-width="1.5"/></svg>',
};
const PIECE_ICON = {
  wall: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" fill="currentColor"/></svg>',
  floor: '<svg viewBox="0 0 24 24"><path d="M2 15 L12 10 L22 15 L12 20 Z" fill="currentColor"/></svg>',
  ramp: '<svg viewBox="0 0 24 24"><path d="M3 20 L21 4 L21 20 Z" fill="currentColor"/></svg>',
};

export class Hud {
  constructor(G) {
    this.G = G;
    this.slotEls = [];
    const slots = $('slots');
    for (let i = 0; i <= SLOTS; i++) {
      const el = document.createElement('div');
      el.className = 'slot';
      el.innerHTML = `<kbd>${i + 1}</kbd><div class="ic"></div><span class="cnt"></span>`;
      el.addEventListener('mousedown', e => { e.stopPropagation(); });
      slots.appendChild(el);
      this.slotEls.push(el);
    }
    this.matEls = {};
    for (const m of MAT_ORDER) {
      const el = document.createElement('div');
      el.className = 'mat';
      el.dataset.m = m;
      el.innerHTML = `${MAT_ICON[m]}<b>0</b>`;
      $('mats').appendChild(el);
      this.matEls[m] = el;
    }
    this.pieceEls = {};
    for (const [k, key] of [['wall', 'Q'], ['floor', 'F'], ['ramp', 'C']]) {
      const el = document.createElement('div');
      el.className = 'piece';
      el.innerHTML = `<kbd>${key}</kbd>${PIECE_ICON[k]}<span>${KIND_LABEL[k]}</span>`;
      $('buildbar').insertBefore(el, $('buildmat'));
      this.pieceEls[k] = el;
    }
    this.sig = '';
    this.mini = $('minimap').getContext('2d');
    this.big = $('bigmap').getContext('2d');
    this.miniT = 0;
    this.noticeT = 0;
    this.pieceT = 0;
    this.hitT = 0;
    this.hurtT = 0;
  }

  // ---------- Kartenbild (einmal pro Spiel) ----------

  buildMap(info) {
    const S = 2, N = HALF * 2 * S;
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const x = c.getContext('2d');
    const P = v => (v + HALF) * S;
    x.fillStyle = '#5b8f3f'; x.fillRect(0, 0, N, N);
    for (let i = 0; i < 260; i++) { x.fillStyle = 'rgba(70,120,45,0.35)'; x.beginPath(); x.arc(Math.random() * N, Math.random() * N, 6 + Math.random() * 18, 0, 7); x.fill(); }
    x.fillStyle = '#2f6a2f';
    for (const [tx, tz] of info.trees) { x.beginPath(); x.arc(P(tx), P(tz), 3.2, 0, 7); x.fill(); }
    x.fillStyle = '#8b8a85';
    for (const [rx, rz] of info.rocks) { x.beginPath(); x.arc(P(rx), P(rz), 3.5, 0, 7); x.fill(); }
    // Seen, Fluss, Insel
    x.lineCap = 'round'; x.lineJoin = 'round';
    for (const R of RIVERS) {
      x.strokeStyle = '#d8c48c'; x.lineWidth = (R.w + 2) * 2 * S;
      x.beginPath(); R.pts.forEach(([px, pz], i) => i ? x.lineTo(P(px), P(pz)) : x.moveTo(P(px), P(pz))); x.stroke();
    }
    for (const L of LAKES) { x.fillStyle = '#d8c48c'; x.beginPath(); x.arc(P(L.x), P(L.z), (L.r + 2) * S, 0, 7); x.fill(); }
    for (const R of RIVERS) {
      x.strokeStyle = '#3f86c4'; x.lineWidth = R.w * 2 * S;
      x.beginPath(); R.pts.forEach(([px, pz], i) => i ? x.lineTo(P(px), P(pz)) : x.moveTo(P(px), P(pz))); x.stroke();
    }
    for (const L of LAKES) {
      x.fillStyle = '#3f86c4'; x.beginPath(); x.arc(P(L.x), P(L.z), L.r * S, 0, 7); x.fill();
      if (L.island) {
        x.fillStyle = '#d8c48c'; x.beginPath(); x.arc(P(L.island.x), P(L.island.z), L.island.r * S, 0, 7); x.fill();
        x.fillStyle = '#5b8f3f'; x.beginPath(); x.arc(P(L.island.x), P(L.island.z), (L.island.r - 2) * S, 0, 7); x.fill();
      }
    }
    x.fillStyle = '#4a4d52';
    for (const [x0, z0, x1, z1] of info.roads || []) x.fillRect(P(x0), P(z0), (x1 - x0) * S, (z1 - z0) * S);
    // Stadt
    x.fillStyle = '#b8b3a8'; x.fillRect(P(-72), P(-72), 144 * S, 144 * S);
    x.fillStyle = '#4a4d52';
    for (const r of ROADS) { x.fillRect(P(r - 4), P(-68), 8 * S, 136 * S); x.fillRect(P(-68), P(r - 4), 136 * S, 8 * S); }
    x.fillStyle = '#d9d2c3';
    for (const [x0, z0, x1, z1] of [[-56, -56, -8, -8], [8, -56, 56, -8], [-56, 8, -8, 56], [8, 8, 56, 56]]) x.fillRect(P(x0), P(z0), (x1 - x0) * S, (z1 - z0) * S);
    const col = { office: '#7e9ab3', brick: '#b5603f', plaster: '#e8d9b8', wood: '#9a6a3f' };
    for (const [x0, z0, x1, z1, st] of info.buildings) {
      x.fillStyle = col[st] || '#999'; x.fillRect(P(x0), P(z0), (x1 - x0) * S, (z1 - z0) * S);
      x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 2; x.strokeRect(P(x0), P(z0), (x1 - x0) * S, (z1 - z0) * S);
    }
    if (info.church) {
      const [x0, z0, x1, z1] = info.church;
      x.fillStyle = '#cfc3a5'; x.fillRect(P(x0), P(z0), (x1 - x0) * S, (z1 - z0) * S);
      x.strokeStyle = 'rgba(0,0,0,0.4)'; x.strokeRect(P(x0), P(z0), (x1 - x0) * S, (z1 - z0) * S);
      x.fillStyle = '#7a5a20';
      x.fillRect(P(25.4), P(13), 1.2 * S, 6 * S); x.fillRect(P(24), P(14.6), 4 * S, 1.2 * S);
    }
    x.fillStyle = '#4b8fc7'; x.beginPath(); x.arc(P(46), P(30), 3.3 * S, 0, 7); x.fill();
    x.font = 'bold 22px system-ui, sans-serif'; x.fillStyle = 'rgba(255,255,255,0.85)'; x.textAlign = 'center';
    for (const pl of PLACES) {
      x.lineWidth = 4; x.strokeStyle = 'rgba(0,0,0,0.45)'; x.strokeText(pl.name.toUpperCase(), P(pl.x), P(pl.z));
      x.fillText(pl.name.toUpperCase(), P(pl.x), P(pl.z));
    }
    // Leuchtturm
    x.fillStyle = '#c7302a'; x.beginPath(); x.arc(P(113), P(98), 5, 0, 7); x.fill();
    this.mapImg = c;
  }

  // ---------- pro Bild ----------

  update(dt) {
    const G = this.G, p = G.player;
    if (!p) return;
    // Leben und Schild
    $('hpFill').style.width = Math.max(0, p.hp) + '%';
    $('hpNum').textContent = Math.ceil(Math.max(0, p.hp));
    $('shFill').style.width = Math.max(0, p.shield) + '%';
    $('shNum').textContent = Math.ceil(Math.max(0, p.shield));
    $('vitals').classList.toggle('low', p.hp < 30);
    // Inventar (nur bei Änderung neu zeichnen)
    const inv = p.inv;
    const sig = inv.sel + '|' + inv.slots.map(s => s ? `${s.k}${s.id}${s.r ?? ''}:${s.mag ?? s.n}` : '-').join(',') + '|' + MAT_ORDER.map(m => inv.mats[m]).join(',') + '|' + G.buildMat + (G.buildMode ? G.buildKind : '') + '|' + Object.values(inv.ammo).join(',');
    if (sig !== this.sig) { this.sig = sig; this.drawInventory(); }
    const cur = current(inv);
    // Nachladen / Heilen
    const ub = $('useBar');
    if (p.reloadT > 0 || p.useT > 0) {
      const tot = p.reloadT > 0 ? p.reloadDur : p.useDur, rem = p.reloadT > 0 ? p.reloadT : p.useT;
      ub.hidden = false;
      ub.querySelector('div').style.width = (100 * (1 - rem / tot)) + '%';
      ub.querySelector('span').textContent = (p.reloadT > 0 ? 'Nachladen ' : (HEALS[p.useItem.id].name + ' ')) + rem.toFixed(1) + ' s';
    } else ub.hidden = true;
    // Zone
    const z = G.zone.info();
    if (z) {
      $('zoneLabel').textContent = z.label;
      $('zoneTime').textContent = z.t > 0 ? fmtTime(z.t) : '';
      $('zoneinfo').classList.toggle('shrink', z.shrinking);
      $('zonePhase').textContent = z.phase;
    }
    $('alive').textContent = G.actors.filter(a => a.alive).length;
    $('kills').textContent = p.kills;
    // Fadenkreuz: Streuung anzeigen
    const W = cur && cur.k === 'w' ? WEAPONS[cur.id] : null;
    const aiming = G.aiming;
    let spread = W ? (aiming ? W.aimSpread : W.spread) + p.bloom + (Math.hypot(p.vel.x, p.vel.z) > 1.2 ? 0.01 : 0) : 0;
    const px = 6 + spread * (window.innerHeight / (2 * Math.tan(G.camera.fov * Math.PI / 360)));
    const ch = $('crosshair');
    ch.style.setProperty('--gap', Math.min(80, px).toFixed(1) + 'px');
    ch.dataset.mode = G.buildMode || G.editing ? 'build' : cur === 'pickaxe' ? 'pick' : W && W.pellets ? 'shotgun' : 'gun';
    ch.hidden = !!G.scoped || !p.alive || p.state === 'bus' || p.state === 'car';
    $('scope').hidden = !G.scoped;
    // Aufforderung (E)
    const pr = $('prompt');
    // Fahrzeug
    const v = p.state === 'car' ? p.vehicle : null;
    $('carHud').hidden = !v;
    if (v) {
      $('carSpeed').textContent = Math.round(Math.abs(v.speed) * 3.6);
      $('carHp').style.width = Math.max(0, 100 * v.pc.hp / v.pc.maxHp) + '%';
      $('carName').textContent = v.T.name;
    }
    if (v && p.alive) {
      pr.innerHTML = '<kbd>W</kbd><kbd>S</kbd> Gas/Bremse · <kbd>A</kbd><kbd>D</kbd> Lenken · <kbd>Leertaste</kbd> Handbremse · <kbd>H</kbd> Hupe · <kbd>E</kbd> Aussteigen';
      pr.hidden = false;
    } else if (G.carNear && p.alive && !(G.interact && G.interactD <= G.carNearD)) {
      pr.innerHTML = `<kbd>E</kbd> Einsteigen: <b>${G.carNear.T.name}</b>`;
      pr.hidden = false;
    } else if (G.interact && p.alive) {
      const t = G.interact;
      if (t.chest) pr.innerHTML = '<kbd>E</kbd> Truhe öffnen';
      else {
        const it = t.pickup.item, r = itemRarity(it);
        const full = (it.k === 'w' || it.k === 'h') && !inv.slots.includes(null) && !(it.k === 'h' && inv.slots.some(s => s && s.k === 'h' && s.id === it.id && s.n < HEALS[it.id].stack));
        const extra = it.n ? ` ×${it.n}` : '';
        pr.innerHTML = `<kbd>E</kbd> ${full && inv.sel > 0 ? 'Tauschen' : 'Aufheben'}: <b style="color:${RARITY[r].color}">${itemName(it)}${extra}</b>` + (it.k === 'w' ? ` <small>${RARITY[r].name}</small>` : '');
      }
      pr.hidden = false;
    } else if (G.editing) {
      const k = G.editing.pc.meta.kind;
      pr.innerHTML = (k === 'ramp' ? '<kbd>LMT</kbd> Rampe drehen' : '<kbd>LMT</kbd> Kacheln wählen (ziehen)') + ' · <kbd>RMT</kbd> zurücksetzen · <kbd>G</kbd> bestätigen';
      pr.hidden = false;
    } else if (p.state === 'bus') {
      const wait = G.bus.doors - G.bus.t;
      pr.innerHTML = (wait > 0 ? `Türen öffnen in <b>${Math.ceil(wait)}</b>` : '<kbd>Leertaste</kbd> Abspringen') + ` · <kbd>V</kbd> Ansicht: ${G.busView}`;
      pr.hidden = false;
    } else if (G.editHint && !G.buildMode && p.alive) {
      pr.innerHTML = `<kbd>G</kbd> ${G.editHint.name} bearbeiten`;
      pr.hidden = false;
    } else if (p.state === 'fall') {
      pr.innerHTML = '<kbd>Leertaste</kbd> Gleiter öffnen';
      pr.hidden = false;
    } else pr.hidden = true;
    // Haltung (Sprinten, Schleichen, Rutschen, Schwimmen)
    const sprinting = (G.keys.ShiftLeft || G.keys.ShiftRight) && !p.crouch && p.state === 'ground' && Math.hypot(p.vel.x, p.vel.z) > 6.5;
    const stance = !p.alive || p.state !== 'ground' ? '' : p.swimming ? 'Schwimmen' : p.slideT > 0 ? 'Rutschen' : p.crouch ? 'Schleichen' : sprinting ? 'Sprinten' : p.wading ? 'Waten' : '';
    const se = $('stance');
    if (se.dataset.s !== stance) { se.dataset.s = stance; se.textContent = stance; se.hidden = !stance; }
    // Bau-Leiste
    $('buildbar').hidden = !G.buildMode;
    document.body.classList.toggle('building', G.buildMode);
    // Sturm-Überlagerung
    const out = G.zone.active && p.alive && p.state !== 'bus' && !G.zone.inside(p.pos.x, p.pos.z);
    $('storm').classList.toggle('on', out);
    // Zeitgesteuerte Dinge
    if (this.noticeT > 0) { this.noticeT -= dt; if (this.noticeT <= 0) $('notice').classList.remove('show'); }
    if (this.pieceT > 0) { this.pieceT -= dt; if (this.pieceT <= 0) $('pieceHp').hidden = true; }
    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) $('hitmarker').className = ''; }
    if (this.hurtT > 0) { this.hurtT -= dt; $('hurt').style.opacity = Math.max(0, this.hurtT / 0.6); }
    this.miniT -= dt;
    if (this.miniT <= 0) { this.miniT = 0.08; this.drawMinimap(); }
  }

  drawInventory() {
    const G = this.G, inv = G.player.inv;
    this.slotEls.forEach((el, i) => {
      const it = i === 0 ? 'pickaxe' : inv.slots[i - 1];
      el.classList.toggle('sel', inv.sel === i && !G.buildMode);
      el.classList.toggle('empty', !it);
      const r = it && it !== 'pickaxe' ? itemRarity(it) : -1;
      el.style.setProperty('--rc', r >= 0 ? RARITY[r].color : '#8fa3b8');
      el.querySelector('.ic').innerHTML = iconFor(it);
      el.querySelector('.cnt').textContent = it && it !== 'pickaxe' ? (it.k === 'w' ? it.mag : it.n) : '';
    });
    for (const m of MAT_ORDER) {
      this.matEls[m].querySelector('b').textContent = inv.mats[m];
      this.matEls[m].classList.toggle('sel', G.buildMat === m);
    }
    const cur = current(inv);
    const al = $('ammoLine');
    if (cur && cur !== 'pickaxe' && cur.k === 'w') {
      const W = WEAPONS[cur.id];
      al.innerHTML = `<b>${cur.mag}</b><span>/ ${inv.ammo[W.ammo]}</span>`;
      al.hidden = false;
    } else al.hidden = true;
    const nm = $('itemName');
    if (G.buildMode) nm.textContent = '';
    else if (cur === 'pickaxe') { nm.textContent = 'Spitzhacke'; nm.style.color = '#cfe0f0'; }
    else if (cur) { nm.textContent = itemName(cur) + (cur.k === 'h' ? ` (${cur.n})` : ''); nm.style.color = RARITY[itemRarity(cur)].color; }
    else nm.textContent = '';
    for (const k in this.pieceEls) this.pieceEls[k].classList.toggle('sel', G.buildKind === k);
    $('buildmat').innerHTML = `<kbd>R</kbd> / <kbd>RMT</kbd> ${MAT_ICON[G.buildMat]}<span>${BUILD_MATS[G.buildMat].name} (${inv.mats[G.buildMat]})</span><small><kbd>G</kbd> Bearbeiten</small>`;
  }

  drawMinimap() {
    const G = this.G, p = G.player, Z = G.zone;
    if (!this.mapImg || !p) return;
    const c = this.mini, W = c.canvas.width;
    const R = 60;                                   // sichtbarer Radius in Metern
    const cx = p.state === 'bus' ? G.bus.pos.x : p.pos.x, cz = p.state === 'bus' ? G.bus.pos.z : p.pos.z;
    const k = W / (2 * R);
    c.save();
    c.fillStyle = '#3d6a2c'; c.fillRect(0, 0, W, W);
    c.drawImage(this.mapImg, (cx - R + HALF) * 2, (cz - R + HALF) * 2, R * 4, R * 4, 0, 0, W, W);
    const M = (x, z) => [(x - cx) * k + W / 2, (z - cz) * k + W / 2];
    this.drawZone(c, M, k, W);
    this.drawCars(c, M, 1);
    if (p.state === 'bus') this.drawBus(c, M);
    // Spieler-Pfeil
    c.translate(W / 2, W / 2);
    c.rotate(-p.yaw);
    c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(0, -8); c.lineTo(6, 6); c.lineTo(0, 3); c.lineTo(-6, 6); c.closePath(); c.fill(); c.stroke();
    c.restore();
    // große Karte
    if (G.bigMap) {
      const b = this.big, BW = b.canvas.width, bk = BW / (HALF * 2);
      b.drawImage(this.mapImg, 0, 0, BW, BW);
      const BM = (x, z) => [(x + HALF) * bk, (z + HALF) * bk];
      this.drawZone(b, BM, bk, BW);
      this.drawCars(b, BM, 0.8);
      if (p.state === 'bus') this.drawBus(b, BM);
      const [px, pz] = BM(p.pos.x, p.pos.z);
      b.save(); b.translate(px, pz); b.rotate(-p.yaw);
      b.fillStyle = '#ffeb3b'; b.strokeStyle = '#000'; b.lineWidth = 2;
      b.beginPath(); b.moveTo(0, -11); b.lineTo(8, 8); b.lineTo(0, 4); b.lineTo(-8, 8); b.closePath(); b.fill(); b.stroke();
      b.restore();
    }
    void Z;
  }

  drawZone(c, M, k, W) {
    const Z = this.G.zone;
    if (!Z.active) return;
    const [zx, zz] = M(Z.cx, Z.cz);
    c.save();
    c.beginPath(); c.rect(0, 0, W, W); c.arc(zx, zz, Math.max(0, Z.r * k), 0, Math.PI * 2, true);
    c.fillStyle = 'rgba(120,40,190,0.42)'; c.fill('evenodd');
    c.beginPath(); c.arc(zx, zz, Math.max(0, Z.r * k), 0, Math.PI * 2);
    c.strokeStyle = '#c77dff'; c.lineWidth = 2; c.stroke();
    if (Z.mode !== 'done') {
      const [nx, nz] = M(Z.tx, Z.tz);
      c.beginPath(); c.arc(nx, nz, Math.max(1, Z.tr * k), 0, Math.PI * 2);
      c.strokeStyle = '#fff'; c.lineWidth = 2; c.setLineDash([6, 4]); c.stroke(); c.setLineDash([]);
    }
    c.restore();
  }

  // fahrbare Fahrzeuge als kleine Autosymbole
  drawCars(c, M, s) {
    for (const v of this.G.vehicles.list) {
      if (v.dead || v.sink > 0) continue;
      const [x, z] = M(v.pos.x, v.pos.z);
      c.save();
      c.translate(x, z); c.rotate(-v.yaw); c.scale(s, s);
      c.fillStyle = v.type === 'traktor' ? '#7bd36b' : v.driver ? '#ffb74d' : '#ffffff';
      c.strokeStyle = '#111'; c.lineWidth = 1.2;
      c.beginPath(); c.roundRect(-3, -5.5, 6, 11, 2); c.fill(); c.stroke();
      c.fillStyle = '#1b2833'; c.fillRect(-2, -3, 4, 2.4);
      c.restore();
    }
  }

  drawBus(c, M) {
    const B = this.G.bus;
    const [x0, z0] = M(B.start.x, B.start.z);
    const [x1, z1] = M(B.start.x + B.dir.x * B.speed * B.dur, B.start.z + B.dir.z * B.speed * B.dur);
    c.save();
    c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 2; c.setLineDash([4, 4]);
    c.beginPath(); c.moveTo(x0, z0); c.lineTo(x1, z1); c.stroke();
    const [bx, bz] = M(B.pos.x, B.pos.z);
    c.fillStyle = '#2f7fd6'; c.beginPath(); c.arc(bx, bz, 5, 0, 7); c.fill();
    c.restore();
  }

  // ---------- Ereignisse ----------

  notice(text, kind = 'info', time = 2.6) {
    const n = $('notice');
    n.textContent = text;
    n.dataset.kind = kind;
    n.classList.remove('show');
    void n.offsetWidth;
    n.classList.add('show');
    this.noticeT = time;
  }

  feed(html) {
    const f = $('killfeed');
    const el = document.createElement('div');
    el.innerHTML = html;
    f.appendChild(el);
    while (f.children.length > 6) f.removeChild(f.firstChild);
    setTimeout(() => el.classList.add('fade'), 5000);
    setTimeout(() => el.remove(), 6000);
  }

  damageNumber(t, amount, head, shield) {
    const G = this.G;
    _v.set(t.pos.x + (Math.random() - 0.5) * 0.6, t.pos.y + (head ? 2.1 : 1.6), t.pos.z).project(G.camera);
    if (_v.z > 1) return;
    const el = document.createElement('div');
    el.className = 'dmg' + (head ? ' head' : '') + (shield ? ' shield' : '');
    el.textContent = amount;
    el.style.left = ((_v.x * 0.5 + 0.5) * window.innerWidth) + 'px';
    el.style.top = ((-_v.y * 0.5 + 0.5) * window.innerHeight) + 'px';
    $('dmgnums').appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  hitmarker(kill, head) {
    $('hitmarker').className = 'show' + (kill ? ' kill' : head ? ' head' : '');
    this.hitT = kill ? 0.35 : 0.15;
  }

  hurt(from, storm) {
    const h = $('hurt');
    h.classList.toggle('storm', storm);
    this.hurtT = 0.6;
    h.style.opacity = 1;
    const ind = $('hurtDir');
    if (from) {
      const G = this.G, p = G.player;
      // Richtung zur Quelle im Blick-Koordinatensystem (0 = vorne, im Uhrzeigersinn)
      const dx = from.x - p.pos.x, dz = from.z - p.pos.z, y = G.camYaw;
      const f = -dx * Math.sin(y) - dz * Math.cos(y), r = dx * Math.cos(y) - dz * Math.sin(y);
      const rel = Math.atan2(r, f);
      ind.style.transform = `translate(-50%, -50%) rotate(${rel}rad)`;
      ind.classList.remove('show'); void ind.offsetWidth; ind.classList.add('show');
    }
  }

  pieceHp(pc) {
    const el = $('pieceHp');
    el.hidden = false;
    el.querySelector('span').textContent = `${pc.name} ${Math.max(0, Math.ceil(pc.hp))}/${pc.maxHp}`;
    el.querySelector('i').style.width = Math.max(0, 100 * pc.hp / pc.maxHp) + '%';
    this.pieceT = 1.4;
  }

  matGain(mat, n) {
    const el = this.matEls[mat];
    const s = document.createElement('em');
    s.textContent = '+' + n;
    el.appendChild(s);
    setTimeout(() => s.remove(), 800);
  }
}
