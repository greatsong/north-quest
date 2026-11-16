// 드론: 모형, 자유 비행, 자동 비행, 시작 연출 경로
import * as THREE from 'three';
import { WORLD_W, WORLD_H } from './geo.js';

export function makeDroneModel() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: '#f1f3f5', roughness: 0.35, metalness: 0.1 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2b2f36', roughness: 0.5 });
  const acc = new THREE.MeshStandardMaterial({ color: '#ff7a3d', roughness: 0.4, emissive: '#ff5a1d', emissiveIntensity: 0.25 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.5, 6, 12), white); body.rotation.x = Math.PI / 2; body.scale.set(1.25, 1, 0.7); g.add(body);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.4), acc); top.position.y = 0.16; g.add(top);
  const cam = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), dark); cam.position.set(0, -0.16, -0.35); g.add(cam);
  const rotors = [];
  for (const [x, z] of [[0.55, 0.45], [-0.55, 0.45], [0.55, -0.45], [-0.55, -0.45]]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.75), dark);
    arm.position.set(x / 2, 0.02, z / 2); arm.rotation.y = Math.atan2(x, z); g.add(arm);
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 10), dark); motor.position.set(x, 0.06, z); g.add(motor);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.01, 24), new THREE.MeshBasicMaterial({ color: '#cfd8e3', transparent: true, opacity: 0.28, depthWrite: false }));
    disc.position.set(x, 0.12, z); g.add(disc);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.012, 0.05), dark); blade.position.set(x, 0.125, z); g.add(blade);
    rotors.push(blade);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), new THREE.MeshBasicMaterial({ color: z < 0 ? '#ffffff' : '#ff3344' })); led.position.set(x, -0.02, z); g.add(led);
  }
  for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.5), dark); leg.position.set(s * 0.18, -0.2, 0); g.add(leg); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.rotors = rotors;
  return g;
}

export function createDrone(scene, grid) {
  const model = makeDroneModel();
  model.scale.setScalar(2.2); // 멀리서도 보이게 실제보다 조금 크게
  scene.add(model);
  const D = {
    model, pos: new THREE.Vector3(0, 600, 4000), vel: new THREE.Vector3(), yaw: 0, tilt: new THREE.Vector2(),
    camYawOff: 0, camPitch: -0.32, camDist: 26, auto: null, active: false,
  };
  const tmp = new THREE.Vector3();
  D.groundAt = (x, z) => grid.heightAt(x, z);
  D.place = (x, y, z, yaw) => { D.pos.set(x, y, z); D.yaw = yaw; D.vel.set(0, 0, 0); D.auto = null; };
  // 자동 비행: to(Vector3), yaw, dur, done
  D.flyTo = (to, yaw, dur, done) => {
    D.auto = { from: D.pos.clone(), to: to.clone(), y0: D.yaw, y1: yaw, t: 0, dur, done, peak: Math.max(D.pos.y, to.y) + Math.min(400, D.pos.distanceTo(to) * 0.08) };
  };
  D.spinRotors = (dt, rate = 60) => { for (const r of model.userData.rotors) r.rotation.y += dt * rate; };
  D.update = (dt, inp, camera, opts = {}) => {
    D.spinRotors(dt);
    if (D.auto) {
      const a = D.auto; a.t += dt;
      const k = Math.min(1, a.t / a.dur), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      D.pos.lerpVectors(a.from, a.to, e);
      D.pos.y = THREE.MathUtils.lerp(a.from.y, a.to.y, e) + Math.sin(k * Math.PI) * (a.peak - Math.max(a.from.y, a.to.y)) * 0.6;
      let dy = a.y1 - a.y0; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      D.yaw = a.y0 + dy * Math.min(1, k * 1.6);
      D.tilt.set(-Math.sin(k * Math.PI) * 0.25, 0);
      if (k >= 1) { D.auto = null; a.done && a.done(); }
    } else {
      const boost = inp.run ? 3.2 : 1;
      const fwd = inp.mz, side = inp.strafe || 0;
      D.yaw -= (inp.turn || 0) * dt * 1.5;
      const fx = -Math.sin(D.yaw), fz = -Math.cos(D.yaw), rx = Math.cos(D.yaw), rz = -Math.sin(D.yaw);
      const sp = 75 * boost;
      const want = tmp.set((fx * fwd + rx * side) * sp, (inp.up || 0) * 45 * (inp.run ? 2 : 1), (fz * fwd + rz * side) * sp);
      D.vel.lerp(want, Math.min(1, dt * 2.2));
      D.pos.addScaledVector(D.vel, dt);
      D.tilt.x += ((-fwd * 0.28 * Math.min(1, boost * 0.6)) - D.tilt.x) * Math.min(1, dt * 4);
      D.tilt.y += ((side * 0.3 + (inp.turn || 0) * 0.15) - D.tilt.y) * Math.min(1, dt * 4);
    }
    // 지형 위 높이 제한
    const g = D.groundAt(D.pos.x, D.pos.z);
    const minY = g + (opts.minAgl ?? 35);
    if (D.pos.y < minY) { D.pos.y += (minY - D.pos.y) * Math.min(1, dt * 6); if (D.vel.y < 0) D.vel.y = 0; }
    if (D.pos.y > 2600) { D.pos.y = 2600; D.vel.y = Math.min(0, D.vel.y); }
    D.pos.x = THREE.MathUtils.clamp(D.pos.x, -WORLD_W / 2 + 200, WORLD_W / 2 - 200);
    D.pos.z = THREE.MathUtils.clamp(D.pos.z, -WORLD_H / 2 + 200, WORLD_H / 2 - 200);
    model.position.copy(D.pos);
    model.position.y += Math.sin(performance.now() / 400) * 0.15;
    model.rotation.set(D.tilt.x, D.yaw, D.tilt.y, 'YXZ');
    if (camera && !opts.noCam) {
      const cy = D.yaw + D.camYawOff;
      const dist = D.camDist, p = D.camPitch;
      const want = tmp.set(D.pos.x + Math.sin(cy) * Math.cos(p) * dist, D.pos.y - Math.sin(p) * dist + 3, D.pos.z + Math.cos(cy) * Math.cos(p) * dist);
      const cg = D.groundAt(want.x, want.z) + 4;
      if (want.y < cg) want.y = cg;
      camera.position.lerp(want, Math.min(1, dt * 5));
      const look = new THREE.Vector3(D.pos.x - Math.sin(cy) * 40, D.pos.y - 8 + p * 30, D.pos.z - Math.cos(cy) * 40);
      camera.lookAt(look);
      if (!inp.dragging) D.camYawOff *= Math.pow(0.35, dt);
    }
  };
  return D;
}

// 시작 연출 경로: 남쪽 하늘에서 개성으로
export function introPath(ll) {
  const P = (lat, lon, y) => { const w = ll(lat, lon); return new THREE.Vector3(w.x, y, w.z); };
  const cam = new THREE.CatmullRomCurve3([
    P(37.905, 126.625, 1500), P(37.925, 126.615, 1050), P(37.948, 126.585, 700), P(37.963, 126.561, 430),
    P(37.972, 126.559, 330), P(37.978, 126.553, 360), P(37.981, 126.546, 380), P(37.978, 126.538, 520), P(37.962, 126.545, 900),
  ], false, 'catmullrom', 0.4);
  const look = new THREE.CatmullRomCurve3([
    P(37.94, 126.61, 0), P(37.935, 126.62, 30), P(37.955, 126.575, 40), P(37.9719, 126.5564, 40),
    P(37.9764, 126.566, 40), P(37.985, 126.543, 60), P(37.985, 126.543, 70), P(38.0036, 126.5361, 300), P(37.995, 126.54, 200),
  ], false, 'catmullrom', 0.4);
  return { cam, look };
}
