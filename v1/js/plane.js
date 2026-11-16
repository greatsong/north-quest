// 로우폴리 탐사 비행기 모델과 아케이드식 비행
import * as THREE from 'three';
import { WORLD_W, WORLD_H } from '../../shared/geo.js';

function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.55, metalness: 0.05, ...extra });
}

export function buildPlaneModel() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const cream = std('#fff4e2'), coral = std('#ff5a4e'), teal = std('#15b3a3'), dark = std('#2b2f3a');
  const glass = std('#8fe6ff', { emissive: '#2a7f99', emissiveIntensity: 0.6, roughness: 0.15, metalness: 0.3 });

  const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.36, 2.3, 9).rotateX(Math.PI / 2), cream);
  fus.position.z = 0.05;
  const belly = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.365, 0.8, 9, 1, true, Math.PI * 0.62, Math.PI * 0.76).rotateX(Math.PI / 2), coral);
  belly.position.z = -0.45;
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.36, 9, 6).scale(1, 1, 0.75), coral);
  nose.position.z = -1.1;
  const cock = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.9, 1.6), glass);
  cock.position.set(0, 0.2, -0.25);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.09, 0.62), coral);
  wing.position.set(0, -0.06, -0.25);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.62, 0.1, 0.16), cream);
  stripe.position.set(0, -0.05, -0.08);
  const tipL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.66), teal); tipL.position.set(-1.85, -0.04, -0.25);
  const tipR = tipL.clone(); tipR.position.x = 1.85;
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.62, 0.5), coral);
  fin.position.set(0, 0.38, 1.0);
  fin.geometry.translate(0, 0, 0);
  const stab = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.07, 0.38), teal);
  stab.position.set(0, 0.08, 1.05);
  const hub = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 8).rotateX(-Math.PI / 2), teal);
  hub.position.z = -1.48;
  const prop = new THREE.Group();
  prop.position.z = -1.42;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.04), dark);
  const blade2 = blade.clone(); blade2.rotation.z = Math.PI / 2;
  prop.add(blade, blade2);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.62, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
  disc.position.z = -1.43;
  // 작은 바퀴
  const wheelGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.08, 8).rotateZ(Math.PI / 2);
  const wl = new THREE.Mesh(wheelGeo, dark); wl.position.set(-0.4, -0.42, -0.45);
  const wr = wl.clone(); wr.position.x = 0.4;
  const strutGeo = new THREE.BoxGeometry(0.05, 0.3, 0.05);
  const sl = new THREE.Mesh(strutGeo, cream); sl.position.set(-0.36, -0.28, -0.45);
  const sr = sl.clone(); sr.position.x = 0.36;
  body.add(fus, belly, nose, cock, wing, stripe, tipL, tipR, fin, stab, hub, prop, disc, wl, wr, sl, sr);
  root.userData = { prop, body, tipL, tipR };
  return root;
}

const FWD = new THREE.Vector3();

export class Plane {
  constructor(scene, world) {
    this.world = world;
    this.mesh = buildPlaneModel();
    scene.add(this.mesh);
    this.pos = new THREE.Vector3();
    this.yaw = 0; this.roll = 0; this.pitch = 0;
    this.speed = 10; this.vy = 0;
    this.boosting = false;
    this.bumpCd = 0;
    this.edgeCd = 0;
    this.trail = new Trail(scene);
  }

  place(x, z, yaw, alt = 8) {
    this.pos.set(x, this.world.floorAt(x, z) + alt, z);
    this.yaw = yaw; this.roll = 0; this.pitch = 0; this.vy = 0;
    this.apply(0);
  }

  forward(out = FWD) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }

  /** input: {turn, climb, boost}, o: {base, boostMul, slowMul, assist} */
  update(dt, input, o) {
    const ev = { bumped: false, edge: false };
    this.bumpCd -= dt; this.edgeCd -= dt;
    const turn = THREE.MathUtils.clamp(input.turn, -1, 1);
    this.yaw += turn * 1.45 * dt;
    this.boosting = !!input.boost && o.canBoost;
    const target = o.base * (this.boosting ? o.boostMul : 1) * (o.slowMul || 1);
    this.speed += (target - this.speed) * (1 - Math.exp(-dt * 2.2));
    const targetVy = THREE.MathUtils.clamp(input.climb, -1, 1) * 9;
    this.vy += (targetVy - this.vy) * (1 - Math.exp(-dt * 4));

    const f = this.forward();
    this.pos.addScaledVector(f, this.speed * dt);
    this.pos.y += this.vy * dt;

    // 지형 위로 튕겨 오르기 (추락 없음)
    const w = this.world;
    const floor = w.floorAt(this.pos.x, this.pos.z) + 0.9;
    const ahead = w.floorAt(this.pos.x + f.x * 5, this.pos.z + f.z * 5) + 1.4;
    if (o.assist && this.pos.y < ahead && input.climb <= 0.2) this.vy = Math.max(this.vy, (ahead - this.pos.y) * 2.5 * o.assist);
    if (this.pos.y < floor) {
      const hit = floor - this.pos.y;
      this.pos.y = floor;
      if (this.vy < 0 || hit > 0.3) {
        this.vy = Math.max(4, Math.abs(this.vy) * 0.6 + 3);
        if (this.bumpCd <= 0) { ev.bumped = true; this.bumpCd = 0.7; }
      }
    }
    if (this.pos.y > 48) { this.pos.y = 48; this.vy = Math.min(this.vy, 0); }

    // 지도 가장자리: 안쪽으로 돌림
    const pad = 12;
    if (Math.abs(this.pos.x) > WORLD_W / 2 - pad || Math.abs(this.pos.z) > WORLD_H / 2 - pad) {
      const toC = Math.atan2(this.pos.x, this.pos.z); // 원점 쪽 방향 yaw
      let d = toC - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 2.5);
      this.pos.x = THREE.MathUtils.clamp(this.pos.x, -WORLD_W / 2 + pad * 0.5, WORLD_W / 2 - pad * 0.5);
      this.pos.z = THREE.MathUtils.clamp(this.pos.z, -WORLD_H / 2 + pad * 0.5, WORLD_H / 2 - pad * 0.5);
      if (this.edgeCd <= 0) { ev.edge = true; this.edgeCd = 3; }
    }

    this.roll += (turn * 0.75 - this.roll) * (1 - Math.exp(-dt * 5));
    this.pitch += (THREE.MathUtils.clamp(this.vy * 0.06, -0.5, 0.5) - this.pitch) * (1 - Math.exp(-dt * 5));
    this.apply(dt);
    if (this.boosting) {
      const u = this.mesh.userData;
      this.trail.emitFrom(u.tipL, 1);
      this.trail.emitFrom(u.tipR, 1);
    }
    this.trail.update(dt);
    return ev;
  }

  /** 자동 비행(타이틀 화면) */
  autopilot(dt, t, center, radius) {
    const ang = t * 0.09;
    const x = center.x + Math.cos(ang) * radius, z = center.z + Math.sin(ang) * radius;
    const nx = center.x + Math.cos(ang + 0.05) * radius, nz = center.z + Math.sin(ang + 0.05) * radius;
    const yawT = Math.atan2(-(nx - x), -(nz - z));
    let maxG = 0;
    for (let k = 0; k < 6; k++) {
      const a = ang + k * 0.03;
      maxG = Math.max(maxG, this.world.floorAt(center.x + Math.cos(a) * radius, center.z + Math.sin(a) * radius));
    }
    const ty = maxG + 7 + Math.sin(t * 0.7) * 1.5;
    this.pos.y += (ty - this.pos.y) * (1 - Math.exp(-dt * 1.2));
    this.pos.x = x; this.pos.z = z;
    let d = yawT - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d;
    this.roll += (0.35 + Math.sin(t * 0.5) * 0.1 - this.roll) * (1 - Math.exp(-dt * 2));
    this.pitch = Math.sin(t * 0.7) * 0.05;
    this.speed = 0.09 * radius;
    this.apply(dt);
    this.trail.update(dt);
  }

  idle(dt, t) {
    // 카드가 열려 있는 동안 제자리에서 흔들리기
    this.roll += (Math.sin(t * 1.2) * 0.12 - this.roll) * (1 - Math.exp(-dt * 2));
    this.pitch += (Math.sin(t * 0.9) * 0.05 - this.pitch) * (1 - Math.exp(-dt * 2));
    this.apply(dt, Math.sin(t * 1.5) * 0.25);
    this.trail.update(dt);
  }

  apply(dt, bob = 0) {
    this.mesh.position.copy(this.pos);
    this.mesh.position.y += bob;
    this.mesh.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    this.mesh.userData.prop.rotation.z += dt * (25 + this.speed * 2);
  }
}

// 날개 끝 비행운
class Trail {
  constructor(scene) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    this.pool = [];
    for (let i = 0; i < 90; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false; s.userData.life = 0;
      scene.add(s); this.pool.push(s);
    }
    this.i = 0;
    this.v = new THREE.Vector3();
  }

  emitFrom(obj, n) {
    for (let k = 0; k < n; k++) {
      const s = this.pool[this.i]; this.i = (this.i + 1) % this.pool.length;
      obj.getWorldPosition(this.v);
      s.position.copy(this.v);
      s.visible = true; s.userData.life = 1;
      s.scale.setScalar(0.35);
    }
  }

  update(dt) {
    for (const s of this.pool) {
      if (!s.visible) continue;
      s.userData.life -= dt * 1.6;
      if (s.userData.life <= 0) { s.visible = false; continue; }
      s.material.opacity = s.userData.life * 0.7;
      s.scale.setScalar(0.35 + (1 - s.userData.life) * 1.2);
    }
  }
}
