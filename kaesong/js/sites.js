// 유적 부지 설정과 모형 (부지 좌표: 원점 = 부지 중심, x = 동, z = 남, y = 부지 바닥 높이 기준)
import * as THREE from 'three';
import { Kit, mats, hanok, roof, wall, stele, lantern, pillarStone, tableStone, official, stoneBeast, mound, rockGeo, tree, rng } from './arch.js';
import { ll2w } from './geo.js';

// ---------- 공통 부품 ----------
function gate3(kit, x, z, ry = 0, { w = 9, tall = true, h = 3.0, openCenter = true } = {}) {
  const M = mats();
  kit.at(x, 0, z, ry, () => {
    kit.box(w + 1.2, 0.35, 3.4, M.granite, 0, 0, 0);
    kit.floor(0, 0, w / 2 + 0.6, 1.7, 0.35);
    const xs = [-w / 2, -w / 6, w / 6, w / 2];
    for (const px of xs) for (const pz of [-1.0, 1.0]) { kit.cyl(0.19, 0.21, h, M.pillar, px, 0.35, pz, 10); }
    for (const px of xs) kit.solidCircle(px, 0, 0.3, h + 1);
    // 문짝: 양쪽은 닫힘, 가운데는 열림
    for (const s of [-1, 1]) {
      kit.box(w / 3 - 0.4, h - 0.6, 0.12, M.door, s * w / 3, 0.35, 0);
      kit.solidBox(s * w / 3, 0, w / 6, 0.2, h);
    }
    if (openCenter) for (const s of [-1, 1]) kit.box(w / 6 - 0.2, h - 0.6, 0.1, M.door, s * (w / 6 - 0.1), 0.35, 0.75, s * 1.35);
    else kit.box(w / 3 - 0.4, h - 0.6, 0.12, M.door, 0, 0.35, 0);
    kit.box(w + 0.2, 0.3, 2.4, M.green, 0, h + 0.3, 0);
    if (tall) {
      roof(kit, { a: w / 6 + 1.0, b: 2.2, H: 1.7, e: 0, lift: 0.15, y: h + 1.05, ridgeH: 0.35, gin: 0.9 });
      for (const s of [-1, 1]) roof(kit, { a: w / 6 + 0.6, b: 2.0, H: 1.4, e: 0, lift: 0.12, x: s * (w / 3 + 0.3), y: h + 0.55, ridgeH: 0.3, gin: 0.7 });
    } else roof(kit, { a: w / 2 + 1.0, b: 2.2, H: 1.6, e: 0, lift: 0.15, y: h + 0.6, ridgeH: 0.35, gin: 0.9 });
  });
}
function terraceBox(kit, x, z, hw, hd, top, wallMat, topMat) {
  const M = mats();
  kit.box(hw * 2, top + 2, hd * 2, wallMat || M.masonDark, x, -2, z);
  kit.box(hw * 2 - 0.1, 0.06, hd * 2 - 0.1, topMat || M.grass, x, top, z);
  kit.floor(x, z, hw, hd, top + 0.06);
}
// 계단(디딤돌을 하나씩) + 경사 바닥. 앞(+z)에서 뒤(-z)로 올라가며 zEdge(윗단 가장자리)에서 끝난다.
function stairs(kit, x, zEdge, w, y0, y1, run = 0.3, mat, nSteps) {
  const M = mats();
  const n = nSteps || Math.max(2, Math.round((y1 - y0) / 0.17));
  const rise = (y1 - y0) / n, len = n * run;
  const zFront = zEdge + len;
  for (let i = 0; i < n; i++) {
    const zz = zFront - i * run - run / 2;
    kit.box(w, y0 + rise * (i + 1) + 1, run + 0.02, mat || M.granite, x, -1, zz);
  }
  // 소맷돌
  for (const s of [-1, 1]) {
    const g = new THREE.BoxGeometry(0.4, 0.5, Math.hypot(len, y1 - y0));
    kit.add(g, M.granite, kit.matrix(x + s * (w / 2 + 0.2), (y0 + y1) / 2 + 0.25, zFront - len / 2, 0, 1, 1, 1, Math.atan2(y1 - y0, len)));
  }
  kit.floor(x, zFront - len / 2, w / 2, len / 2, y1, 0, [y0 + 0.02, y1 + 0.02]);
  return len;
}
function boulders(kit, list, mat) {
  const M = mats();
  list.forEach(([x, z, r, sq = 0.6, y = 0], i) => {
    kit.add(rockGeo(r, i * 13 + 7, sq, 1), mat || M.rock, kit.matrix(x, y + r * sq * 0.45, z, i));
    kit.solidCircle(x, z, r * 0.85, y + r * sq);
  });
}

// ---------- 바닥 그림(부지 바닥 질감) ----------
let patCache = null;
function pats(ctx) {
  if (patCache) return patCache;
  const mk = (draw, n = 128) => { const c = document.createElement('canvas'); c.width = c.height = n; draw(c.getContext('2d'), n); return c; };
  const noise = (x, n, base, amp, R) => { x.fillStyle = base; x.fillRect(0, 0, n, n); for (let i = 0; i < n * n * 0.6; i++) { const v = (R() - 0.5) * amp; x.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 255})`; x.fillRect(R() * n, R() * n, 1 + R() * 2, 1 + R() * 2); } };
  const R = rng(99);
  patCache = {
    grass: mk((x, n) => { noise(x, n, '#5f7b3a', 70, R); for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${120 + R() * 60},${150 + R() * 50},${60 + R() * 30},0.35)`; x.fillRect(R() * n, R() * n, 1, 3); } }),
    gravel: mk((x, n) => noise(x, n, '#b8ad96', 90, R)),
    dirt: mk((x, n) => noise(x, n, '#8f7a5c', 70, R)),
    paving: mk((x, n) => { x.fillStyle = '#86837a'; x.fillRect(0, 0, n, n); for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const v = (R() - 0.5) * 26; x.fillStyle = `rgb(${172 + v},${168 + v},${158 + v})`; x.fillRect(i * 32 + 1, j * 32 + 1, 30, 30); } }),
    asphalt: mk((x, n) => noise(x, n, '#55575a', 50, R)),
    concrete: mk((x, n) => { noise(x, n, '#a9a7a0', 40, R); x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, 0, n, 2); x.fillRect(0, 0, 2, n); }),
    sand: mk((x, n) => noise(x, n, '#c2b59a', 60, R)),
  };
  return patCache;
}
function P(ctx, name, meters = 3) {
  const p = ctx.createPattern(pats(ctx)[name], 'repeat');
  p.setTransform(new DOMMatrix().scale(meters / 128));
  return p;
}
function rect(ctx, pat, x, z, w, d, m) { ctx.fillStyle = P(ctx, pat, m); ctx.fillRect(x - w / 2, z - d / 2, w, d); }
function circ(ctx, pat, x, z, r, m) { ctx.fillStyle = P(ctx, pat, m); ctx.beginPath(); ctx.arc(x, z, r, 0, Math.PI * 2); ctx.fill(); }
function path(ctx, pat, pts, wdt, m) {
  ctx.strokeStyle = P(ctx, pat, m); ctx.lineWidth = wdt; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); pts.forEach(([x, z], i) => (i ? ctx.lineTo(x, z) : ctx.moveTo(x, z))); ctx.stroke();
}

// ---------- 물 재질 ----------
let waterMat = null, waterNormal = null;
export function getWaterMat() {
  if (waterMat) return waterMat;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), img = x.createImageData(128, 128);
  const R = rng(5); const hgt = new Float32Array(128 * 128);
  for (let k = 0; k < 6; k++) { const fx = 1 + Math.floor(R() * 4), fy = 1 + Math.floor(R() * 4), ph = R() * 6; for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) hgt[j * 128 + i] += Math.sin((i * fx + j * fy) / 128 * Math.PI * 2 + ph); }
  for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) {
    const dx = hgt[j * 128 + ((i + 1) % 128)] - hgt[j * 128 + ((i + 127) % 128)], dy = hgt[((j + 1) % 128) * 128 + i] - hgt[((j + 127) % 128) * 128 + i];
    const v = new THREE.Vector3(-dx * 0.6, -dy * 0.6, 1).normalize(), k = (j * 128 + i) * 4;
    img.data[k] = (v.x * 0.5 + 0.5) * 255; img.data[k + 1] = (v.y * 0.5 + 0.5) * 255; img.data[k + 2] = (v.z * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  waterNormal = new THREE.CanvasTexture(c); waterNormal.wrapS = waterNormal.wrapT = THREE.RepeatWrapping; waterNormal.repeat.set(0.3, 0.3);
  waterMat = new THREE.MeshStandardMaterial({ color: '#4f8a8a', roughness: 0.12, metalness: 0.1, normalMap: waterNormal, transparent: true, opacity: 0.85 });
  return waterMat;
}
export function animateWater(t) { if (waterNormal) { waterNormal.offset.set(t * 0.02, t * 0.035); } }

function waterfallMat() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uTime;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
      void main(){
        float y = vUv.y * 8.0 + uTime * 2.6;
        float s = n(vec2(vUv.x * 22.0, y)) * 0.6 + n(vec2(vUv.x * 55.0, y * 2.3)) * 0.4;
        float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
        float a = (0.35 + s * 0.65) * edge;
        a *= smoothstep(0.0, 0.05, vUv.y);
        vec3 col = mix(vec3(0.72, 0.84, 0.88), vec3(1.0), s);
        gl_FragColor = vec4(col, a * 0.92);
      }`,
  });
}
function softDot() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// ---------- 부지 목록 ----------
// obs: { site, s(설명 문장 번호), at:[x,z](다가가는 곳), look:[x,y,z](볼 것), name }
export const PLOTS = [
  {
    id: 'namdaemun', members: ['namdaemun'], lat: 37.9692, lon: 126.5581, R: 46, spawn: [0, 32, 0],
    marks: { namdaemun: [0, 0] },
    obs: [
      { site: 'namdaemun', s: 0, at: [0, 9.5], look: [0, 3.2, 4.8], name: '홍예문' },
      { site: 'namdaemun', s: 1, at: [0, -10.5], look: [0, 9.2, 0], name: '문루의 연복사 종' },
      { site: 'namdaemun', s: 2, at: [-12, 3], look: [-7.5, 3.5, 4.8], name: '육축 돌벽' },
      { site: 'namdaemun', s: 3, at: [11, -7], look: [4, 12.5, 0], name: '문루 지붕' },
    ],
    paint(ctx) {
      rect(ctx, 'grass', 0, 0, 200, 200, 4);
      circ(ctx, 'paving', 0, 0, 24, 3);
      rect(ctx, 'asphalt', 0, 0, 9, 200, 3);
      rect(ctx, 'asphalt', 0, 30, 200, 10, 3);
      rect(ctx, 'paving', 0, 0, 22, 14, 3);
    },
    build(kit) {
      const M = mats();
      const W2 = 8.6, H = 6.6, D = 9.6, AW = 2.15, AS = 3.3;
      // 육축: 홍예 통로가 뚫린 돌 축대
      const sh = new THREE.Shape();
      sh.moveTo(-W2, 0); sh.lineTo(-AW, 0); sh.lineTo(-AW, AS); sh.absarc(0, AS, AW, Math.PI, 0, true); sh.lineTo(AW, 0); sh.lineTo(W2, 0); sh.lineTo(W2, H); sh.lineTo(-W2, H); sh.lineTo(-W2, 0);
      const eg = new THREE.ExtrudeGeometry(sh, { depth: D, bevelEnabled: false, curveSegments: 18 });
      eg.translate(0, 0, -D / 2);
      kit.add(eg, M.mason, kit.matrix(0, 0, 0));
      // 홍예석(아치 테두리)
      const ring = new THREE.Shape();
      ring.absarc(0, AS, AW + 0.6, 0, Math.PI, false); ring.lineTo(-AW, AS); ring.absarc(0, AS, AW, Math.PI, 0, true); ring.lineTo(AW + 0.6, AS);
      const rg = new THREE.ExtrudeGeometry(ring, { depth: 0.12, bevelEnabled: false, curveSegments: 18 });
      for (const s of [1, -1]) kit.add(rg, M.granite, kit.matrix(0, 0, s * (D / 2 + (s > 0 ? 0 : 0.12)), 0));
      for (const s of [1, -1]) for (const sx of [-1, 1]) kit.box(0.6, AS, 0.12, M.granite, sx * (AW + 0.3), 0, s * (D / 2 + 0.06));
      // 담쟁이: 사진처럼 육축 벽면을 덮은 덩굴
      for (const s of [1, -1]) for (const sx of [-1, 1]) {
        const g = new THREE.PlaneGeometry(W2 - AW - 0.7, H - 0.3);
        kit.add(g, M.ivy, kit.matrix(sx * (AW + 0.6 + (W2 - AW - 0.7) / 2), (H - 0.3) / 2 + 0.1, s * (D / 2 + 0.14), s > 0 ? 0 : Math.PI));
      }
      for (const sx of [-1, 1]) { const g = new THREE.PlaneGeometry(D - 0.4, H - 0.6); kit.add(g, M.ivy, kit.matrix(sx * (W2 + 0.08), (H - 0.6) / 2 + 0.3, 0, sx * Math.PI / 2)); }
      { const g = new THREE.PlaneGeometry(2 * AW + 1.2, H - AS - AW - 0.6); kit.add(g, M.ivy, kit.matrix(0, AS + AW + 0.6 + (H - AS - AW - 0.6) / 2, D / 2 + 0.14)); kit.add(g, M.ivy, kit.matrix(0, AS + AW + 0.6 + (H - AS - AW - 0.6) / 2, -D / 2 - 0.14, Math.PI)); }
      // 위 바닥과 여장
      kit.box(2 * W2 - 0.2, 0.12, D - 0.2, M.paving, 0, H, 0);
      const seg = (x1, z1, x2, z2) => {
        const len = Math.hypot(x2 - x1, z2 - z1), ry = Math.atan2(-(z2 - z1), x2 - x1), n = Math.max(1, Math.round(len / 2.1));
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n, cx = x1 + (x2 - x1) * t, cz = z1 + (z2 - z1) * t;
          kit.box(len / n - 0.16, 0.85, 0.5, M.mason, cx, H, cz, ry);
          kit.box(len / n - 0.1, 0.1, 0.58, M.granite, cx, H + 0.85, cz, ry);
        }
      };
      seg(-W2 + 0.25, D / 2 - 0.25, W2 - 0.25, D / 2 - 0.25); seg(-W2 + 0.25, -D / 2 + 0.25, W2 - 0.25, -D / 2 + 0.25);
      seg(W2 - 0.25, D / 2 - 0.8, W2 - 0.25, -D / 2 + 0.8); seg(-W2 + 0.25, D / 2 - 0.8, -W2 + 0.25, -D / 2 + 0.8);
      kit.solidBox(-(W2 + AW) / 2, 0, (W2 - AW) / 2, D / 2, H + 12);
      kit.solidBox((W2 + AW) / 2, 0, (W2 - AW) / 2, D / 2, H + 12);
      // 문루: 앞면 3칸, 옆면 2칸, 팔작지붕
      kit.at(0, H + 0.1, 0, 0, () => {
        hanok(kit, { bx: [3.3, 3.8, 3.3], bz: [2.7, 2.7], colH: 3.9, plat: 0.3, platPad: 0.45, open: true, steps: false, over: 2.1, lift: 0.85 });
        // 연복사 종(높이 약 3.2m)
        const pr = [[0.98, 0], [0.93, 0.12], [0.84, 0.5], [0.76, 1.2], [0.71, 2.0], [0.69, 2.7], [0.64, 3.0], [0.45, 3.18], [0.0, 3.24]].map(([r, y]) => new THREE.Vector2(r, y));
        kit.add(new THREE.LatheGeometry(pr, 28), M.bronze, kit.matrix(0, 0.75, 0));
        kit.add(new THREE.TorusGeometry(0.42, 0.08, 6, 14, Math.PI * 2), M.bronze, kit.matrix(0, 0.4 + 3.24 + 0.32, 0, 0, 1, 1, 1, 0, 0));
        kit.box(0.6, 0.06, 0.6, M.bronze, 0, 0.75 + 1.2, 0);
        kit.box(10.4, 0.3, 0.32, M.wood, 0, 0.4 + 3.95, 0);
        for (const s of [1, -1]) kit.box(0.18, 0.4, 0.18, M.wood, s * 0.35, 0.4 + 3.6, 0);
      });
    },
  },
  {
    id: 'seonjuk', members: ['seonjuk', 'pyochung'], lat: 37.979, lon: 126.566, R: 50, spawn: [3, 22, 0.35],
    marks: { seonjuk: [-10, 0], pyochung: [17, -4] },
    groundFn(x, z) {
      const cxs = -10 + 3 * Math.sin(z / 22);
      const d = Math.abs(x - cxs);
      if (d < 2.4) return -1.35;
      if (d < 5.2) { const t = (d - 2.4) / 2.8; return -1.35 * (1 - t * t * (3 - 2 * t)); }
      return 0;
    },
    obs: [
      { site: 'seonjuk', s: 0, at: [-3.0, 3.2], look: [-10, 0.8, 0], name: '선죽교 돌다리' },
      { site: 'seonjuk', s: 1, at: [-16, -5.5], look: [-10, 1.1, -1.7], name: '다리 난간' },
      { site: 'seonjuk', s: 2, at: [-3.2, 8.8], look: [-3.5, 1.4, 6], name: '선죽교 비석' },
      { site: 'pyochung', s: 0, at: [17, 4.2], look: [17, 2.8, -4], name: '두 비석' },
      { site: 'pyochung', s: 1, at: [9.6, -4], look: [15.2, 3.4, -4], name: '서쪽 비석' },
      { site: 'pyochung', s: 2, at: [19.5, 1.0], look: [18.8, 1.3, -2.4], name: '거북 받침' },
      { site: 'pyochung', s: 3, at: [24.4, -4], look: [18.8, 3.4, -4], name: '동쪽 비석' },
    ],
    paint(ctx) {
      rect(ctx, 'grass', 0, 0, 200, 200, 4);
      path(ctx, 'gravel', [[-40, 0], [-15, 0], [-5, 0], [10, 2], [40, 2]], 5, 3);
      rect(ctx, 'gravel', 17, -4, 16, 12, 3);
      // 개울 바닥
      ctx.save(); ctx.strokeStyle = P(ctx, 'sand', 2); ctx.lineWidth = 9; ctx.beginPath();
      for (let z = -70; z <= 70; z += 2) { const x = -10 + 3 * Math.sin(z / 22); z === -70 ? ctx.moveTo(x, z) : ctx.lineTo(x, z); }
      ctx.stroke(); ctx.restore();
      rect(ctx, 'asphalt', 0, 30, 200, 8, 3);
    },
    build(kit, ctx) {
      const M = mats();
      // 개울물
      const wg = new THREE.PlaneGeometry(6.6, 150, 1, 75); wg.rotateX(-Math.PI / 2);
      const p = wg.attributes.position; for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) - 10 + 3 * Math.sin(p.getZ(i) / 22));
      const water = new THREE.Mesh(wg, getWaterMat());
      const [wx, wz] = kit.P(0, 0); water.position.set(wx, kit.base.y - 0.85, wz); water.receiveShadow = true;
      kit.extra.push(water);
      // 선죽교: 돌기둥 위 널돌 다리(길이 약 8.4m, 너비 3.4m)
      kit.at(-10, 0, 0, 0, () => {
        for (const px of [-2.4, 0, 2.4]) for (const pz of [-1.2, 0, 1.2]) kit.box(0.6, 1.7, 0.6, M.statue, px, -1.4, pz);
        for (const s of [-1, 1]) kit.box(1.4, 1.75, 3.8, M.mason, s * 4.6, -1.4, 0);
        kit.box(8.4, 0.42, 3.4, M.granite, 0, -0.02, 0);
        kit.floor(0, 0, 5.3, 1.7, 0.42);
        // 돌난간: 기둥과 가로대
        for (const s of [-1, 1]) {
          for (let i = 0; i <= 5; i++) { const px = -4 + i * 1.6; kit.box(0.24, 0.92, 0.24, M.statue, px, 0.4, s * 1.55); kit.sphere(0.13, M.statue, px, 1.38, s * 1.55, 1, 1, 1, 6, 4); }
          kit.box(8.0, 0.14, 0.14, M.statue, 0, 1.05, s * 1.55);
          kit.box(8.0, 0.12, 0.12, M.statue, 0, 0.62, s * 1.55);
          kit.solidBox(0, s * 1.55, 4.1, 0.2, 1.4, 0.35);
        }
      });
      stele(kit, -3.5, 6, 0, { turtle: false, h: 1.6, w: 0.62 });
      // 표충비: 비각 안 거북 받침 비석 두 기
      kit.at(17, 0, -4, 0, () => {
        hanok(kit, { bx: [2.4, 2.8, 2.4], bz: [4.4], colH: 3.9, plat: 0.45, platPad: 0.9, open: true, steps: true, over: 1.7, lift: 0.7 });
        kit.at(0, 0.6, 0, 0, () => { stele(kit, -1.8, 0, 0, { h: 2.5 }); stele(kit, 1.8, 0, 0, { h: 2.5 }); });
        // 둘레 낮은 담
        for (const [x1, z1, x2, z2] of [[-6.5, -4.5, 6.5, -4.5], [-6.5, -4.5, -6.5, 3.2], [6.5, -4.5, 6.5, 3.2]]) wall(kit, x1, z1, x2, z2, 1.3, false);
      });
      tree(kit, 30, -18, 1.1, 'broad'); tree(kit, -26, 18, 1.0, 'broad'); tree(kit, 6, -22, 0.9, 'pine'); tree(kit, -28, -20, 1.0, 'pine');
    },
  },
  {
    id: 'sungyang', members: ['sungyang'], lat: 37.9739, lon: 126.5678, R: 44, spawn: [0, 33, 0],
    marks: { sungyang: [0, 0] },
    obs: [
      { site: 'sungyang', s: 0, at: [0, 8.5], look: [0, 4.2, -1], name: '앞쪽 건물' },
      { site: 'sungyang', s: 1, at: [0, -15.5], look: [0, 6.5, -21], name: '높은 단 위 건물' },
      { site: 'sungyang', s: 2, at: [6.5, 11], look: [10.5, 3.2, 6], name: '동쪽 건물' },
      { site: 'sungyang', s: 3, at: [0, 23], look: [0, 3.6, 18], name: '정문' },
    ],
    paint(ctx) {
      rect(ctx, 'grass', 0, 0, 200, 200, 4);
      rect(ctx, 'gravel', 0, 5, 32, 27, 3);
      path(ctx, 'paving', [[0, 40], [0, 18], [0, 4]], 3, 2);
    },
    build(kit) {
      const M = mats();
      gate3(kit, 0, 18, 0, { w: 8.4 });
      // 바깥 담장
      wall(kit, -16, 18, -4.6, 18); wall(kit, 4.6, 18, 16, 18);
      wall(kit, -16, 18, -16, -30); wall(kit, 16, 18, 16, -30); wall(kit, -16, -30, 16, -30);
      // 앞마당: 강당과 동재·서재
      kit.at(0, 0, -1, 0, () => hanok(kit, { bx: [3, 3.2, 3.2, 3.2, 3], bz: [3, 3], colH: 3.2, plat: 0.85, roofType: 'paljak', front: 'lattice' }));
      kit.at(10.5, 0, 6.5, -Math.PI / 2, () => hanok(kit, { bx: [2.6, 2.6, 2.6], bz: [3.0], colH: 2.8, plat: 0.5, roofType: 'matbae', over: 1.3 }));
      kit.at(-10.5, 0, 6.5, Math.PI / 2, () => hanok(kit, { bx: [2.6, 2.6, 2.6], bz: [3.0], colH: 2.8, plat: 0.5, roofType: 'matbae', over: 1.3 }));
      // 뒤쪽 높은 단: 내삼문과 사당
      terraceBox(kit, 0, -19.6, 15.6, 10.2, 2.2, M.masonDark, M.grass);
      stairs(kit, 0, -9.4, 2.6, 0, 2.26, 0.28);
      kit.at(0, 2.26, -12, 0, () => gate3(kit, 0, 0, 0, { w: 6.4, h: 2.6 }));
      wall(kit, -9, -12, -3.7, -12 + 0.0); wall(kit, 3.7, -12, 9, -12);
      kit.at(0, 2.26, 0, 0, () => {
        wall(kit, -9, -12, -9, -28.5); wall(kit, 9, -12, 9, -28.5);
        kit.at(0, 0, -21, 0, () => hanok(kit, { bx: [3, 3.3, 3], bz: [2.6, 2.6], colH: 3.0, plat: 0.75, roofType: 'matbae', over: 1.5 }));
      });
      tree(kit, -7, 12.5, 1.35, 'broad');
      tree(kit, 24, 4, 1, 'pine'); tree(kit, -24, -8, 1.1, 'pine'); tree(kit, 22, -26, 1, 'broad');
    },
  },
  {
    id: 'chomsongdae', members: ['chomsongdae'], lat: 37.9868, lon: 126.5396, R: 24, spawn: [0, 17, 0],
    marks: { chomsongdae: [0, 0] },
    obs: [
      { site: 'chomsongdae', s: 0, at: [0, 7.5], look: [0, 1.6, 0], name: '첨성대 전체' },
      { site: 'chomsongdae', s: 1, at: [3.4, 0.2], look: [0, 2.9, 0], name: '넓은 돌판' },
      { site: 'chomsongdae', s: 2, at: [-3.2, -2.6], look: [-1.1, 1.5, -1.1], name: '돌기둥' },
      { site: 'chomsongdae', s: 3, at: [0, -7.5], look: [0, 3.0, 0], name: '뒤에서 본 모습' },
    ],
    paint(ctx) {
      rect(ctx, 'grass', 0, 0, 200, 200, 4);
      rect(ctx, 'gravel', 0, 0, 10, 10, 3);
      path(ctx, 'gravel', [[0, 5], [0, 30]], 2.2, 3);
    },
    build(kit) {
      const M = mats();
      kit.box(4.4, 0.35, 4.4, M.granite, 0, 0, 0);
      kit.floor(0, 0, 2.2, 2.2, 0.35);
      for (const [x, z] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1], [0, 0]]) {
        kit.box(0.7, 0.18, 0.7, M.stone, x, 0.35, z);
        kit.box(0.42, 2.18, 0.42, M.statue, x, 0.53, z);
        kit.solidCircle(x, z, 0.36, 3);
      }
      kit.box(3.2, 0.38, 3.0, M.granite, 0.05, 2.71, -0.03, 0.03);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.39; kit.cyl(0.1, 0.12, 0.6, M.statue, Math.cos(a) * 5.4, 0, Math.sin(a) * 5.4, 8); }
      tree(kit, 14, -10, 1.0, 'pine'); tree(kit, -15, 6, 1.1, 'broad'); tree(kit, -12, -16, 0.9, 'pine');
    },
  },
  {
    id: 'manwoldae', members: ['manwoldae'], lat: 37.985, lon: 126.543, R: 92, spawn: [0, 76, 0],
    marks: { manwoldae: [0, 0] },
    obs: [
      { site: 'manwoldae', s: 0, at: [0, -1], look: [9, 7.0, -6], name: '건물 주춧돌' },
      { site: 'manwoldae', s: 1, at: [0, 52], look: [6.8, 3.2, 41], name: '큰 돌계단' },
      { site: 'manwoldae', s: 2, at: [-30, 27], look: 'chomsongdae', name: '첨성대 쪽' },
      { site: 'manwoldae', s: 3, at: [-25, -33], look: [-26, 8.4, -41], name: '발굴 구덩이' },
      { site: 'manwoldae', s: 4, at: [22, 62], look: [0, 6, 18], name: '만월대 전경' },
    ],
    paint(ctx) {
      rect(ctx, 'grass', 0, 0, 260, 260, 4);
      rect(ctx, 'gravel', 0, 62, 80, 40, 3);
      path(ctx, 'gravel', [[0, 110], [0, 80]], 6, 3);
    },
    build(kit) {
      const M = mats();
      // 층층이 쌓은 석축 단: 아래부터 5.0m, 6.2m, 7.8m
      terraceBox(kit, 0, 24, 36, 14, 5.0);
      terraceBox(kit, 0, -10, 36, 20, 6.2);
      terraceBox(kit, 0, -50, 36, 20, 7.8);
      // 뒤쪽 흙 비탈
      const bank = new THREE.BoxGeometry(72, 7.8, 14); const bp = bank.attributes.position;
      for (let i = 0; i < bp.count; i++) if (bp.getY(i) > 0 && bp.getZ(i) < 0) bp.setY(i, -3.9);
      bank.computeVertexNormals();
      kit.add(bank, M.grass, kit.matrix(0, 3.9, -77));
      kit.floor(0, -77, 36, 7, 7.9, 0, [7.9, 0.2]);
      // 앞 큰 계단 네 줄(33단)
      for (const x of [-6.8, 6.8]) stairs(kit, x, 38, 8.2, 0, 5.06, 0.26, M.granite, 33);
      // 단 사이 계단
      stairs(kit, 0, 10, 6, 5.06, 6.26, 0.32);
      stairs(kit, 0, -30, 6, 6.26, 7.86, 0.32);
      // 주춧돌 배열
      const grid = (cx, cz, nx, nz, sp, y, plat) => {
        if (plat) { kit.box(nx * sp + 1.6, 0.5, nz * sp + 1.6, M.granite, cx, y, cz); kit.floor(cx, cz, (nx * sp + 1.6) / 2, (nz * sp + 1.6) / 2, y + 0.5); y += 0.5; }
        for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
          const x = cx - nx * sp / 2 + i * sp, z = cz - nz * sp / 2 + j * sp;
          kit.add(rockGeo(0.55, i * 31 + j, 0.45, 1), M.granite, kit.matrix(x, y + 0.08, z, i + j));
        }
      };
      grid(0, 24, 5, 2, 4.5, 5.06, true);
      grid(0, -12, 9, 4, 5, 6.26, true);
      grid(0, -52, 7, 3, 4.5, 7.86, true);
      for (const s of [-1, 1]) { for (let j = 0; j < 9; j++) kit.add(rockGeo(0.45, 300 + j, 0.45, 1), M.granite, kit.matrix(s * 30, 6.35, 6 - j * 4.4, j)); }
      // 발굴 구덩이: 흙바닥, 드러난 돌, 말뚝과 줄
      kit.box(10, 0.08, 8, M.dark, -26, 7.86, -41);
      boulders(kit, [[-28, -42, 0.5, 0.5, 7.9], [-25, -40, 0.45, 0.5, 7.9], [-23.5, -43, 0.4, 0.5, 7.9], [-27, -38.5, 0.35, 0.5, 7.9]], M.granite);
      for (const [x, z] of [[-31, -45], [-21, -45], [-31, -37], [-21, -37]]) kit.box(0.08, 0.8, 0.08, M.wood, x, 7.86, z);
      for (const [x, z, w, d] of [[-26, -45, 10, 0.03], [-26, -37, 10, 0.03], [-31, -41, 0.03, 8], [-21, -41, 0.03, 8]]) kit.box(w, 0.03, d, M.ridgeWhite, x, 8.5, z);
      tree(kit, -46, 58, 1.3, 'broad'); tree(kit, 46, 52, 1.2, 'broad'); tree(kit, -46, -40, 1.1, 'pine'); tree(kit, 47, -30, 1.2, 'pine'); tree(kit, 30, 80, 1.0, 'broad');
    },
  },
  {
    id: 'seonggyun', members: ['seonggyun'], lat: 37.992, lon: 126.571, R: 56, spawn: [0, 50, 0],
    marks: { seonggyun: [0, 0] },
    obs: [
      { site: 'seonggyun', s: 0, at: [0, 12], look: [0, 4.4, 2], name: '앞쪽 큰 건물' },
      { site: 'seonggyun', s: 1, at: [0, 40], look: [0, 3.6, 34], name: '정문' },
      { site: 'seonggyun', s: 2, at: [6.5, -15], look: [0, 6, -25], name: '안쪽 건물' },
      { site: 'seonggyun', s: 3, at: [-3.5, 25], look: [-7, 9, 21], name: '큰 나무가 있는 마당' },
    ],
    paint(ctx) {
      rect(ctx, 'grass', 0, 0, 220, 220, 4);
      rect(ctx, 'gravel', 0, -4, 42, 74, 3);
      path(ctx, 'paving', [[0, 60], [0, 34], [0, 7]], 3, 2);
      path(ctx, 'paving', [[0, -8], [0, -18]], 3, 2);
    },
    build(kit) {
      gate3(kit, 0, 34, 0, { w: 9 });
      wall(kit, -22, 34, -4.9, 34); wall(kit, 4.9, 34, 22, 34);
      wall(kit, -22, 34, -22, -42); wall(kit, 22, 34, 22, -42); wall(kit, -22, -42, 22, -42);
      kit.at(14.5, 0, 17, -Math.PI / 2, () => hanok(kit, { bx: [3, 3, 3, 3, 3], bz: [3.2], colH: 2.9, plat: 0.5, roofType: 'matbae', over: 1.3 }));
      kit.at(-14.5, 0, 17, Math.PI / 2, () => hanok(kit, { bx: [3, 3, 3, 3, 3], bz: [3.2], colH: 2.9, plat: 0.5, roofType: 'matbae', over: 1.3 }));
      kit.at(0, 0, 2, 0, () => hanok(kit, { bx: [3.2, 3.4, 3.6, 3.4, 3.2], bz: [3.2, 3.2], colH: 3.4, plat: 1.0, roofType: 'paljak' }));
      gate3(kit, 0, -9, 0, { w: 6.6, h: 2.7 });
      wall(kit, -22, -9, -3.8, -9); wall(kit, 3.8, -9, 22, -9);
      kit.at(0, 0, -26, 0, () => hanok(kit, { bx: [3, 3.4, 3.6, 3.4, 3], bz: [3, 3, 3], colH: 3.6, plat: 1.2, roofType: 'paljak', lift: 0.9 }));
      kit.at(16.5, 0, -27, -Math.PI / 2, () => hanok(kit, { bx: [3, 3, 3, 3], bz: [3], colH: 2.8, plat: 0.5, roofType: 'matbae', over: 1.2 }));
      kit.at(-16.5, 0, -27, Math.PI / 2, () => hanok(kit, { bx: [3, 3, 3, 3], bz: [3], colH: 2.8, plat: 0.5, roofType: 'matbae', over: 1.2 }));
      tree(kit, -7, 21, 1.7, 'broad'); tree(kit, 7, 23, 1.45, 'ginkgo');
      tree(kit, -15, -3, 1.2, 'broad'); tree(kit, 32, 10, 1.1, 'pine'); tree(kit, -32, -20, 1.1, 'pine');
    },
  },
  {
    id: 'wanggeon', members: ['wanggeon'], lat: 37.985, lon: 126.506, R: 52, spawn: [0, 40, 0],
    marks: { wanggeon: [0, -10] },
    obs: [
      { site: 'wanggeon', s: 0, at: [0, -10.2], look: [0, 5.5, -23], name: '봉분' },
      { site: 'wanggeon', s: 1, at: [0, -4.5], look: [4.5, 4.0, -6], name: '문인석' },
      { site: 'wanggeon', s: 2, at: [9, 23.5], look: [13.5, 2.6, 22], name: '비각' },
      { site: 'wanggeon', s: 3, at: [0, 9.5], look: [-4.5, 2.6, 5.5], name: '무인석' },
    ],
    paint(ctx) {
      rect(ctx, 'grass', 0, 0, 200, 200, 4);
      path(ctx, 'paving', [[0, 60], [0, 15]], 4, 2);
      rect(ctx, 'paving', 0, 22, 6, 40, 2);
    },
    build(kit) {
      const M = mats();
      // 층단: 앞에서부터 0.9m, 1.8m, 2.8m
      terraceBox(kit, 0, 6, 15, 8, 0.9, M.mason);
      terraceBox(kit, 0, -5.5, 15, 3.5, 1.8, M.mason);
      terraceBox(kit, 0, -22, 15, 13, 2.8, M.mason);
      stairs(kit, 0, 14, 3.2, 0, 0.96, 0.3);
      stairs(kit, 0, -2, 3.2, 0.96, 1.86, 0.3);
      stairs(kit, 0, -9, 3.2, 1.86, 2.86, 0.3);
      kit.at(0, 0.96, 0, 0, () => { official(kit, -4.5, 5.5, 0, true, 1.2); official(kit, 4.5, 5.5, 0, true, 1.2); });
      kit.at(0, 1.86, 0, 0, () => { official(kit, -4.5, -6, 0, false, 1.2); official(kit, 4.5, -6, 0, false, 1.2); });
      kit.at(0, 2.86, 0, 0, () => {
        mound(kit, 0, -23.5, { r: 7, h: 5.0, relief: 'cloud', railR: 9.4 });
        tableStone(kit, 0, -14.6, 2.4, 1.3);
        lantern(kit, 0, -11.6, 1.05);
        pillarStone(kit, -6.8, -12); pillarStone(kit, 6.8, -12);
        for (const [th, k] of [[2.4, 'tiger'], [-2.4, 'tiger'], [1.25, 'sheep'], [-1.25, 'sheep']]) stoneBeast(kit, Math.sin(th) * 8.3, -23.5 + Math.cos(th) * 8.3, th, k);
      });
      // 참배길 양옆의 비각(사진처럼 좌우 한 채씩)
      for (const sx of [1, -1]) kit.at(sx * 13.5, 0, 22, 0, () => {
        hanok(kit, { bx: [3.2], bz: [3.2], colH: 3.4, plat: 0.45, platPad: 0.6, open: true, steps: false, over: 1.4 });
        kit.at(0, 0.6, 0, 0, () => stele(kit, 0, 0, 0, { h: 2.2, w: 0.9 }));
      });
      for (const [x, z, s] of [[-20, -38, 1.2], [-8, -42, 1.1], [6, -43, 1.25], [19, -36, 1.15], [-25, -22, 1.1], [25, -20, 1.05], [-27, 0, 1.0], [26, 4, 1.1]]) tree(kit, x, z, s, 'pine');
    },
  },
  {
    id: 'gongmin', members: ['gongmin'], lat: 37.982, lon: 126.473, R: 50, spawn: [0, 36, 0],
    marks: { gongmin: [0, -10] },
    obs: [
      { site: 'gongmin', s: 0, at: [0, -9.6], look: [0, 4, -23], name: '나란히 있는 두 봉분' },
      { site: 'gongmin', s: 1, at: [-6, -2.5], look: [-9, 3.9, -5], name: '문인석' },
      { site: 'gongmin', s: 2, at: [6, 7.5], look: [9, 3.0, 3.5], name: '무인석' },
      { site: 'gongmin', s: 3, at: [-16.5, -24], look: [-13.2, 3.6, -23], name: '병풍석' },
    ],
    paint(ctx) {
      rect(ctx, 'grass', 0, 0, 200, 200, 4);
      path(ctx, 'paving', [[0, 60], [0, 12]], 4, 2);
    },
    build(kit) {
      const M = mats();
      terraceBox(kit, 0, 4.5, 20, 4.5, 0.9, M.mason);
      terraceBox(kit, 0, -4, 20, 4, 1.9, M.mason);
      terraceBox(kit, 0, -22, 20, 14, 3.0, M.mason);
      stairs(kit, 0, 9, 3, 0, 0.96, 0.3);
      stairs(kit, 0, 0, 3, 0.96, 1.96, 0.3);
      stairs(kit, 0, -8, 3, 1.96, 3.06, 0.3);
      kit.at(0, 0.96, 0, 0, () => { for (const x of [-9, -3, 3, 9]) official(kit, x, 3.5, 0, true, 0.95); });
      kit.at(0, 1.96, 0, 0, () => { for (const x of [-9, -3, 3, 9]) official(kit, x, -5, 0, false, 0.95); });
      kit.at(0, 3.06, 0, 0, () => {
        for (const s of [-1, 1]) {
          const mx = s * 7.9;
          mound(kit, mx, -23, { r: 4.9, h: 3.9, relief: 'zodiac', railR: 7.3 });
          tableStone(kit, mx, -14.8, 2.0, 1.1);
          lantern(kit, mx, -12.4, 0.95);
          for (const [th, k] of [[1.35, 'sheep'], [-1.35, 'sheep'], [2.35, 'tiger'], [-2.35, 'tiger']]) stoneBeast(kit, mx + Math.sin(th) * 6.2, -23 + Math.cos(th) * 6.2, th, k, 0.8);
        }
        pillarStone(kit, -15, -12); pillarStone(kit, 15, -12);
      });
      for (const [x, z, s] of [[-26, -36, 1.2], [-12, -42, 1.1], [3, -43, 1.2], [17, -41, 1.15], [28, -26, 1.1], [-30, -15, 1.05], [30, -6, 1.0], [-30, 8, 1.1]]) tree(kit, x, z, s, 'pine');
    },
  },
  {
    id: 'bakyeon', members: ['bakyeon'], lat: 38.05, lon: 126.49, R: 44, spawn: [0, 32, 0],
    marks: { bakyeon: [0, 0] },
    groundFn(x, z) {
      const d = Math.hypot(x / 12, (z + 2) / 9);
      if (d < 1) return -2.4 * (1 - d * d) - 0.25;
      if (d < 1.18) return -0.25 * (1 - (d - 1) / 0.18);
      return 0;
    },
    obs: [
      { site: 'bakyeon', s: 0, at: [0, 17], look: [0, 22, -14], name: '떨어지는 물줄기' },
      { site: 'bakyeon', s: 1, at: [11.5, 18.5], look: [16, 4.2, 14], name: '폭포 옆 정자' },
      { site: 'bakyeon', s: 2, at: [-14.5, 6], look: [-5, 0.2, 0], name: '폭포 아래 못' },
    ],
    paint(ctx) {
      rect(ctx, 'grass', 0, 0, 200, 200, 4);
      ctx.save(); ctx.scale(1, 0.78); circ(ctx, 'sand', 0, -2.6, 14.5, 2); ctx.restore();
      path(ctx, 'dirt', [[0, 60], [4, 22], [14, 15]], 3, 2);
    },
    build(kit, ctx, anims) {
      const M = mats();
      // 절벽: 오목한 앞면을 가진 바위 덩어리
      const cg = new THREE.BoxGeometry(48, 42, 22, 30, 26, 10);
      const p = cg.attributes.position, R = rng(17);
      const ph = [R() * 6, R() * 6, R() * 6];
      for (let i = 0; i < p.count; i++) {
        let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const n = Math.sin(x * 0.35 + ph[0]) * Math.sin(y * 0.28 + ph[1]) * 1.3 + Math.sin(x * 0.9 + y * 0.7 + ph[2]) * 0.55 + Math.sin(y * 1.7) * 0.3;
        if (z > 0) z += -6.5 * Math.exp(-(x * x) / 90) * (y > -18 ? 1 : 0.5) + n; // 폭포 쪽 오목하게
        x += n * 0.6 * Math.sign(x);
        if (y > 20) y += Math.sin(x * 0.3) * 0.8;
        p.setXYZ(i, x, y, z);
      }
      cg.computeVertexNormals();
      kit.add(cg, M.granRock, kit.matrix(0, 18, -20));
      kit.solidBox(0, -20, 24, 11.2, 45);
      // 물줄기
      const fg = new THREE.PlaneGeometry(3.4, 38.5, 1, 30);
      const fp = fg.attributes.position;
      for (let i = 0; i < fp.count; i++) { const y = fp.getY(i); const t = (y + 19.25) / 38.5; fp.setZ(i, Math.pow(t, 6) * 1.2 + (1 - t) * 0.6); }
      const fmat = waterfallMat();
      for (const [ox, sc] of [[0, 1], [0.15, 0.8]]) {
        const fall = new THREE.Mesh(fg, fmat);
        const [wx, wz] = kit.P(ox, -13.6 + sc * 0.2);
        fall.position.set(wx, kit.base.y + 18.9, wz); fall.scale.x = sc;
        kit.extra.push(fall);
      }
      anims.push((dt, t) => { fmat.uniforms.uTime.value = t; });
      // 못(고모담)
      const pool = new THREE.Mesh(new THREE.CircleGeometry(12.6, 40), getWaterMat());
      pool.rotation.x = -Math.PI / 2; pool.scale.y = 9.6 / 12.6;
      const [px, pz] = kit.P(0, -2); pool.position.set(px, kit.base.y - 0.45, pz); pool.receiveShadow = true;
      kit.extra.push(pool);
      // 물보라
      const N = 160, ppos = new Float32Array(N * 3), seeds = [];
      for (let i = 0; i < N; i++) seeds.push([R() * 6.28, R(), R()]);
      const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(ppos, 3));
      const spray = new THREE.Points(pg, new THREE.PointsMaterial({ size: 1.6, map: softDot(), transparent: true, opacity: 0.55, depthWrite: false, color: '#f4fbff' }));
      const [sx, sz] = kit.P(0, -12.4); spray.position.set(sx, kit.base.y - 0.3, sz); spray.frustumCulled = false;
      kit.extra.push(spray);
      anims.push((dt, t) => {
        for (let i = 0; i < N; i++) {
          const [a, r0, s0] = seeds[i];
          const life = (t * (0.5 + s0 * 0.4) + r0) % 1;
          const rr = 0.5 + life * (2 + r0 * 3);
          ppos[i * 3] = Math.cos(a) * rr; ppos[i * 3 + 2] = Math.sin(a) * rr * 0.6 + 0.8; ppos[i * 3 + 1] = Math.sin(life * Math.PI) * (1.5 + s0 * 2.5);
        }
        pg.attributes.position.needsUpdate = true;
      });
      boulders(kit, [[-9, 10, 1.4], [8, 11, 1.2], [-13, -1, 1.8], [13, -2, 1.6], [-7, -9, 1.5, 0.7], [7.5, -9, 1.3, 0.7], [-15, 8, 1.0], [4, 14, 0.8], [14.5, 5, 1.1]]);
      // 정자
      kit.at(16, 0, 14, -0.3, () => hanok(kit, { bx: [2.6], bz: [2.6], colH: 2.9, plat: 0.6, platPad: 0.5, open: true, steps: false, over: 1.3, lift: 0.75 }));
      for (const [x, z, s] of [[-14, -22, 0.9], [-5, -26, 1.0], [8, -24, 0.95], [16, -19, 0.9], [-18, -14, 0.8]]) tree(kit, x, z, s, 'pine', 39.5);
      for (const [x, z, s] of [[-22, 18, 1.0], [24, 26, 1.1], [-26, 30, 1.0], [26, -2, 1.0]]) tree(kit, x, z, s, 'pine');
    },
  },
  {
    id: 'panmunjom', members: ['panmunjom'], lat: 37.956, lon: 126.677, R: 62, spawn: [0, 52, 0],
    marks: { panmunjom: [0, 0] },
    note: '이 근처를 군사분계선이 지납니다. 정확한 선 자료가 없어 화면에는 그리지 않았습니다.',
    obs: [
      { site: 'panmunjom', s: 0, at: [0, 12], look: [0, 2.2, 0], name: '회담장 건물' },
      { site: 'panmunjom', s: 1, at: [-13, 9.5], look: [-8, 2.2, 0], name: '파란 건물' },
      { site: 'panmunjom', s: 2, at: [13, -11], look: [4, 1.2, 0], name: '건물 사이' },
      { site: 'panmunjom', s: 3, at: [0, 25], look: [0, 6, 38], name: '남쪽 건물' },
    ],
    paint(ctx) {
      rect(ctx, 'grass', 0, 0, 200, 200, 4);
      rect(ctx, 'concrete', 0, 0, 80, 110, 6);
      rect(ctx, 'asphalt', 0, 70, 12, 50, 3);
    },
    build(kit) {
      const M = mats();
      const xs = [-24, -16, -8, 0, 8, 16, 24];
      xs.forEach((x, i) => {
        const blue = i >= 2 && i <= 4;
        const mat = blue ? M.blue : M.silver;
        kit.box(5.2, 0.25, 13, M.concrete, x, 0, 0);
        kit.box(5, 3.1, 12.6, mat, x, 0.25, 0);
        for (const s of [-1, 1]) for (let k = -2; k <= 2; k++) kit.box(0.06, 0.9, 1.4, M.dark, x + s * 2.52, 1.4, k * 2.4);
        kit.box(5.6, 0.25, 13.4, blue ? M.blue : M.silver, x, 3.35, 0);
        kit.box(1.0, 2.1, 0.06, M.dark, x, 0.25, 6.32); kit.box(1.0, 2.1, 0.06, M.dark, x, 0.25, -6.32);
        kit.solidBox(x, 0, 2.6, 6.4, 4);
      });
      // 북쪽 3층 건물과 남쪽 건물(간단한 상자형)
      kit.box(46, 12.5, 13, M.winA, 0, 0, -36);
      kit.box(48, 0.6, 15, M.concrete, 0, 12.5, -36);
      for (let i = -5; i <= 5; i++) kit.cyl(0.4, 0.4, 11, M.whiteWall, i * 4.2, 0, -28.9, 10);
      kit.box(44, 0.5, 2.2, M.concrete, 0, 11, -28.9);
      kit.solidBox(0, -36, 23, 7.5, 14);
      kit.box(34, 10, 15, M.winB, 0, 0, 40);
      kit.box(36, 0.6, 17, M.concrete, 0, 10, 40);
      kit.box(12, 3, 8, M.whiteWall, 0, 10.6, 40);
      kit.solidBox(0, 40, 17, 7.5, 12);
    },
  },
  {
    id: 'kaesong_ic', members: ['kaesong_ic'], lat: 37.935, lon: 126.62, R: 105, spawn: [0, 95, 0],
    marks: { kaesong_ic: [0, 0] },
    obs: [
      { site: 'kaesong_ic', s: 0, at: [-27, 25], look: [0, 7, 0], name: '공장 건물' },
      { site: 'kaesong_ic', s: 1, at: [27, -25], look: [55, 7, -50], name: '공장 단지' },
      { site: 'kaesong_ic', s: 2, at: [-27, -75], look: [-55, 7, -50], name: '북쪽 공장' },
      { site: 'kaesong_ic', s: 3, at: [27, 75], look: [55, 7, 50], name: '남쪽 공장' },
    ],
    paint(ctx) {
      rect(ctx, 'grass', 0, 0, 260, 260, 4);
      for (const x of [-27, 27]) rect(ctx, 'asphalt', x, 0, 12, 230, 3);
      for (const z of [-25, 25, -75, 75]) rect(ctx, 'asphalt', 0, z, 230, 12, 3);
      for (const x of [-55, 0, 55]) for (const z of [-50, 0, 50]) rect(ctx, 'concrete', x, z, 46, 34, 5);
    },
    build(kit) {
      const M = mats();
      // 사진처럼 흰 벽에 창 띠가 있는 평지붕 공장 건물
      [[-55, -50, 3], [0, -50, 2], [55, -50, 3], [-55, 0, 2], [0, 0, 3], [55, 0, 2], [-55, 50, 3], [0, 50, 2], [55, 50, 2]].forEach(([x, z, fl]) => {
        const hgt = fl * 4.2;
        kit.box(40, hgt, 26, M.factoryWall, x, 0, z);
        for (let f = 0; f < fl; f++) for (const s of [1, -1]) kit.box(38, 1.3, 0.1, M.winB, x, f * 4.2 + 1.6, z + s * 13.04);
        kit.box(40.6, 0.5, 26.6, M.concrete, x, hgt, z);
        kit.box(6, 3, 6, M.whiteWall, x + 12, hgt + 0.5, z - 5);
        kit.box(5, 4, 0.1, M.dark, x - 14, 0, z + 13.06);
        kit.solidBox(x, z, 20, 13, hgt + 4);
      });
      kit.box(30, 18, 12, M.winB, -55, 0, 88); kit.solidBox(-55, 88, 15, 6, 19);
      kit.box(24, 10, 12, M.winA, 55, 0, 88); kit.solidBox(55, 88, 12, 6, 11);
      for (let i = -4; i <= 4; i++) { tree(kit, -34, i * 22, 0.6, 'broad'); tree(kit, 34, i * 22 + 11, 0.6, 'broad'); }
    },
  },
  {
    id: 'songak', members: ['songak'], lat: 38.0036, lon: 126.5361, R: 11, spawn: [0, -6, Math.PI],
    marks: { songak: [0, 0] }, summit: true, treePad: 90,
    obs: [
      { site: 'songak', s: 0, at: [-3, -5.5], look: [0, 1.6, -3], name: '송악산 꼭대기' },
      { site: 'songak', s: 1, at: [0, 7], look: 'manwoldae', name: '만월대 방향' },
      { site: 'songak', s: 2, at: [7, 3], look: 'namdaemun', name: '개성 시내' },
      { site: 'songak', s: 3, at: [-7, 3.5], look: 'south', name: '남쪽 들판' },
    ],
    paint(ctx) {
      rect(ctx, 'grass', 0, 0, 200, 200, 3);
      circ(ctx, 'dirt', 0, 0, 7, 2);
      path(ctx, 'dirt', [[0, 0], [0, 10], [8, 5]], 2, 2);
    },
    build(kit) {
      const M = mats();
      boulders(kit, [[0, -2.5, 1.9, 0.75], [-2.8, -1.2, 1.3], [3.2, -2.0, 1.4], [-7, -7, 1.4, 0.7], [6.5, -7.5, 1.2, 0.7]], M.rock);
    },
  },
];

export const PLOT_OF = {};
for (const p of PLOTS) for (const m of p.members) PLOT_OF[m] = p;

// 부지를 지형 위에 세운다
export function buildPlot(plot, renderer, lowRes) {
  const kit = new Kit();
  kit.base = { x: plot.x, y: plot.h0, z: plot.z, ry: 0 };
  const anims = [];
  plot.build(kit, null, anims);
  const group = kit.build();
  // 바닥 원판
  const Rg = plot.R + (plot.summit ? 5 : 22);
  const n = Math.min(150, Math.round(Rg * 1.4));
  const g = new THREE.PlaneGeometry(Rg * 2, Rg * 2, n, n); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, plot.groundFn ? plot.groundFn(p.getX(i), p.getZ(i)) : 0);
  g.computeVertexNormals();
  const cs = lowRes ? 1024 : 2048;
  const c = document.createElement('canvas'); c.width = c.height = cs;
  const ctx = c.getContext('2d');
  const S = cs / (Rg * 2);
  ctx.setTransform(S, 0, 0, S, cs / 2, cs / 2);
  plot.paint(ctx);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'destination-in';
  const rg = ctx.createRadialGradient(cs / 2, cs / 2, (plot.R + 2) * S, cs / 2, cs / 2, Rg * S);
  rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rg; ctx.fillRect(0, 0, cs, cs);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const gm = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const disc = new THREE.Mesh(g, gm);
  disc.position.set(plot.x, plot.h0 + 0.03, plot.z);
  disc.receiveShadow = true;
  disc.renderOrder = 1;
  group.add(disc);
  return { group, solids: kit.solids, floors: kit.floors, anims, kit, disc };
}

// 걷기용 바닥 높이·충돌 질의
export function makeCollider(plot, built, grid) {
  const { solids, floors } = built;
  const local = (o, x, z) => { const dx = x - o.x, dz = z - o.z, c = Math.cos(o.ry), s = Math.sin(o.ry); return [c * dx - s * dz, s * dx + c * dz]; };
  const baseAt = (x, z) => {
    const lx = x - plot.x, lz = z - plot.z;
    if (Math.hypot(lx, lz) < plot.R + (plot.summit ? 2 : 22)) return plot.h0 + (plot.groundFn ? plot.groundFn(lx, lz) : 0);
    return grid.heightAt(x, z);
  };
  return {
    // feet: 지금 발 높이. 반환: 그 위치의 바닥 높이 또는 null(막힘)
    groundAt(x, z, feet, step = 0.65) {
      let g = baseAt(x, z);
      for (const f of floors) {
        const [u, v] = local(f, x, z);
        if (Math.abs(u) > f.hw || Math.abs(v) > f.hd) continue;
        if (f.bottom > feet + 1.7) continue;
        let top = f.top;
        if (f.ramp) { const t = (v + f.hd) / (2 * f.hd); top = f.ramp[1] + (f.ramp[0] - f.ramp[1]) * t; }
        if (top <= feet + step) g = Math.max(g, top);
        else return null;
      }
      return g;
    },
    blocked(x, z, feet, rad = 0.35) {
      for (const s of solids) {
        if (s.top < feet + 0.3 || s.bottom > feet + 1.7) continue;
        if (s.t === 'c') { if (Math.hypot(x - s.x, z - s.z) < s.r + rad) return true; }
        else { const [u, v] = local(s, x, z); if (Math.abs(u) < s.hw + rad && Math.abs(v) < s.hd + rad) return true; }
      }
      return false;
    },
    baseAt,
  };
}
