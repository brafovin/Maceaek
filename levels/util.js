// Wspólne pomocniki do budowy poziomów.

export const DARK_ALL = { n: 'dark', s: 'dark', e: 'dark', w: 'dark', ceil: 'dark' };

// Schody co 0,5 m: biegną w stronę -z i kończą się przy zEnd na wysokości `top`
// (najniższy stopień jest najdalej od zEnd). depth = głębokość jednego stopnia.
export function stairs(L, x0, x1, zEnd, top, depth = 1) {
  const n = Math.round(top / 0.5);
  for (let i = 1; i <= n; i++) L.box(x0, 0, zEnd, x1, 0.5 * i, zEnd + depth * (n - i + 1), 'white');
}
