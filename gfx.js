// Grafika świata: materiały, tekstury, wypalone światło, lampy, mgła, światło dla obiektów dynamicznych
// i presety jakości. Zobacz docs/gfx.md.
//
// Przepływ: poziom jest budowany przez LevelAPI (bryły + lampy + doły), a po build() game.js woła
// gfx.bake(...), które zamienia bryły w jedną siatkę na rodzaj powierzchni (kolory wierzchołków = światło).
// Oryginalne meshe brył (worldMeshes) zostają jako niewidzialne „proxy” do raycastu i kolizji.

import { createTextures } from './textures.js';
import { LightField, packLights, bakeWorld } from './bake.js';

export const QUALITY = {
  low:    { pixelRatio: 1,    maxDepth: 1, rt0: 0.5,  rtN: 0.35, msaa: 0, aniso: 2,  bake: { base: 2, rays: 6,  shadows: false, aoDist: 5 } },
  medium: { pixelRatio: 1.25, maxDepth: 2, rt0: 0.75, rtN: 0.5,  msaa: 2, aniso: 8,  bake: { base: 2, rays: 10, shadows: true,  aoDist: 6 } },
  high:   { pixelRatio: 1.75, maxDepth: 2, rt0: 1.0,  rtN: 0.5,  msaa: 4, aniso: 16, bake: { base: 1, rays: 16, shadows: true,  aoDist: 7 } },
};
const STORAGE_KEY = 'maceaek.quality';

export function readQuality() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && QUALITY[v]) return v;
  } catch { /* brak storage */ }
  return 'high';
}
export function writeQuality(name) {
  try { localStorage.setItem(STORAGE_KEY, name); } catch { /* ignoruj */ }
}

const LAMP_SIZE = 3.5;
const LAMP_E0 = 0.2;             // natężenie pod lampą (w odległości h)

export function createGfx(THREE, renderer, scene) {
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  let quality = QUALITY.high;
  let tex = null;

  // rodzaje powierzchni: portalable = przyjmuje portale, shootThrough = strzał przelatuje (kratka)
  const basic = (o) => new THREE.MeshBasicMaterial({ vertexColors: true, ...o });
  const MATS = {
    white: { mat: basic({}), portalable: true, tile: 2 },
    floor: { mat: basic({}), portalable: true, tile: 2 },
    dark:  { mat: basic({}), portalable: false, tile: 2 },
    door:  { mat: basic({}), portalable: false, tile: 2 },
    glass: { mat: basic({ transparent: true, depthWrite: false }), portalable: false, tile: 2 },
    grate: { mat: basic({ alphaTest: 0.35, side: THREE.DoubleSide }), portalable: false, tile: 1, shootThrough: true },
  };
  const info = {};
  for (const k in MATS) info[k] = { tile: MATS[k].tile, mode: k === 'door' ? 'face' : 'tile', atlas: [1, 1] };

  const lampMat = new THREE.MeshBasicMaterial({ fog: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xcfe0f5, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });

  // mgła: lekka głębia w długich halach (nie wyszarza celów – przy 70 m ~15%)
  scene.fog = new THREE.FogExp2(0x8393a8, 0.0055);

  function ensureTextures() {
    if (tex) return;
    const t0 = performance.now();
    tex = createTextures(THREE);
    for (const k of ['white', 'floor', 'dark', 'door', 'glass', 'grate']) {
      MATS[k].mat.map = tex[k];
      MATS[k].mat.needsUpdate = true;
      info[k].atlas = tex[k].userData.atlas;
    }
    lampMat.map = tex.lamp; lampMat.needsUpdate = true;
    glowMat.map = tex.glow; glowMat.needsUpdate = true;
    applyAniso();
    stats.textureMs = performance.now() - t0;
  }

  function applyAniso() {
    if (!tex) return;
    for (const k of ['white', 'floor', 'dark', 'door', 'glass', 'grate']) {
      const a = Math.min(quality.aniso, maxAniso);
      if (tex[k].anisotropy !== a) { tex[k].anisotropy = a; tex[k].needsUpdate = true; }
    }
  }

  // ---- rejestr źródeł światła wypełniany podczas build() poziomu ----
  const lamps = [];
  const pits = [];
  const meshes = [];       // siatki dodane przez gfx (świat, lampy)
  let field = null;        // pole świetlne ostatniego wypalenia
  let last = null;         // kontekst ostatniego bake (do ponownego wypalenia po zmianie jakości)
  const stats = { textureMs: 0, bakeMs: 0, cells: 0, triangles: 0, vertices: 0, drawCalls: 0, lights: 0 };

  function collectLights(ctx) {
    const out = [];
    for (const l of lamps) {
      const R0 = Math.min(22, Math.max(6, l.h * 0.8));
      out.push({ x: l.x, y: l.h - 0.1, z: l.z, r: 1.0, g: 0.985, b: 0.95, I: LAMP_E0 * (1 + (l.h / R0) ** 2), R0, cut: 3.2, fy: -1 });
    }
    for (const p of pits) {   // kwas świeci na zielono: kilka punktów nad powierzchnią
      const nx = Math.min(5, Math.max(1, Math.ceil((p.x1 - p.x0) / 3.5))), nz = Math.min(5, Math.max(1, Math.ceil((p.z1 - p.z0) / 3.5)));
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        out.push({
          x: p.x0 + (i + 0.5) * (p.x1 - p.x0) / nx, y: -4.8, z: p.z0 + (j + 0.5) * (p.z1 - p.z0) / nz,
          r: 0.42, g: 1.0, b: 0.12, I: 0.42, R0: 3.4, cut: 3, fy: 1,
        });
      }
    }
    const ex = ctx.exit;
    if (ex) out.push({ x: ex.x, y: ex.y + 0.5, z: ex.z, r: 0.3, g: 1.0, b: 0.55, I: 0.8, R0: 3, cut: 3, fy: 1 });
    for (const b of ctx.boxes) {
      if (b.kind !== 'door') continue;
      out.push({
        x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2, z: (b.min.z + b.max.z) / 2,
        r: 1.0, g: 0.55, b: 0.15, I: 0.5, R0: 2.4, cut: 2.5, omni: true, shadow: false,
      });
    }
    return out;
  }

  function geometryFrom(g) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(g.col, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
    geo.setIndex(g.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(g.idx, 1) : new THREE.Uint16BufferAttribute(g.idx, 1));
    return geo;
  }

  // lampy: panele (jedna siatka) i miękka poświata na suficie (jedna siatka, addytywna)
  function lampMeshes() {
    if (!lamps.length) return [];
    const mk = (size, y, mat, order) => {
      const pos = [], uv = [], idx = [];
      lamps.forEach((l, i) => {
        const h = size / 2, yy = l.h - y;
        pos.push(l.x - h, yy, l.z + h, l.x + h, yy, l.z + h, l.x + h, yy, l.z - h, l.x - h, yy, l.z - h);
        uv.push(0, 0, 1, 0, 1, 1, 0, 1);
        idx.push(i * 4, i * 4 + 2, i * 4 + 1, i * 4, i * 4 + 3, i * 4 + 2);
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      const m = new THREE.Mesh(geo, mat);
      m.renderOrder = order;
      return m;
    };
    return [mk(LAMP_SIZE, 0.045, lampMat, 0), mk(11, 0.02, glowMat, 1)];
  }

  function clearMeshes(ctx) {
    for (const m of meshes) { ctx.remove(m); m.geometry.dispose(); }
    meshes.length = 0;
  }

  // ctx: { boxes, meshes (worldMeshes), exit, render, add(obj), remove(obj) }
  function bake(ctx) {
    if (last) clearMeshes(last);
    last = ctx;
    field = null;
    if (!ctx.render) return;
    ensureTextures();
    const t0 = performance.now();
    const lights = collectLights(ctx);
    field = new LightField(ctx.boxes, packLights(lights), quality.bake);
    const { groups, cells } = bakeWorld(ctx.boxes, field, info, quality.bake);

    const byBox = new Map(ctx.meshes.map(m => [m.userData.box, m]));
    let tris = 0, verts = 0;
    for (const [key, g] of groups) {
      const geo = geometryFrom(g);
      tris += g.idx.length / 3; verts += g.pos.length / 3;
      if (typeof key === 'string') {
        const m = new THREE.Mesh(geo, MATS[key].mat);
        m.matrixAutoUpdate = false;
        ctx.add(m); meshes.push(m);
      } else {                                   // drzwi zostają własną siatką (animowaną przez game.js)
        const dm = byBox.get(key);
        dm.geometry.dispose();
        dm.geometry = geo;
        dm.material = MATS.door.mat;
      }
    }
    for (const m of ctx.meshes) if (m.userData.box.kind !== 'door') m.visible = false;   // proxy do raycastu
    for (const m of lampMeshes()) { m.matrixAutoUpdate = false; ctx.add(m); meshes.push(m); }

    stats.bakeMs = performance.now() - t0;
    stats.cells = cells; stats.triangles = tris; stats.vertices = verts; stats.lights = lights.length;
    stats.drawCalls = meshes.length + ctx.boxes.filter(b => b.kind === 'door').length;
  }

  function clear() {
    lamps.length = 0; pits.length = 0;
    field = null;
    if (last) { for (const m of meshes) m.geometry.dispose(); meshes.length = 0; last = null; }
  }

  // ---- światło dla obiektów dynamicznych (kostki) ----
  const _c = [0, 0, 0];
  const FACE_K = [0.86, 0.74, 1.0, 0.5, 0.8, 0.68];   // jasność ścian kostki: +x -x +y -y +z -z (kolejność BoxGeometry)
  let frameNo = 0;

  // kolor światła w punkcie (liniowy) – ta sama suma świateł i AO co w wypalonym świecie
  function lightAt(x, y, z, out) {
    if (!field) { out.r = out.g = out.b = 1; return out; }
    field.shade(x, y, z, 3, _c);
    out.r = _c[0]; out.g = _c[1]; out.b = _c[2];
    return out;
  }

  function litCube(mesh) {
    const g = mesh.geometry, n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.fill(FACE_K[Math.min(5, (i / 4) | 0)], i * 3, i * 3 + 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    mesh.material = new THREE.MeshBasicMaterial({ map: mesh.material.map, vertexColors: true });
    return (mesh.userData.gfx = { r: 1, g: 1, b: 1, tr: 1, tg: 1, tb: 1, fresh: true });
  }

  // co kilka klatek liczy światło w miejscu kostki i płynnie ustawia kolor jej materiału
  function updateDynamics(cubes, dt) {
    if (!field) return;
    frameNo++;
    const k = 1 - Math.exp(-dt * 9);
    for (let i = 0; i < cubes.length; i++) {
      const c = cubes[i], m = c.mesh;
      const st = m.userData.gfx || litCube(m);
      if (st.fresh || (frameNo + i * 2) % 5 === 0) {
        field.shade(c.pos.x, c.pos.y + 0.42, c.pos.z, 3, _c);
        st.tr = Math.min(1.5, _c[0]); st.tg = Math.min(1.5, _c[1]); st.tb = Math.min(1.5, _c[2]);
      }
      const f = st.fresh ? 1 : k;
      st.fresh = false;
      st.r += (st.tr - st.r) * f; st.g += (st.tg - st.g) * f; st.b += (st.tb - st.b) * f;
      m.material.color.setRGB(st.r, st.g, st.b);
    }
  }

  function applyQuality(name) {
    quality = QUALITY[name];
    applyAniso();
    return quality;
  }

  return {
    MATS, QUALITY, stats,
    get quality() { return quality; },
    addLamp(x, h, z) { lamps.push({ x, h, z }); },
    addPit(x0, x1, z0, z1) { pits.push({ x0, x1, z0, z1 }); },
    bake,
    // ponowne wypalenie bieżącego poziomu (po zmianie presetu jakości)
    rebake() { if (last) bake(last); },
    clear, lightAt, updateDynamics, applyQuality,
  };
}
