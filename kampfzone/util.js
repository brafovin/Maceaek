// Kleine Hilfsfunktionen und Konstanten, die überall gebraucht werden.

export const GRID = 4;          // Baugitter in Metern (Wand = 4 × 4 m)
export const HALF = 160;        // halbe Kartengröße: die Karte reicht von -160 bis +160
export const GRAV = 24;         // Schwerkraft (m/s²)

// Deterministischer Zufall (mulberry32) mit ein paar Komfortfunktionen
export function makeRng(seed) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * f());
  f.pick = arr => arr[Math.floor(f() * arr.length)];
  f.chance = p => f() < p;
  return f;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

// [[wert, gewicht], ...] → zufälliger Wert
export function weighted(r, list) {
  let s = 0;
  for (const [, w] of list) s += w;
  let x = r() * s;
  for (const [v, w] of list) { x -= w; if (x <= 0) return v; }
  return list[list.length - 1][0];
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

// Blickrichtung aus Yaw/Pitch (Kamera schaut bei yaw = 0 nach -z)
export function forward(yaw, pitch, out) {
  const c = Math.cos(pitch);
  out.x = -Math.sin(yaw) * c;
  out.y = Math.sin(pitch);
  out.z = -Math.cos(yaw) * c;
  return out;
}
