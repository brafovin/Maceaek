// Kleine 3D-Vorschau des gewählten Skins im Hauptmenü (eigener Renderer auf einem Canvas im Menü).

import * as THREE from '../vendor/three.module.js';
import { makeModel } from './actors.js';

export class SkinPreview {
  constructor(canvas) {
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.r.setSize(canvas.clientWidth || 150, canvas.clientHeight || 190, false);
    this.r.toneMapping = THREE.ACESFilmicToneMapping;
    this.r.toneMappingExposure = 1.1;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xdfeeff, 0x4a4030, 1.6));
    const sun = new THREE.DirectionalLight(0xfff2dc, 2.6);
    sun.position.set(2, 4, 3);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x9fc4ff, 1.4);
    rim.position.set(-3, 2, -3);
    this.scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.6, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
    this.scene.add(floor);
    this.cam = new THREE.PerspectiveCamera(30, (canvas.clientWidth || 150) / (canvas.clientHeight || 190), 0.1, 20);
    this.cam.position.set(0, 1.25, 3.9);
    this.cam.lookAt(0, 0.92, 0);
    this.model = null;
    this.t = 0;
  }

  show(skin) {
    if (this.model) this.scene.remove(this.model.root);
    const m = this.model = makeModel(skin);
    m.holder.visible = false;
    m.glider.visible = false;
    m.pick.visible = false;
    m.armL.rotation.set(0.05, 0, 0.12); m.elbowL.rotation.x = 0.25;
    m.armR.rotation.set(0.05, 0, -0.12); m.elbowR.rotation.x = 0.25;
    m.legL.rotation.z = 0.04; m.legR.rotation.z = -0.04;
    this.scene.add(m.root);
  }

  render(dt) {
    if (!this.model) return;
    this.t += dt;
    const m = this.model;
    m.root.rotation.y = Math.PI + Math.sin(this.t * 0.6) * 0.8;      // Gesicht zur Kamera
    m.body.position.y = Math.sin(this.t * 2.2) * 0.006;
    m.head.rotation.set(Math.sin(this.t * 0.8) * 0.06, Math.sin(this.t * 0.5) * 0.2, 0);
    this.r.render(this.scene, this.cam);
  }

  dispose() {
    this.r.dispose();
    this.r.forceContextLoss();
  }
}
