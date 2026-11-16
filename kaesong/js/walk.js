// 걷기: 탐사대원 캐릭터와 3인칭 조작
import * as THREE from 'three';

function mat(color, rough = 0.8) { return new THREE.MeshStandardMaterial({ color, roughness: rough }); }

export function makeExplorer() {
  const g = new THREE.Group();
  const skin = mat('#e9bf98'), jacket = mat('#e8553e', 0.7), pants = mat('#2f3d5a'), shoe = mat('#2a2a2a'), pack = mat('#f2b632', 0.7), hair = mat('#2b211c'), cap = mat('#1f6fb2', 0.6);
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  // 다리(엉덩이 축으로 흔들기)
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(s * 0.11, 0.86, 0); g.add(hip);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.62, 4, 8), pants); leg.position.y = -0.4; leg.castShadow = true; hip.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.26), shoe); foot.position.set(0, -0.82, -0.05); foot.castShadow = true; hip.add(foot);
    legs.push(hip);
  }
  add(new THREE.CapsuleGeometry(0.2, 0.42, 4, 10), jacket, 0, 1.18, 0).scale.set(1, 1, 0.75);
  add(new THREE.BoxGeometry(0.34, 0.42, 0.18), pack, 0, 1.2, 0.2);
  add(new THREE.BoxGeometry(0.28, 0.1, 0.16), pack, 0, 0.97, 0.21);
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.27, 1.42, 0); g.add(sh);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.5, 4, 8), jacket); arm.position.y = -0.3; arm.castShadow = true; sh.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), skin); hand.position.y = -0.6; sh.add(hand);
    arms.push(sh);
  }
  add(new THREE.SphereGeometry(0.16, 16, 12), skin, 0, 1.72, 0);
  add(new THREE.SphereGeometry(0.165, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 1.74, 0.01);
  add(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 16), cap, 0, 1.85, 0);
  add(new THREE.BoxGeometry(0.22, 0.03, 0.16), cap, 0, 1.83, -0.18);
  // 눈
  for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.02, 6, 4), mat('#111'), s * 0.055, 1.74, -0.15);
  g.userData = { legs, arms };
  return g;
}

export function createWalker(scene) {
  const body = makeExplorer();
  body.visible = false;
  scene.add(body);
  const shadowDisc = new THREE.Mesh(new THREE.CircleGeometry(0.4, 16), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.25, depthWrite: false }));
  shadowDisc.rotation.x = -Math.PI / 2; shadowDisc.visible = false; scene.add(shadowDisc);
  const W = {
    body, pos: new THREE.Vector3(), yaw: 0, vy: 0, onGround: true, phase: 0,
    camYaw: 0, camPitch: 0.32, camDist: 6.5, speed: 0,
    focus: null, // { target: Vector3, t, dur }
    col: null, plot: null, limitR: 60,
  };
  W.place = (x, z, yaw, col, plot) => {
    W.col = col; W.plot = plot; W.limitR = plot.R + 24;
    const y = col.groundAt(x, z, 999) ?? col.baseAt(x, z);
    W.pos.set(x, y, z); W.yaw = yaw; W.camYaw = yaw; W.vy = 0; W.focus = null;
    body.position.copy(W.pos); body.rotation.y = yaw;
    body.visible = true; shadowDisc.visible = true;
  };
  W.hide = () => { body.visible = false; shadowDisc.visible = false; };

  const tmp = new THREE.Vector3();
  let stepT = 0;
  W.update = (dt, inp, camera, onStep, onEdge) => {
    const col = W.col; if (!col) return;
    // 이동 입력(카메라 기준)
    let mx = inp.mx, mz = inp.mz;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const run = inp.run;
    const target = (run ? 6.4 : 3.3) * Math.min(1, len);
    W.speed += (target - W.speed) * Math.min(1, dt * 10);
    if (len > 0.05) {
      const fx = -Math.sin(W.camYaw), fz = -Math.cos(W.camYaw);
      const rx = Math.cos(W.camYaw), rz = -Math.sin(W.camYaw);
      const dx = fx * mz + rx * mx, dz = fz * mz + rz * mx;
      const want = Math.atan2(-dx, -dz);
      let d = want - W.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      W.yaw += d * Math.min(1, dt * 12);
      const vx = (dx / Math.hypot(dx, dz)) * W.speed * dt, vz = (dz / Math.hypot(dx, dz)) * W.speed * dt;
      const feet = W.pos.y;
      const tryMove = (nx, nz) => {
        if (col.blocked(nx, nz, feet)) return false;
        const g = col.groundAt(nx, nz, feet);
        if (g === null) return false;
        W.pos.x = nx; W.pos.z = nz;
        if (W.onGround && g < feet && feet - g < 0.7) W.pos.y = g; // 계단 내려가기
        return true;
      };
      if (!tryMove(W.pos.x + vx, W.pos.z + vz)) { if (!tryMove(W.pos.x + vx, W.pos.z)) tryMove(W.pos.x, W.pos.z + vz); }
      // 부지 바깥 제한
      const ox = W.pos.x - W.plot.x, oz = W.pos.z - W.plot.z, od = Math.hypot(ox, oz);
      if (od > W.limitR) { W.pos.x = W.plot.x + ox / od * W.limitR; W.pos.z = W.plot.z + oz / od * W.limitR; onEdge && onEdge(); }
      stepT += W.speed * dt;
      if (stepT > (run ? 1.6 : 1.3) && W.onGround) { stepT = 0; onStep && onStep(); }
    } else W.speed *= 0.8;
    // 높이와 점프
    const g = col.groundAt(W.pos.x, W.pos.z, W.pos.y) ?? W.pos.y;
    if (inp.jump && W.onGround) { W.vy = 5.2; W.onGround = false; inp.onJump && inp.onJump(); }
    W.vy -= 16 * dt;
    W.pos.y += W.vy * dt;
    if (W.pos.y <= g) { W.pos.y = g; W.vy = 0; W.onGround = true; } else if (W.pos.y - g > 0.05) W.onGround = false;
    // 몸 움직임
    body.position.copy(W.pos); body.rotation.y = W.yaw;
    W.phase += dt * W.speed * 2.4;
    const sw = Math.sin(W.phase) * Math.min(0.7, W.speed * 0.13);
    const { legs, arms } = body.userData;
    legs[0].rotation.x = sw; legs[1].rotation.x = -sw;
    arms[0].rotation.x = -sw * 0.9; arms[1].rotation.x = sw * 0.9;
    body.position.y += Math.abs(Math.cos(W.phase)) * Math.min(0.05, W.speed * 0.01);
    shadowDisc.position.set(W.pos.x, g + 0.05, W.pos.z);
    // 카메라
    const head = tmp.set(W.pos.x, W.pos.y + 1.55, W.pos.z);
    let camPos, lookAt;
    if (W.focus) {
      W.focus.t += dt;
      const k = Math.min(1, W.focus.t / 0.8) * (W.focus.t > W.focus.dur - 0.8 ? Math.max(0, (W.focus.dur - W.focus.t) / 0.8) : 1);
      const ft = W.focus.target;
      const dir = new THREE.Vector3().subVectors(ft, head); const dl = dir.length(); dir.normalize();
      const behind = head.clone().addScaledVector(dir, -Math.min(6, 2 + dl * 0.2)).add(new THREE.Vector3(0, 1.2, 0));
      const normal = orbitPos(head, W);
      camPos = normal.lerp(behind, ease(k));
      lookAt = head.clone().lerp(ft, ease(k));
      if (W.focus.t > W.focus.dur) W.focus = null;
    } else {
      camPos = orbitPos(head, W);
      lookAt = head.clone().add(new THREE.Vector3(0, 0.2, 0));
    }
    const cg = col.baseAt(camPos.x, camPos.z);
    if (camPos.y < cg + 0.5) camPos.y = cg + 0.5;
    camera.position.lerp(camPos, Math.min(1, dt * 10));
    camera.lookAt(lookAt);
  };
  return W;
}
function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function orbitPos(head, W) {
  const d = W.camDist, p = W.camPitch;
  return new THREE.Vector3(head.x + Math.sin(W.camYaw) * Math.cos(p) * d, head.y + Math.sin(p) * d, head.z + Math.cos(W.camYaw) * Math.cos(p) * d);
}
