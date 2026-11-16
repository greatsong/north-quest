// 지형·하늘·빛·안개·숲·시가지·표식
import * as THREE from 'three';
import { WORLD_W, WORLD_H, ll2w } from './geo.js';
import { rng } from './arch.js';

// 해: 남서쪽, 고도 32도
const SUN_EL = THREE.MathUtils.degToRad(32), SUN_AZ = THREE.MathUtils.degToRad(215);
export const SUN_DIR = new THREE.Vector3(Math.sin(SUN_AZ) * Math.cos(SUN_EL), Math.sin(SUN_EL), -Math.cos(SUN_AZ) * Math.cos(SUN_EL)).normalize();
const FOG_COL = new THREE.Color('#c3d3e2');

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createWorld({ renderer, scene, grid, cmImg, plots, low }) {
  const W = {};
  W.grid = grid;
  // ---------- 하늘(수평선은 옅은 안개색, 위로 갈수록 파랗게, 해 주변은 밝게) ----------
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: SUN_DIR.clone() }, uTop: { value: new THREE.Color('#3f78c4') }, uMid: { value: new THREE.Color('#8fb6e0') }, uHor: { value: FOG_COL.clone() } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vD; uniform vec3 uSun, uTop, uMid, uHor;
      void main(){
        float y = clamp(vD.y, -0.2, 1.0);
        vec3 c = mix(uHor, uMid, smoothstep(0.0, 0.18, y));
        c = mix(c, uTop, smoothstep(0.15, 0.75, y));
        c = mix(c, uHor * 0.92, smoothstep(0.0, -0.1, y));
        float s = max(dot(normalize(vD), uSun), 0.0);
        c += vec3(1.0, 0.85, 0.6) * (pow(s, 8.0) * 0.25 + pow(s, 600.0) * 3.0);
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  sky.scale.setScalar(30000);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);
  W.sky = sky;
  scene.fog = new THREE.FogExp2(FOG_COL, 0.00004);
  scene.background = FOG_COL.clone();

  // ---------- 빛 ----------
  const hemi = new THREE.HemisphereLight('#cfe0f5', '#5d5a45', 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff0d8', 2.7);
  sun.position.copy(SUN_DIR).multiplyScalar(3000);
  sun.castShadow = !low;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun); scene.add(sun.target);
  W.sun = sun;
  W.setShadowBox = (half, depth) => {
    const c = sun.shadow.camera;
    c.left = -half; c.right = half; c.top = half; c.bottom = -half; c.near = 1; c.far = depth;
    c.updateProjectionMatrix();
    sun.shadow.normalBias = half > 200 ? 2.5 : 0.08;
  };
  W.setShadowBox(80, 6000);
  W.focusShadow = (p) => {
    sun.target.position.copy(p);
    sun.position.copy(p).addScaledVector(SUN_DIR, 3000);
  };

  // ---------- 색 지도 분석(숲·물·논밭) ----------
  const gw = grid.w, gh = grid.h;
  const cvs = document.createElement('canvas'); cvs.width = gw; cvs.height = gh;
  const cx = cvs.getContext('2d', { willReadFrequently: true });
  cx.drawImage(cmImg, 0, 0, gw, gh);
  const px = cx.getImageData(0, 0, gw, gh).data;
  const forest = new Float32Array(gw * gh), water = new Uint8Array(gw * gh), flatfield = new Float32Array(gw * gh);
  for (let k = 0; k < gw * gh; k++) {
    const r = px[k * 4], g = px[k * 4 + 1], b = px[k * 4 + 2];
    const ratio = r / Math.max(1, g);
    const isW = b > g * 0.92 && b > r * 1.15;
    water[k] = isW ? 1 : 0;
    let f = sstep(0.86, 0.72, ratio);
    flatfield[k] = sstep(0.8, 0.9, ratio);
    if (isW) f = 0;
    forest[k] = f;
  }
  for (let j = 1; j < gh - 1; j++) for (let i = 1; i < gw - 1; i++) {
    const k = j * gw + i;
    const sl = Math.hypot(grid.orig[k + 1] - grid.orig[k - 1], grid.orig[k + gw] - grid.orig[k - gw]) / (2 * grid.dx);
    if (!water[k]) forest[k] = Math.max(forest[k], sstep(0.12, 0.3, sl) * 0.85);
  }
  const sampleArr = (arr, x, z) => {
    const i = Math.round((x + WORLD_W / 2) / grid.dx - 0.5), j = Math.round((z + WORLD_H / 2) / grid.dz - 0.5);
    if (i < 0 || j < 0 || i >= gw || j >= gh) return 0;
    return arr[j * gw + i];
  };
  W.forestAt = (x, z) => sampleArr(forest, x, z);
  W.waterAt = (x, z) => sampleArr(water, x, z);
  W.fieldAt = (x, z) => sampleArr(flatfield, x, z);
  const inPlot = (x, z, pad) => { for (const p of plots) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.R + Math.max(pad, pad === 14 ? (p.treePad || 0) : 0)) return true; } return false; };
  W.inPlot = inPlot;

  // ---------- 지형 ----------
  const tex = new THREE.Texture(cmImg);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  tex.needsUpdate = true;
  W.colormapTex = tex;
  // 유적 부지 안은 상세 바닥 원판만 보이도록 지형에 구멍을 낸다
  const holes = plots.map((p) => new THREE.Vector4(p.x, p.z, p.R + 1, 0));
  while (holes.length < 16) holes.push(new THREE.Vector4(0, 0, -1, 0));
  const tUni = { uTime: { value: 0 }, uDetail: { value: 1 }, uHoles: { value: holes } };
  const terrainMat = new THREE.MeshLambertMaterial({ map: tex });
  terrainMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = tUni.uTime; sh.uniforms.uDetail = tUni.uDetail; sh.uniforms.uHoles = tUni.uHoles;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWP; uniform float uTime; uniform float uDetail; uniform vec4 uHoles[16];
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      for (int i = 0; i < 16; i++) { vec4 hh = uHoles[i]; if (hh.z > 0.0 && distance(vWP.xz, hh.xy) < hh.z) discard; }
      {
        vec3 c = diffuseColor.rgb;
        vec3 s = pow(max(c, vec3(1e-4)), vec3(1.0/2.2));
        float ratio = s.r / max(s.g, 1e-3);
        float dist = length(vWP - cameraPosition);
        float isWater = step(s.g * 0.92, s.b) * step(s.r * 1.15, s.b);
        float field = smoothstep(0.80, 0.90, ratio) * (1.0 - isWater);
        // 논밭 구획: 넓은 구역마다 방향이 다르다
        vec2 big = floor(vWP.xz / 700.0);
        float ang = h21(big) * 1.2 - 0.6;
        mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
        vec2 q = rot * vWP.xz;
        vec2 cell = floor(q / vec2(70.0, 34.0));
        vec2 f = fract(q / vec2(70.0, 34.0));
        float hs = h21(cell);
        float edge = 1.0 - smoothstep(0.0, 0.04, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y) * 0.5));
        vec3 tint = mix(vec3(0.86, 1.02, 0.8), vec3(1.12, 1.04, 0.82), hs);
        tint = mix(tint, vec3(0.95, 0.92, 0.78), step(0.82, hs));
        float ff = field * smoothstep(9000.0, 2500.0, dist);
        c *= mix(vec3(1.0), tint * (1.0 - edge * 0.22), ff);
        // 가까운 곳 세부 질감
        float n = vn(vWP.xz * 0.11) * 0.45 + vn(vWP.xz * 0.6) * 0.33 + vn(vWP.xz * 2.7) * 0.22;
        float nd = smoothstep(1800.0, 150.0, dist) * uDetail;
        c *= mix(1.0, 0.78 + 0.44 * n, nd);
        // 물길 반짝임
        float sp = vn(vWP.xz * 0.05 + vec2(uTime * 0.2, uTime * 0.1));
        c = mix(c, c * vec3(0.9, 1.0, 1.15) + vec3(0.03, 0.05, 0.07) * sp, isWater);
        diffuseColor.rgb = c;
      }`);
  };
  W.terrainMat = terrainMat;
  W.tUni = tUni;
  const terrain = new THREE.Group();
  const CH = low ? 64 : 128;
  const yArr = grid.y;
  for (let cj = 0; cj < gh - 1; cj += CH) for (let ci = 0; ci < gw - 1; ci += CH) {
    const nw = Math.min(CH, gw - 1 - ci) + 1, nh = Math.min(CH, gh - 1 - cj) + 1;
    const pos = new Float32Array(nw * nh * 3), uv = new Float32Array(nw * nh * 2);
    for (let j = 0; j < nh; j++) for (let i = 0; i < nw; i++) {
      const gi = ci + i, gj = cj + j, k = j * nw + i;
      pos[k * 3] = grid.vx(gi); pos[k * 3 + 1] = yArr[gj * gw + gi]; pos[k * 3 + 2] = grid.vz(gj);
      uv[k * 2] = (gi + 0.5) / gw; uv[k * 2 + 1] = 1 - (gj + 0.5) / gh;
    }
    const idx = new Uint32Array((nw - 1) * (nh - 1) * 6); let q = 0;
    for (let j = 0; j < nh - 1; j++) for (let i = 0; i < nw - 1; i++) {
      const a = j * nw + i, b = a + 1, c = a + nw, d = c + 1;
      idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals(); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, terrainMat);
    m.receiveShadow = true;
    terrain.add(m);
  }
  // 경계 바깥 바닥(지도 끝이 허공으로 보이지 않게)
  {
    const g = new THREE.PlaneGeometry(WORLD_W * 6, WORLD_H * 6); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#6f7a55' }));
    m.position.y = -3;
    terrain.add(m);
  }
  scene.add(terrain);
  W.terrain = terrain;

  // ---------- 숲 (카메라 주변만 상세, 거리별 밀도) ----------
  const treeGeos = makeTreeGeos();
  const CAP = low ? 9000 : 42000;
  const types = treeGeos.map((t) => {
    const trunk = new THREE.InstancedMesh(t.trunk, new THREE.MeshLambertMaterial({ color: t.trunkCol }), CAP);
    const crown = new THREE.InstancedMesh(t.crown, new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), CAP);
    for (const m of [trunk, crown]) { m.castShadow = !low; m.receiveShadow = false; m.frustumCulled = false; m.count = 0; scene.add(m); }
    crown.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
    return { trunk, crown, base: t.col };
  });
  W.treeMeshes = types;
  // 먼 나무: 줄기 없는 단순 수관 하나(그림자 없음)
  const farGeo = new THREE.IcosahedronGeometry(3.6, 0); farGeo.scale(1, 1.25, 1); farGeo.translate(0, 7.5, 0);
  const farTrees = new THREE.InstancedMesh(farGeo, new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), CAP);
  farTrees.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
  farTrees.frustumCulled = false; farTrees.count = 0; scene.add(farTrees);
  const CELL = 128;
  let lastC = null, treeRadius = 3200;
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), col = new THREE.Color();
  const yAxis = new THREE.Vector3(0, 1, 0);
  W.setTreeRadius = (r) => { treeRadius = r; lastC = null; };
  W.updateTrees = (center, force) => {
    if (!force && lastC && Math.hypot(center.x - lastC.x, center.z - lastC.z) < (treeRadius > 2000 ? 160 : 50)) return;
    lastC = { x: center.x, z: center.z };
    const counts = [0, 0, 0]; let farN = 0;
    const ci0 = Math.floor((center.x - treeRadius) / CELL), ci1 = Math.floor((center.x + treeRadius) / CELL);
    const cj0 = Math.floor((center.z - treeRadius) / CELL), cj1 = Math.floor((center.z + treeRadius) / CELL);
    const NEAR = low ? 40 : 95;
    for (let cj = cj0; cj <= cj1; cj++) for (let ci = ci0; ci <= ci1; ci++) {
      const ccx = (ci + 0.5) * CELL, ccz = (cj + 0.5) * CELL;
      const dc = Math.hypot(ccx - center.x, ccz - center.z);
      if (dc > treeRadius + 90) continue;
      if (Math.abs(ccx) > WORLD_W / 2 || Math.abs(ccz) > WORLD_H / 2) continue;
      const dens = dc < 700 ? 1 : dc < 1500 ? 0.4 : dc < 2600 ? 0.17 : 0.09;
      const n = Math.round(NEAR * dens);
      const R = rng((ci * 73856093) ^ (cj * 19349663) ^ 0x5bd1e995);
      for (let k = 0; k < NEAR; k++) {
        const rx = R(), rz = R(), rp = R(), rt = R(), rs = R(), rr = R();
        if (k >= n) continue;
        const x = ci * CELL + rx * CELL, z = cj * CELL + rz * CELL;
        const fp = W.forestAt(x, z);
        if (rp > fp * 0.95 + 0.012) continue;
        if (inPlot(x, z, 14)) continue;
        if (W.inTown && W.inTown(x, z)) continue;
        if (W.waterAt(x, z)) continue;
        const y = grid.heightAt(x, z);
        const ti = rt < 0.55 ? 0 : rt < 0.85 ? 1 : 2;
        if (dens < 1) {
          if (farN >= CAP) continue;
          const sc = (0.8 + rs * 0.6) * (1 + (1 - dens) * 0.6);
          p3.set(x, y - 0.4, z); q4.setFromAxisAngle(yAxis, rr * 6.28); s3.set(sc, sc * (0.85 + rr * 0.3), sc);
          m4.compose(p3, q4, s3); farTrees.setMatrixAt(farN, m4);
          col.copy(types[ti].base).offsetHSL((rs - 0.5) * 0.04, (rr - 0.5) * 0.12, (rx - 0.5) * 0.08 - 0.03);
          farTrees.setColorAt(farN++, col);
          continue;
        }
        if (counts[ti] >= CAP) continue;
        // 먼 나무는 조금 크게 그려 듬성한 느낌을 줄인다
        const far = dens < 1 ? 1 + (1 - dens) * 0.6 : 1;
        const sc = (0.75 + rs * 0.6) * far;
        p3.set(x, y - 0.4, z); q4.setFromAxisAngle(yAxis, rr * 6.28); s3.set(sc, sc * (0.85 + rr * 0.3), sc);
        m4.compose(p3, q4, s3);
        const t = types[ti], c = counts[ti]++;
        t.trunk.setMatrixAt(c, m4); t.crown.setMatrixAt(c, m4);
        col.copy(t.base).offsetHSL((rs - 0.5) * 0.04, (rr - 0.5) * 0.12, (rx - 0.5) * 0.08);
        t.crown.setColorAt(c, col);
      }
    }
    types.forEach((t, i) => {
      t.trunk.count = t.crown.count = counts[i];
      t.trunk.instanceMatrix.needsUpdate = t.crown.instanceMatrix.needsUpdate = true;
      t.crown.instanceColor.needsUpdate = true;
    });
    farTrees.count = farN; farTrees.instanceMatrix.needsUpdate = true; farTrees.instanceColor.needsUpdate = true;
    W.treeCount = counts[0] + counts[1] + counts[2] + farN;
  };

  // ---------- 개성 시내(낮은 집들) ----------
  buildTown(W, scene, grid, inPlot, low, plots);

  W.update = (dt, t) => { tUni.uTime.value = t; };
  return W;
}

function makeTreeGeos() {
  const out = [];
  // 소나무: 붉은 줄기 + 우산 모양 수관
  {
    const trunk = new THREE.CylinderGeometry(0.22, 0.38, 9, 5); trunk.translate(0, 4.5, 0);
    const parts = [];
    for (const [x, y, z, r, sy] of [[0, 10.5, 0, 3.4, 0.45], [1.6, 9.2, 0.8, 2.4, 0.5], [-1.5, 9.6, -0.7, 2.5, 0.5], [0.3, 11.8, -0.3, 2.2, 0.45]]) {
      const g = new THREE.IcosahedronGeometry(r, 0); g.scale(1, sy, 1); g.translate(x, y, z); parts.push(g);
    }
    out.push({ trunk, crown: mergeSimple(parts), trunkCol: '#8a5536', col: new THREE.Color('#3b5f2c') });
  }
  // 활엽수(참나무류)
  {
    const trunk = new THREE.CylinderGeometry(0.25, 0.42, 6, 5); trunk.translate(0, 3, 0);
    const parts = [];
    for (const [x, y, z, r] of [[0, 8.2, 0, 3.8], [2.0, 7.0, 0.9, 2.6], [-1.9, 7.2, -1.0, 2.8], [0.4, 10.0, 0.3, 2.6]]) {
      const g = new THREE.IcosahedronGeometry(r, 0); g.scale(1, 0.8, 1); g.translate(x, y, z); parts.push(g);
    }
    out.push({ trunk, crown: mergeSimple(parts), trunkCol: '#5b4634', col: new THREE.Color('#58772f') });
  }
  // 바늘잎나무(잣나무·낙엽송 조림지)
  {
    const trunk = new THREE.CylinderGeometry(0.18, 0.3, 4, 5); trunk.translate(0, 2, 0);
    const parts = [];
    for (const [y, r, h] of [[5.5, 3.0, 6], [8.5, 2.2, 5], [11.2, 1.4, 4]]) { const g = new THREE.ConeGeometry(r, h, 7); g.translate(0, y, 0); parts.push(g); }
    out.push({ trunk, crown: mergeSimple(parts), trunkCol: '#4f3b2a', col: new THREE.Color('#2d4f2e') });
  }
  return out;
}
function mergeSimple(list) {
  const geos = list.map((g) => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n; });
  let total = 0; for (const g of geos) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3); let o = 0;
  for (const g of geos) { pos.set(g.attributes.position.array, o); o += g.attributes.position.array.length; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.computeVertexNormals();
  return g;
}

// 시가지: 남대문 주변 분지의 평지에 낮은 집과 몇 채의 아파트를 놓는다
function buildTown(W, scene, grid, inPlot, low, plots) {
  const c0 = ll2w(37.9745, 126.5555);
  const ndp = plots.find((p) => p.id === 'namdaemun');
  const nd = ndp ? { x: ndp.x, z: ndp.z } : ll2w(37.9719, 126.5564);
  const RX = 2300, RZ = 1700;
  W.inTown = (x, z) => ((x - c0.x) / (RX + 150)) ** 2 + ((z - c0.z) / (RZ + 150)) ** 2 < 1 && W.forestAt(x, z) < 0.5;
  const R = rng(777);
  const houses = [], blocks = [];
  const ang = 0.12, ca = Math.cos(ang), sa = Math.sin(ang);
  const step = low ? 22 : 15;
  for (let gz = -RZ; gz <= RZ; gz += step) for (let gx = -RX; gx <= RX; gx += step * 1.15) {
    const lx = gx + (R() - 0.5) * 4, lz = gz + (R() - 0.5) * 4;
    const x = c0.x + lx * ca - lz * sa, z = c0.z + lx * sa + lz * ca;
    const e = (lx / RX) ** 2 + (lz / RZ) ** 2;
    if (e > 1) continue;
    if (R() < Math.pow(e, 0.6) * 1.05 + 0.05) continue;
    if (W.forestAt(x, z) > 0.45 || W.waterAt(x, z)) continue;
    if (grid.slopeAt(x, z) > 0.1) continue;
    if (inPlot(x, z, 48)) continue;
    // 큰길(남대문을 지나는 남북·동서 길)은 비운다
    if (Math.abs(x - nd.x) < 16 || Math.abs(z - nd.z) < 14) continue;
    const y = grid.heightAt(x, z);
    const big = Math.abs(x - nd.x) < 160 && e < 0.45 && R() < 0.05;
    if (big) blocks.push([x, y, z, ang, 4 + Math.floor(R() * 4)]);
    else houses.push([x, y, z, ang + (R() < 0.15 ? Math.PI / 2 : 0), R()]);
  }
  const bodyG = new THREE.BoxGeometry(1, 1, 1); bodyG.translate(0, 0.5, 0);
  const roofG = new THREE.CylinderGeometry(0.0, 0.75, 1, 4, 1); roofG.rotateY(Math.PI / 4); roofG.translate(0, 0.5, 0);
  const hc = document.createElement('canvas'); hc.width = 128; hc.height = 64;
  { const x = hc.getContext('2d'); x.fillStyle = '#f2efe8'; x.fillRect(0, 0, 128, 64); x.fillStyle = '#b8b2a5'; x.fillRect(0, 56, 128, 8);
    x.fillStyle = '#4a5866'; for (const wx of [14, 50, 92]) x.fillRect(wx, 18, 20, 18); x.fillStyle = '#6d4c35'; x.fillRect(74, 30, 12, 26); }
  const htex = new THREE.CanvasTexture(hc); htex.colorSpace = THREE.SRGBColorSpace;
  const body = new THREE.InstancedMesh(bodyG, new THREE.MeshLambertMaterial({ color: '#ffffff', map: htex }), houses.length + blocks.length);
  const roofM = new THREE.InstancedMesh(roofG, new THREE.MeshLambertMaterial({ color: '#ffffff' }), houses.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
  const ax = new THREE.Vector3(0, 1, 0);
  houses.forEach(([x, y, z, a, r], i) => {
    const w = 7 + r * 5, d = 5 + r * 2.5, h = 2.8 + (r > 0.8 ? 3 : 0);
    q.setFromAxisAngle(ax, a);
    p.set(x, y - 0.5, z); s.set(w, h + 0.5, d); m4.compose(p, q, s); body.setMatrixAt(i, m4);
    col.set(r > 0.8 ? '#d9d6cf' : r > 0.4 ? '#e4ddcc' : '#cfc6b4'); body.setColorAt(i, col);
    p.set(x, y + h, z); s.set(w * 1.25, 1.8 + r * 0.6, d * 1.4); m4.compose(p, q, s); roofM.setMatrixAt(i, m4);
    col.set(r > 0.8 ? '#7d8a8f' : r > 0.3 ? '#4c5357' : '#6b5e52'); roofM.setColorAt(i, col);
  });
  blocks.forEach(([x, y, z, a, fl], k) => {
    const i = houses.length + k;
    q.setFromAxisAngle(ax, a);
    p.set(x, y - 0.5, z); s.set(40, fl * 3 + 0.5, 11); m4.compose(p, q, s); body.setMatrixAt(i, m4);
    col.set(k % 3 ? '#e2ddd2' : '#d6dbe0'); body.setColorAt(i, col);
  });
  body.castShadow = roofM.castShadow = !low; body.receiveShadow = roofM.receiveShadow = true;
  scene.add(body); scene.add(roofM);
  W.town = { body, roof: roofM, count: houses.length + blocks.length };
}

// 드론 시점의 유적 표식(빛기둥과 바닥 고리)
export function makeBeacon(color = '#ffcc4d') {
  const g = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uCol: { value: new THREE.Color(color) }, uTime: { value: 0 }, uOp: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec2 vUv; uniform vec3 uCol; uniform float uTime; uniform float uOp;
      void main(){ float a = pow(1.0 - vUv.y, 1.6) * 0.75; a *= 0.75 + 0.25 * sin(vUv.y * 40.0 - uTime * 4.0);
        gl_FragColor = vec4(uCol * 1.4, a * uOp); }`,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(9, 14, 420, 20, 1, true), mat);
  beam.position.y = 210;
  g.add(beam);
  const ring = new THREE.Mesh(new THREE.RingGeometry(26, 34, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 3;
  g.add(ring);
  g.userData = { mat, ring };
  return g;
}
