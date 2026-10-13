// Inventar: Spitzhacke + 6 Plätze, Munition und Baumaterial.

import { HEALS, AMMO, MATS, WEAPONS } from './items.js';

export const SLOTS = 6;

export function newInventory() {
  return {
    slots: new Array(SLOTS).fill(null),
    sel: 0,                                   // 0 = Spitzhacke, 1..6 = Plätze
    ammo: { leicht: 0, mittel: 0, schwer: 0, schrot: 0, raketen: 0 },
    mats: { holz: 0, stein: 0, metall: 0 },
  };
}

export function current(inv) { return inv.sel === 0 ? 'pickaxe' : inv.slots[inv.sel - 1]; }

// Gegenstand aufnehmen. Liefert 'taken' (alles), 'partial' (Rest bleibt in it.n) oder 'full'.
export function give(inv, it) {
  if (it.k === 'a' || it.k === 'm') {
    const store = it.k === 'a' ? inv.ammo : inv.mats;
    const max = (it.k === 'a' ? AMMO : MATS)[it.id].max;
    const take = Math.min(it.n, max - store[it.id]);
    store[it.id] += take;
    it.n -= take;
    return it.n <= 0 ? 'taken' : take > 0 ? 'partial' : 'full';
  }
  let partial = false;
  if (it.k === 'h') {
    const st = HEALS[it.id].stack;
    for (const s of inv.slots) {
      if (s && s.k === 'h' && s.id === it.id && s.n < st) {
        const t = Math.min(it.n, st - s.n);
        s.n += t; it.n -= t; partial = true;
        if (it.n <= 0) return 'taken';
      }
    }
  }
  const e = inv.slots.indexOf(null);
  if (e >= 0) {
    inv.slots[e] = { ...it };
    if (it.k === 'h') it.n = 0;
    return 'taken';
  }
  return partial ? 'partial' : 'full';
}

// Bewertung einer Waffe (für Bots und automatisches Wechseln)
export function weaponScore(it) {
  if (!it || it.k !== 'w') return 0;
  const base = { pistole: 1, mp: 2, sturmgewehr: 3, schrotflinte: 3, scharfschuetze: 2.6, raketenwerfer: 2.8 }[it.id] || 1;
  return base + it.r * 0.35;
}

export function hasAmmoFor(inv, it) {
  return it && it.k === 'w' && (it.mag > 0 || inv.ammo[WEAPONS[it.id].ammo] > 0);
}
