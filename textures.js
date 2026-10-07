// Proceduralne tekstury świata (canvas 2D). Generator jest deterministyczny (ziarno) –
// wygląd jest taki sam przy każdym wczytaniu. Tekstury „kafelkowe” to atlasy wariantów:
// jeden kafel = 2 m × 2 m świata, wariant dobiera bake.js (hash pozycji kafla).

const TILE = 512; // piksele jednego kafla (256 px na metr)

// małe, szybkie PRNG z ziarnem
export function rng32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// ---- warstwy szumu (rysowane na kaflach z losowym odbiciem/przesunięciem) ----
function noiseLayer(seed, streaks) {
  const r = rng32(seed);
  const c = canvas(TILE, TILE);
  const g = c.getContext('2d');
  const img = g.createImageData(TILE, TILE);
  const d = img.data;
  for (let y = 0; y < TILE; y++) {
    const rowA = streaks ? r() : 1;                      // smugi poziome (szczotkowany metal)
    for (let x = 0; x < TILE; x++) {
      const i = (y * TILE + x) * 4;
      const v = r() < 0.5 ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = (streaks ? rowA * 60 * (0.5 + r() * 0.5) : r() * 90) | 0;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

function overlay(g, layer, alpha, r) {
  const fx = r() < 0.5, fy = r() < 0.5;
  g.save();
  g.globalAlpha = alpha;
  g.translate(fx ? TILE : 0, fy ? TILE : 0);
  g.scale(fx ? -1 : 1, fy ? -1 : 1);
  g.drawImage(layer, 0, 0);
  g.restore();
}

// ---- elementy wspólne ----
function seams(g, S, w, dark, hi, lo) {
  g.fillStyle = dark;
  g.fillRect(0, 0, S, w); g.fillRect(0, S - w, S, w); g.fillRect(0, 0, w, S); g.fillRect(S - w, 0, w, S);
  g.fillStyle = hi;   // fazowanie: jasna krawędź od góry/lewej, cień od dołu/prawej
  g.fillRect(w, w, S - 2 * w, 2); g.fillRect(w, w, 2, S - 2 * w);
  g.fillStyle = lo;
  g.fillRect(w, S - w - 2, S - 2 * w, 2); g.fillRect(S - w - 2, w, 2, S - 2 * w);
}

function rivet(g, x, y, rad, face, rim, shine) {
  const gr = g.createRadialGradient(x - rad * 0.3, y - rad * 0.35, rad * 0.1, x, y, rad);
  gr.addColorStop(0, shine); gr.addColorStop(0.7, face); gr.addColorStop(1, rim);
  g.fillStyle = 'rgba(0,0,0,.28)';
  g.beginPath(); g.arc(x + 1.5, y + 2, rad + 1.5, 0, 7); g.fill();
  g.fillStyle = gr;
  g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
}

function blob(g, x, y, rad, color, a) {
  const gr = g.createRadialGradient(x, y, 0, x, y, rad);
  gr.addColorStop(0, `rgba(${color},${a})`);
  gr.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = gr;
  g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
}

function drip(g, x, y0, len, w, color, a) {
  const gr = g.createLinearGradient(0, y0, 0, y0 + len);
  gr.addColorStop(0, `rgba(${color},${a})`);
  gr.addColorStop(0.7, `rgba(${color},${a * 0.45})`);
  gr.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = gr;
  g.fillRect(x - w / 2, y0, w, len);
}

function scratches(g, S, r, n, light) {
  g.lineWidth = 1;
  for (let i = 0; i < n; i++) {
    const x = r() * S, y = r() * S, a = r() * Math.PI, l = 14 + r() * 60;
    g.strokeStyle = light ? `rgba(255,255,255,${0.1 + r() * 0.18})` : `rgba(30,35,42,${0.06 + r() * 0.12})`;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
}

function hazard(g, x, y, w, h, c1, c2, step) {
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = c2; g.fillRect(x, y, w, h);
  g.fillStyle = c1;
  for (let i = -h; i < w + h; i += step * 2) {
    g.beginPath(); g.moveTo(x + i, y + h); g.lineTo(x + i + step, y + h); g.lineTo(x + i + step + h, y); g.lineTo(x + i + h, y); g.fill();
  }
  g.restore();
}

// ---- białe panele ----
function drawWhite(g, S, k, r, L) {
  const base = g.createLinearGradient(0, 0, 0, S);
  base.addColorStop(0, '#e9edf1'); base.addColorStop(1, '#dbe1e7');
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  blob(g, S / 2, S / 2, S * 0.7, '255,255,255', 0.32);
  overlay(g, L.grain, 0.075, r);
  overlay(g, L.brush, 0.06, r);
  if (k === 1) {            // zmatowienie i otarcie
    blob(g, S * (0.25 + r() * 0.5), S * (0.3 + r() * 0.4), 90 + r() * 60, '90,98,108', 0.10);
    blob(g, S * 0.9, S * 0.92, 130, '70,78,88', 0.12);
    scratches(g, S, r, 9, false);
  } else if (k === 2) {     // zacieki spod górnego szwu
    for (let i = 0; i < 6; i++) drip(g, 40 + r() * (S - 80), 6, 90 + r() * 230, 5 + r() * 14, '84,94,104', 0.07 + r() * 0.07);
    blob(g, S / 2, 0, 200, '80,90,100', 0.1);
  } else if (k === 3) {     // panel dzielony poziomo
    g.fillStyle = 'rgba(95,105,116,.55)'; g.fillRect(14, S / 2 - 2, S - 28, 3);
    g.fillStyle = 'rgba(255,255,255,.8)'; g.fillRect(14, S / 2 + 1, S - 28, 2);
    blob(g, S * 0.15, S * 0.82, 110, '70,80,92', 0.1);
    scratches(g, S, r, 5, true);
  }
  // wgłębienie panelu
  g.lineWidth = 2;
  g.strokeStyle = 'rgba(110,120,132,.5)'; g.strokeRect(26, 26, S - 52, S - 52);
  g.strokeStyle = 'rgba(255,255,255,.75)'; g.strokeRect(28.5, 28.5, S - 52, S - 52);
  seams(g, S, 5, '#8a949e', '#fbfcfd', '#bcc4cc');
  for (const [x, y] of [[44, 44], [S - 44, 44], [44, S - 44], [S - 44, S - 44]]) rivet(g, x, y, 7, '#cdd3d9', '#8d97a1', '#f6f8fa');
  if (k === 3) for (const [x, y] of [[44, S / 2], [S - 44, S / 2]]) rivet(g, x, y, 6, '#cdd3d9', '#8d97a1', '#f6f8fa');
}

// ---- podłoga: płyty 1 m × 1 m ----
function drawFloor(g, S, k, r, L) {
  g.fillStyle = '#c1c7cf'; g.fillRect(0, 0, S, S);
  const h = S / 2;
  for (let i = 0; i < 4; i++) {         // każda płyta ma własną jasność
    const x = (i % 2) * h, y = (i >> 1) * h, t = (r() - 0.5) * 22;
    g.fillStyle = `rgb(${193 + t | 0},${199 + t | 0},${207 + t | 0})`;
    g.fillRect(x, y, h, h);
    const gr = g.createLinearGradient(x, y, x + h, y + h);
    gr.addColorStop(0, 'rgba(255,255,255,.22)'); gr.addColorStop(1, 'rgba(0,0,0,.10)');
    g.fillStyle = gr; g.fillRect(x, y, h, h);
  }
  overlay(g, L.grain, 0.11, r);
  overlay(g, L.brush, 0.08, r);
  if (k === 1) scratches(g, S, r, 40, true), scratches(g, S, r, 25, false);
  else if (k === 2) { blob(g, S * (0.2 + r() * 0.6), S * (0.2 + r() * 0.6), 80 + r() * 70, '50,56,64', 0.2); scratches(g, S, r, 10, false); }
  else if (k === 3) { blob(g, S / 2, S / 2, 260, '255,255,255', 0.22); scratches(g, S, r, 18, true); }
  // szwy między płytami (cieńsze w środku)
  g.fillStyle = '#7d8791'; g.fillRect(h - 2, 0, 4, S); g.fillRect(0, h - 2, S, 4);
  g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(h + 2, 0, 2, S); g.fillRect(0, h + 2, S, 2);
  g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(h - 4, 0, 2, S); g.fillRect(0, h - 4, S, 2);
  seams(g, S, 6, '#6f7983', '#e6eaee', '#9aa3ad');
  for (let i = 0; i < 4; i++) {
    const x = (i % 2) * h, y = (i >> 1) * h;
    for (const [dx, dy] of [[22, 22], [h - 22, 22], [22, h - 22], [h - 22, h - 22]]) rivet(g, x + dx, y + dy, 5, '#b0b8c0', '#6b757f', '#e5e9ed');
  }
}

// ---- ciemne płyty: rowki, pasy ostrzegawcze, matowy połysk ----
function drawDark(g, S, k, r, L) {
  const base = g.createLinearGradient(0, 0, S, S);
  base.addColorStop(0, '#30353b'); base.addColorStop(1, '#23272c');
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  overlay(g, L.grain, 0.1, r);
  overlay(g, L.brush, 0.12, r);
  if (k !== 2) {                         // rowki pionowe
    for (let x = 36; x < S - 30; x += 22) {
      g.fillStyle = 'rgba(8,10,12,.65)'; g.fillRect(x, 40, 6, S - 80);
      g.fillStyle = 'rgba(120,130,142,.28)'; g.fillRect(x + 6, 40, 2, S - 80);
    }
  } else {                               // krzyż z dwóch belek
    g.lineCap = 'round';
    for (const [w, c] of [[16, '#15181b'], [9, '#3b4148'], [3, '#59616a']]) {
      g.strokeStyle = c; g.lineWidth = w;
      g.beginPath(); g.moveTo(40, S - 40); g.lineTo(S - 40, 40); g.moveTo(40, 40); g.lineTo(S - 40, S - 40); g.stroke();
    }
  }
  if (k === 1) {
    hazard(g, 14, S - 54, S - 28, 28, '#b98a17', '#1a1d20', 24);
    g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 2; g.strokeRect(14, S - 54, S - 28, 28);
  }
  const sheen = g.createLinearGradient(0, 0, 0, S);   // matowy połysk
  sheen.addColorStop(0, 'rgba(160,175,195,.10)'); sheen.addColorStop(0.35, 'rgba(160,175,195,0)');
  sheen.addColorStop(0.7, 'rgba(160,175,195,.05)'); sheen.addColorStop(1, 'rgba(160,175,195,0)');
  g.fillStyle = sheen; g.fillRect(0, 0, S, S);
  if (k === 0) scratches(g, S, r, 14, true);
  seams(g, S, 6, '#101214', '#4a5159', '#1a1d20');
  for (const [x, y] of [[26, 26], [S - 26, 26], [26, S - 26], [S - 26, S - 26]]) rivet(g, x, y, 6, '#4a5159', '#171a1d', '#7b848d');
}

// ---- drzwi: jedna tekstura rozciągnięta na całą ścianę drzwi ----
function drawDoor(g, S, r, L) {
  g.fillStyle = '#23282e'; g.fillRect(0, 0, S, S);
  overlay(g, L.grain, 0.1, r);
  overlay(g, L.brush, 0.1, r);
  hazard(g, 0, 0, S, 58, '#ff9a2e', '#16191c', 34);
  hazard(g, 0, S - 58, S, 58, '#ff9a2e', '#16191c', 34);
  g.fillStyle = 'rgba(14,17,20,.9)'; g.fillRect(70, 84, S - 140, S - 168);
  g.strokeStyle = '#5b636d'; g.lineWidth = 5; g.strokeRect(70, 84, S - 140, S - 168);
  g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 2; g.strokeRect(75, 89, S - 150, S - 178);
  for (const x of [34, S - 34]) {        // świecące pasy po bokach
    g.save();
    g.shadowColor = '#ff7a00'; g.shadowBlur = 26;
    g.fillStyle = '#ffb25a'; g.fillRect(x - 5, 76, 10, S - 152);
    g.restore();
    g.fillStyle = '#fff1d6'; g.fillRect(x - 2, 82, 4, S - 164);
  }
  g.save();                               // piktogram: podwójna szewron w górę (drzwi unoszone)
  g.shadowColor = '#ff7a00'; g.shadowBlur = 22;
  g.strokeStyle = '#ffa843'; g.lineWidth = 22; g.lineCap = 'round'; g.lineJoin = 'round';
  for (const dy of [0, 78]) {
    g.beginPath(); g.moveTo(S / 2 - 76, S / 2 - 20 + dy); g.lineTo(S / 2, S / 2 - 96 + dy); g.lineTo(S / 2 + 76, S / 2 - 20 + dy); g.stroke();
  }
  g.restore();
  for (const [x, y] of [[104, 118], [S - 104, 118], [104, S - 118], [S - 104, S - 118]]) rivet(g, x, y, 7, '#59606a', '#1b1f23', '#8e98a3');
  seams(g, S, 5, '#0d0f11', '#3d444c', '#14171a');
}

// ---- szkło: ramka, refleks po przekątnej, lekki odcień (alfa niska – nie zasłania) ----
function drawGlass(g, S) {
  g.clearRect(0, 0, S, S);
  g.fillStyle = 'rgba(170,222,255,.15)'; g.fillRect(0, 0, S, S);
  g.save();
  g.beginPath(); g.rect(0, 0, S, S); g.clip();
  g.rotate(-0.62);
  for (const [x, w, a] of [[S * 0.12, 46, 0.2], [S * 0.12 + 66, 14, 0.2], [S * 0.62, 86, 0.1]]) {
    g.fillStyle = `rgba(255,255,255,${a})`; g.fillRect(x - S * 0.2, -S, w, S * 3);
  }
  g.restore();
  g.fillStyle = 'rgba(214,240,255,.5)';
  g.fillRect(0, 0, S, 10); g.fillRect(0, S - 10, S, 10); g.fillRect(0, 0, 10, S); g.fillRect(S - 10, 0, 10, S);
  g.fillStyle = 'rgba(255,255,255,.7)';
  g.fillRect(0, 0, S, 3); g.fillRect(0, 0, 3, S);
  g.fillStyle = 'rgba(70,110,140,.45)';
  g.fillRect(0, S - 3, S, 3); g.fillRect(S - 3, 0, 3, S);
}

// ---- kratka: stalowe pręty z fazą (reszta przezroczysta, alphaTest) ----
function drawGrate(g, S) {
  g.clearRect(0, 0, S, S);
  const bar = (x, y, w, h, vertical) => {
    const gr = vertical ? g.createLinearGradient(x, 0, x + w, 0) : g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, '#e9eff4'); gr.addColorStop(0.3, '#b7c2cc'); gr.addColorStop(0.75, '#7c8893'); gr.addColorStop(1, '#3e464e');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
  };
  const w = 22;
  for (const p of [0, S / 2]) { bar(p, 0, w, S, true); bar(0, p, S, w, false); }
  bar(S - w / 2, 0, w / 2, S, true); bar(0, S - w / 2, S, w / 2, false);
  for (const px of [0, S / 2]) for (const py of [0, S / 2]) rivet(g, px + w / 2, py + w / 2, 5, '#aab5bf', '#4a525a', '#f0f4f7');
}

// ---- lampy sufitowe ----
function drawLampPanel(g, S) {
  g.fillStyle = '#434b53'; g.fillRect(0, 0, S, S);       // ciemna rama
  g.fillStyle = '#6c7680'; g.fillRect(1, 1, S - 2, 2); g.fillRect(1, 1, 2, S - 2);
  const f = 9;
  g.fillStyle = '#fbfcff'; g.fillRect(f, f, S - 2 * f, S - 2 * f);
  blob(g, S / 2, S / 2, S * 0.7, '255,255,255', 0.9);
  g.strokeStyle = 'rgba(176,192,212,.85)'; g.lineWidth = 2;
  for (let i = 1; i < 3; i++) {
    const p = f + i * (S - 2 * f) / 3;
    g.beginPath(); g.moveTo(p, f); g.lineTo(p, S - f); g.moveTo(f, p); g.lineTo(S - f, p); g.stroke();
  }
}

function drawGlow(g, S) {
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.18, 'rgba(255,255,255,.6)');
  gr.addColorStop(0.45, 'rgba(255,255,255,.19)');
  gr.addColorStop(0.75, 'rgba(255,255,255,.04)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
}

// ---- składanie ----
export function createTextures(THREE) {
  const layers = { grain: noiseLayer(11, false), brush: noiseLayer(23, true) };

  const finish = (c, grid) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.userData.atlas = grid;   // [kolumny, wiersze] wariantów w atlasie
    return t;
  };
  const atlas = (cols, rows, seed, draw) => {
    const c = canvas(TILE * cols, TILE * rows);
    const g = c.getContext('2d');
    for (let k = 0; k < cols * rows; k++) {
      g.save();
      g.translate((k % cols) * TILE, (k / cols | 0) * TILE);
      g.beginPath(); g.rect(0, 0, TILE, TILE); g.clip();
      draw(g, TILE, k, rng32(seed * 7919 + k * 104729), layers);
      g.restore();
    }
    return c;
  };
  const single = (size, draw) => { const c = canvas(size, size); draw(c.getContext('2d'), size); return c; };

  return {
    white: finish(atlas(2, 2, 1, drawWhite), [2, 2]),
    floor: finish(atlas(2, 2, 2, drawFloor), [2, 2]),
    dark: finish(atlas(2, 2, 3, drawDark), [2, 2]),
    door: finish(atlas(1, 1, 4, (g, S, k, r, L) => drawDoor(g, S, r, L)), [1, 1]),
    glass: finish(single(256, drawGlass), [1, 1]),
    grate: finish(single(256, drawGrate), [1, 1]),
    lamp: finish(single(128, drawLampPanel), [1, 1]),
    glow: finish(single(128, drawGlow), [1, 1]),
  };
}
