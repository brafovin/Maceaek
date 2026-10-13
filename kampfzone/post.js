// Nachbearbeitung: Szene in HDR rendern (mit Kantenglättung), Leuchten (Bloom), Farbabstimmung,
// Filmic-Tonemapping und leichte Vignette.

import * as THREE from '../vendor/three.module.js';

const VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const BRIGHT = `
uniform sampler2D tSrc; uniform float uThreshold; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor = vec4(c * smoothstep(uThreshold, uThreshold + 0.6, l), 1.0);
}`;

const BLUR = `
uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 0.227027;
  c += texture2D(tSrc, vUv + uDir * 1.3846).rgb * 0.316216;
  c += texture2D(tSrc, vUv - uDir * 1.3846).rgb * 0.316216;
  c += texture2D(tSrc, vUv + uDir * 3.2308).rgb * 0.070270;
  c += texture2D(tSrc, vUv - uDir * 3.2308).rgb * 0.070270;
  gl_FragColor = vec4(c, 1.0);
}`;

const FINAL = `
uniform sampler2D tScene, tBloomA, tBloomB; uniform float uBloom, uExposure, uSat, uVignette, uContrast;
varying vec2 vUv;
vec3 kzRRT(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 kzAces(vec3 color) {
  const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color *= uExposure / 0.6;
  return clamp(OUT * kzRRT(IN * color), 0.0, 1.0);
}
vec3 kzSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  c += (texture2D(tBloomA, vUv).rgb * 0.6 + texture2D(tBloomB, vUv).rgb * 0.8) * uBloom;
  c = kzAces(c);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat);
  c = (c - 0.5) * uContrast + 0.5;
  c *= mix(vec3(1.0), vec3(1.03, 1.0, 0.96), 0.6);           // etwas wärmer
  float v = smoothstep(0.95, 0.3, length((vUv - 0.5) * vec2(1.25, 1.0)));
  c *= mix(1.0 - uVignette, 1.0, v);
  gl_FragColor = vec4(kzSRGB(clamp(c, 0.0, 1.0)), 1.0);
}`;

export class Post {
  constructor(renderer) {
    this.r = renderer;
    const hf = { type: THREE.HalfFloatType, depthBuffer: false };
    this.scene = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.a1 = new THREE.WebGLRenderTarget(4, 4, hf); this.b1 = new THREE.WebGLRenderTarget(4, 4, hf);
    this.a2 = new THREE.WebGLRenderTarget(4, 4, hf); this.b2 = new THREE.WebGLRenderTarget(4, 4, hf);
    const mk = (fs, uniforms) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
    this.mBright = mk(BRIGHT, { tSrc: { value: null }, uThreshold: { value: 1.0 } });
    this.mBlur = mk(BLUR, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.mFinal = mk(FINAL, {
      tScene: { value: null }, tBloomA: { value: null }, tBloomB: { value: null },
      uBloom: { value: 0.4 }, uExposure: { value: 1.08 }, uSat: { value: 1.06 }, uVignette: { value: 0.26 }, uContrast: { value: 1.05 },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mFinal);
    this.quad.frustumCulled = false;
    this.qs = new THREE.Scene();
    this.qs.add(this.quad);
    this.qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  setSize(w, h) {
    this.scene.setSize(w, h);
    const w1 = Math.max(4, w >> 1), h1 = Math.max(4, h >> 1), w2 = Math.max(4, w >> 2), h2 = Math.max(4, h >> 2);
    this.a1.setSize(w1, h1); this.b1.setSize(w1, h1);
    this.a2.setSize(w2, h2); this.b2.setSize(w2, h2);
    this.size = [w1, h1, w2, h2];
  }

  _pass(mat, target) {
    this.quad.material = mat;
    this.r.setRenderTarget(target);
    this.r.render(this.qs, this.qc);
  }

  render(scene, camera) {
    const r = this.r;
    r.setRenderTarget(this.scene);
    r.render(scene, camera);
    const [w1, h1, w2, h2] = this.size;
    // Glanzlichter herausfiltern und zweistufig weichzeichnen
    this.mBright.uniforms.tSrc.value = this.scene.texture;
    this._pass(this.mBright, this.a1);
    const blur = (src, dst, x, y) => { this.mBlur.uniforms.tSrc.value = src.texture; this.mBlur.uniforms.uDir.value.set(x, y); this._pass(this.mBlur, dst); };
    blur(this.a1, this.b1, 1 / w1, 0); blur(this.b1, this.a1, 0, 1 / h1);
    blur(this.a1, this.a2, 2 / w2, 0); blur(this.a2, this.b2, 0, 2 / h2);
    blur(this.b2, this.a2, 2 / w2, 0); blur(this.a2, this.b2, 0, 2 / h2);
    const u = this.mFinal.uniforms;
    u.tScene.value = this.scene.texture; u.tBloomA.value = this.a1.texture; u.tBloomB.value = this.b2.texture;
    this._pass(this.mFinal, null);
  }
}
