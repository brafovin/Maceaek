import * as THREE from './vendor/three.module.js';
import { S, clamp01, smooth, glowTexture } from './fxcore.js';

/* ==========================================================================
   fxmodels.js – model i animacja działa portalowego (widok z pierwszej osoby)
   createGun(gunScene) -> { group, update(dt), fire(colorHex) }
   Pistolet ma własną scenę (gunScene) i własne światła; wskazuje ostatnio użyty kolor portalu.
   ========================================================================== */

const GUN_BASE = new THREE.Vector3(0.16, -0.15, -0.42);
const NEUTRAL = 0xcfe3f2;

// pomocnik: walec/stożek ułożony wzdłuż osi z (przód = -z)
function axial(geo, mat, z, x = 0, y = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}

export function createGun(gunScene) {
  // ---- światła (osobne od świata) ----
  gunScene.add(new THREE.HemisphereLight(0xffffff, 0x8794a3, 1.25));
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(0.5, 0.9, 0.7);
  gunScene.add(key);
  const rim = new THREE.DirectionalLight(0xaecbff, 0.9);
  rim.position.set(-0.8, 0.2, -0.6);
  gunScene.add(rim);
  const tipLight = new THREE.PointLight(0xffffff, 0, 0.7, 1.6);
  tipLight.position.set(0, 0, -0.42);

  // ---- materiały ----
  const white = new THREE.MeshPhongMaterial({ color: 0xf1f4f7, specular: 0x667788, shininess: 70 });
  const grey = new THREE.MeshPhongMaterial({ color: 0x59616a, specular: 0x333b44, shininess: 35 });
  const dark = new THREE.MeshPhongMaterial({ color: 0x20252a, specular: 0x222a33, shininess: 20 });
  const accent = new THREE.MeshBasicMaterial({ color: NEUTRAL });
  const accentHot = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const orbMat = new THREE.MeshBasicMaterial({ color: NEUTRAL, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
  const flashMat = new THREE.SpriteMaterial({ map: glowTexture(), color: NEUTRAL, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });

  const gun = new THREE.Group();
  gun.scale.setScalar(0.65);
  gunScene.add(gun);
  gun.add(tipLight);

  // ---- korpus (profil obrotowy wzdłuż osi z) ----
  const prof = [
    [0.0, -0.318], [0.030, -0.318], [0.034, -0.29], [0.038, -0.24], [0.040, -0.20],
    [0.050, -0.185], [0.055, -0.13], [0.058, -0.07], [0.0635, -0.03], [0.066, 0.03],
    [0.064, 0.10], [0.058, 0.17], [0.048, 0.215], [0.0, 0.232],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), white);
  body.rotation.x = Math.PI / 2;
  gun.add(body);
  // wnętrze lufy (ciemne) i stopka
  gun.add(axial(new THREE.CylinderGeometry(0.022, 0.022, 0.03, 16), dark, -0.31));
  gun.add(axial(new THREE.CylinderGeometry(0.052, 0.058, 0.03, 24), grey, -0.172));
  gun.add(axial(new THREE.CylinderGeometry(0.058, 0.058, 0.012, 24), grey, 0.215));

  // osłony boczne i spód
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.05, 0.15), grey);
    p.position.set(sx * 0.064, -0.004, 0.035);
    gun.add(p);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.012, 0.11), accent);
    stripe.position.set(sx * 0.0715, -0.004, 0.035);
    gun.add(stripe);
  }
  const belly = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.2), grey);
  belly.position.set(0, -0.066, 0.03);
  gun.add(belly);
  const gripPod = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.1, 14), dark);
  gripPod.position.set(0, -0.11, 0.1);
  gripPod.rotation.x = -0.2;
  gun.add(gripPod);

  // ---- cewki (świecące pierścienie na korpusie) ----
  const coils = [];
  for (const z of [-0.075, -0.015, 0.045, 0.105]) {
    const r = 0.0668 + (z > 0 ? -0.001 : 0);
    const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.0042, 6, 28), accent);
    t.position.z = z;
    gun.add(t);
    coils.push(t);
  }

  // ---- rura energii na grzbiecie ----
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.014, 0.25), grey);
  rail.position.set(0, 0.07, 0.0);
  gun.add(rail);
  const tube = axial(new THREE.CylinderGeometry(0.0085, 0.0085, 0.2, 10), accentHot, -0.005, 0, 0.082);
  gun.add(tube);
  for (const z of [-0.11, 0.1]) gun.add(axial(new THREE.CylinderGeometry(0.013, 0.013, 0.016, 10), dark, z, 0, 0.082));

  // wskaźnik koloru ostatniego portalu (z tyłu, widoczny z kamery) i kulka-LED
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.01, 0.026), accentHot);
  led.position.set(0, 0.0705, 0.185);
  gun.add(led);
  const ledRing = new THREE.Mesh(new THREE.TorusGeometry(0.049, 0.0035, 8, 28), accent);
  ledRing.position.z = 0.222;
  gun.add(ledRing);

  // ---- trzy „szczypce” z ruchomymi przegubami ----
  const prongs = [];
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + i * Math.PI * 2 / 3;
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(a) * 0.044, Math.sin(a) * 0.044, -0.2);
    pivot.rotation.z = a - Math.PI / 2;
    const tilt = new THREE.Group();
    pivot.add(tilt);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.011, 0.15), i === 0 ? white : grey);
    arm.position.z = -0.072;
    tilt.add(arm);
    const tipGlow = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.004, 0.034), accent);
    tipGlow.position.set(0, 0.0065, -0.125);
    tilt.add(tipGlow);
    gun.add(pivot);
    prongs.push(tilt);
  }

  // ---- czubek: pierścień, kula energii, rdzeń ----
  const tipRing = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.006, 8, 24), accentHot);
  tipRing.position.z = -0.335;
  gun.add(tipRing);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), orbMat);
  orb.position.z = -0.3;
  gun.add(orb);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.015, 12, 10), accentHot);
  core.position.z = -0.3;
  gun.add(core);
  const flash = new THREE.Sprite(flashMat);
  flash.position.z = -0.37;
  gun.add(flash);

  // ---- stan animacji (same liczby – zero alokacji na klatkę) ----
  const color = new THREE.Color(NEUTRAL), target = new THREE.Color(NEUTRAL);
  let kick = 0, flashK = 0, spin = 0, prongOpen = 0, t = 0;
  let bobPhase = 0, walkAmp = 0;
  let lastYaw = 0, lastPitch = 0, swayX = 0, swayY = 0, swayVX = 0, swayVY = 0;
  let landY = 0, landV = 0, airY = 0, heldK = 0, lat = 0;
  let inited = false;

  function update(dt) {
    const p = S.player;
    t += dt;
    if (!inited) { lastYaw = p.yaw; lastPitch = p.pitch; inited = true; }

    // chodzenie
    const sp = Math.hypot(p.vel.x, p.vel.z);
    const walkK = p.onGround ? Math.min(sp / 6, 1.7) : 0;
    walkAmp += (walkK - walkAmp) * Math.min(1, dt * 8);
    bobPhase += dt * (5.5 + sp * 0.95) * (walkAmp > 0.04 ? 1 : 0);

    // lądowanie: sprężyna w dół
    if (S.landImpact > 0) { landV -= Math.min(S.landImpact, 40) * 0.012; S.landImpact = 0; }
    landV += (-landY * 160 - landV * 12) * dt;
    landY += landV * dt;

    // unoszenie przy locie (prędkość pionowa)
    const vyT = -Math.max(-10, Math.min(10, p.vel.y)) * 0.0016;
    airY += (vyT - airY) * Math.min(1, dt * 7);

    // opóźnienie względem obrotu kamery (bezwładność)
    let dyaw = p.yaw - lastYaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    const dpit = p.pitch - lastPitch;
    lastYaw = p.yaw; lastPitch = p.pitch;
    if (Math.abs(dyaw) < 0.5 && Math.abs(dpit) < 0.5) { swayVX += dyaw * 0.9; swayVY -= dpit * 0.9; }
    swayVX += (-swayX * 140 - swayVX * 14) * dt; swayX += swayVX * dt;
    swayVY += (-swayY * 140 - swayVY * 14) * dt; swayY += swayVY * dt;
    swayX = Math.max(-0.05, Math.min(0.05, swayX)); swayY = Math.max(-0.05, Math.min(0.05, swayY));

    // przechył przy ruchu bocznym
    const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    const side = p.vel.x * cy - p.vel.z * sy;
    lat += (side * 0.0035 - lat) * Math.min(1, dt * 6);

    // trzymana kostka – pistolet się opuszcza i odsuwa
    heldK += ((S.mech && S.mech.held ? 1 : 0) - heldK) * Math.min(1, dt * 7);

    kick = Math.max(0, kick - dt * 5.2);
    flashK = Math.max(0, flashK - dt * 9);
    spin *= Math.exp(-dt * 3.2);
    prongOpen = Math.max(0, prongOpen - dt * 3.2);
    const kk = kick * kick * (3 - 2 * kick);
    const breathe = Math.sin(t * 1.55);

    const wob = walkAmp;
    gun.position.set(
      GUN_BASE.x + Math.sin(bobPhase) * 0.0075 * wob + swayX * 0.5 + heldK * 0.045,
      GUN_BASE.y - Math.abs(Math.cos(bobPhase)) * 0.0095 * wob + airY + landY + breathe * 0.0018 + swayY * 0.5 - heldK * 0.075,
      GUN_BASE.z + kk * 0.085 + Math.sin(bobPhase * 2) * 0.0035 * wob + heldK * 0.07
    );
    gun.rotation.set(
      kk * 0.16 + breathe * 0.004 + swayY * 0.8 + landY * 1.6 + heldK * 0.22,
      swayX * 0.8 - heldK * 0.2,
      -lat + Math.sin(bobPhase) * 0.02 * wob + swayX * 0.5
    );

    // kolor ostatnio użytego portalu
    color.lerp(target, Math.min(1, dt * 9));
    const pulse = 0.88 + 0.12 * Math.sin(t * 4.2) + flashK * 0.6;
    accent.color.copy(color).multiplyScalar(pulse * 1.15);
    accentHot.color.copy(color).lerp(white.color, 0.18).multiplyScalar(1 + flashK * 0.6);
    orbMat.color.copy(color).multiplyScalar(0.9 + flashK);
    orbMat.opacity = 0.42 + 0.12 * Math.sin(t * 5.0) + flashK * 0.3;
    const os = 1 + 0.08 * Math.sin(t * 5.0) + flashK * 0.55;
    orb.scale.setScalar(os);
    core.scale.setScalar(1 + flashK * 0.8);
    flashMat.color.copy(color);
    flashMat.opacity = clamp01(flashK * 1.4);
    flash.scale.setScalar(0.09 + flashK * 0.22);
    tipLight.color.copy(color);
    tipLight.intensity = flashK * 2.2 + 0.12;

    // szczypce rozchylają się przy strzale, pierścienie wirują
    const open = smooth(0, 1, prongOpen);
    for (let i = 0; i < 3; i++) prongs[i].rotation.x = -0.1 + open * 0.42 + Math.sin(t * 3 + i * 2.1) * 0.012;
    tipRing.rotation.z += spin * dt;
    tipRing.scale.setScalar(1 + open * 0.14);
    for (let i = 0; i < coils.length; i++) coils[i].scale.setScalar(1 + open * 0.05 * (i + 1) / coils.length);
    ledRing.rotation.z += spin * dt * 0.5;
  }

  function fire(colorHex) {
    kick = 1; flashK = 1; spin = 16; prongOpen = 1;
    target.set(colorHex);
  }

  return { group: gun, update, fire };
}
