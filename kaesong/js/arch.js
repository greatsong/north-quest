// 유적 모형 제작 도구: 캔버스 질감, 메시 묶음(Kit), 한옥 지붕 생성기, 석물 부품
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------- 결정적 난수 ----------
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// ---------- 캔버스 질감 ----------
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d', { willReadFrequently: true }); return c; }
function toTex(c, { srgb = true, rep = [1, 1], aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep[0], rep[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}
// 밝기 캔버스로 노멀맵을 만든다
function normalFrom(c, strength = 2, rep = [1, 1]) {
  const w = c.width, h = c.height;
  const src = c.getContext('2d').getImageData(0, 0, w, h).data;
  const out = cv(w, h), ctx = out.getContext('2d'), img = ctx.createImageData(w, h);
  const L = (x, y) => { x = (x + w) % w; y = (y + h) % h; const k = (y * w + x) * 4; return (src[k] + src[k + 1] + src[k + 2]) / 765; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (L(x + 1, y) - L(x - 1, y)) * strength, dy = (L(x, y + 1) - L(x, y - 1)) * strength;
    const n = new THREE.Vector3(-dx, dy, 1).normalize();
    const k = (y * w + x) * 4;
    img.data[k] = (n.x * 0.5 + 0.5) * 255; img.data[k + 1] = (n.y * 0.5 + 0.5) * 255; img.data[k + 2] = (n.z * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return toTex(out, { srgb: false, rep });
}
function speckle(ctx, w, h, n, r, colors, R) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[Math.floor(R() * colors.length)];
    ctx.globalAlpha = 0.05 + R() * 0.12;
    ctx.fillRect(R() * w, R() * h, 1 + R() * r, 1 + R() * r);
  }
  ctx.globalAlpha = 1;
}

// 돌을 쌓은 벽(육축·석축): 한 장이 가로 4m × 세로 2m
function masonryCanvas(base = [150, 142, 128], seed = 3) {
  const R = rng(seed), w = 512, h = 256, c = cv(w, h), x = c.getContext('2d');
  x.fillStyle = '#5c564d'; x.fillRect(0, 0, w, h);
  const rows = 5, rh = h / rows;
  for (let r = 0; r < rows; r++) {
    let px = -R() * 60;
    while (px < w) {
      const bw = 70 + R() * 70;
      const v = (R() - 0.5) * 34;
      x.fillStyle = `rgb(${base[0] + v},${base[1] + v},${base[2] + v * 0.9})`;
      const y0 = r * rh + 2, bh = rh - 4;
      x.fillRect(px + 2, y0, bw - 4, bh);
      if (px + bw > w) x.fillRect(px + 2 - w, y0, bw - 4, bh);
      // 돌 가장자리 음영
      x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(px + 2, y0 + bh - 5, bw - 4, 5);
      x.fillStyle = 'rgba(255,255,255,0.10)'; x.fillRect(px + 2, y0, bw - 4, 3);
      px += bw;
    }
  }
  speckle(x, w, h, 5000, 3, ['#000', '#fff', '#6b5f4c', '#3d4a3a'], R);
  // 이끼와 얼룩
  for (let i = 0; i < 30; i++) {
    const g = x.createRadialGradient(R() * w, R() * h, 2, R() * w, R() * h, 30 + R() * 40);
    g.addColorStop(0, 'rgba(60,70,40,0.18)'); g.addColorStop(1, 'rgba(60,70,40,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  }
  return c;
}
function smoothStoneCanvas(base = [176, 170, 158], seed = 5) {
  const R = rng(seed), w = 256, h = 256, c = cv(w, h), x = c.getContext('2d');
  x.fillStyle = `rgb(${base})`; x.fillRect(0, 0, w, h);
  speckle(x, w, h, 9000, 2, ['#000', '#fff', '#7a7062', '#5a5a5a'], R);
  for (let i = 0; i < 18; i++) {
    const cx = R() * w, cy = R() * h, g = x.createRadialGradient(cx, cy, 1, cx, cy, 20 + R() * 50);
    g.addColorStop(0, 'rgba(70,75,55,0.16)'); g.addColorStop(1, 'rgba(70,75,55,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  }
  return c;
}
function tileCanvas() {
  // 기와: 세로 방향 골(수키와·암키와)과 가로 줄
  const w = 256, h = 256, c = cv(w, h), x = c.getContext('2d'), R = rng(11);
  x.fillStyle = '#3c4146'; x.fillRect(0, 0, w, h);
  const cols = 8, cw = w / cols;
  for (let i = 0; i < cols; i++) {
    const g = x.createLinearGradient(i * cw, 0, (i + 1) * cw, 0);
    g.addColorStop(0, '#2b2f33'); g.addColorStop(0.25, '#3a3f44'); g.addColorStop(0.5, '#5d646a'); g.addColorStop(0.62, '#6a7177'); g.addColorStop(0.8, '#3d4247'); g.addColorStop(1, '#25292c');
    x.fillStyle = g; x.fillRect(i * cw + cw * 0.45, 0, cw * 0.55, h);
    x.fillStyle = '#34393d'; x.fillRect(i * cw, 0, cw * 0.45, h);
  }
  for (let j = 0; j < 8; j++) { x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, j * 32, w, 3); }
  speckle(x, w, h, 3000, 2, ['#000', '#9aa', '#555'], R);
  return c;
}
function rafterCanvas() {
  const w = 256, h = 128, c = cv(w, h), x = c.getContext('2d');
  x.fillStyle = '#d8d0b8'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 8; i++) {
    x.fillStyle = '#3f7d6b'; x.fillRect(i * 32 + 6, 0, 18, h);
    x.fillStyle = '#c0392b'; x.fillRect(i * 32 + 6, h - 12, 18, 12);
  }
  return c;
}
function dancheongCanvas() {
  // 단청 띠: 녹색 바탕에 머리초 무늬
  const w = 512, h = 64, c = cv(w, h), x = c.getContext('2d');
  x.fillStyle = '#2f7d6d'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#1d4f6e'; x.fillRect(0, 0, w, 6); x.fillRect(0, h - 6, w, 6);
  for (let i = 0; i < 4; i++) {
    const cx = i * 128 + 64;
    x.fillStyle = '#e9e1c9'; x.fillRect(cx - 50, 8, 100, h - 16);
    x.fillStyle = '#c0392b'; x.beginPath(); x.ellipse(cx, h / 2, 34, 18, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#e8b92f'; x.beginPath(); x.ellipse(cx, h / 2, 18, 10, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#2b5f9e'; x.beginPath(); x.ellipse(cx, h / 2, 7, 5, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#1f3f63';
    for (const s of [-1, 1]) { x.fillRect(cx + s * 44 - 3, 10, 6, h - 20); }
  }
  return c;
}
function latticeCanvas() {
  // 창호: 띠살문 두 짝
  const w = 256, h = 256, c = cv(w, h), x = c.getContext('2d');
  x.fillStyle = '#6a3b26'; x.fillRect(0, 0, w, h);
  for (const ox of [10, 132]) {
    x.fillStyle = '#efe6cf'; x.fillRect(ox, 12, 114, h - 24);
    x.strokeStyle = '#7a4a2e'; x.lineWidth = 3;
    for (let i = 1; i < 6; i++) { x.beginPath(); x.moveTo(ox + i * 19, 12); x.lineTo(ox + i * 19, h - 12); x.stroke(); }
    for (const yy of [40, 46, 52, 120, 126, 132, 200, 206, 212]) { x.beginPath(); x.moveTo(ox, yy); x.lineTo(ox + 114, yy); x.stroke(); }
  }
  return c;
}
function plasterCanvas() {
  const w = 128, h = 128, c = cv(w, h), x = c.getContext('2d'), R = rng(21);
  x.fillStyle = '#e9e3d4'; x.fillRect(0, 0, w, h);
  speckle(x, w, h, 1500, 2, ['#bbb3a0', '#fff'], R);
  return c;
}
function woodCanvas(col = '#7a3a26') {
  const w = 64, h = 256, c = cv(w, h), x = c.getContext('2d'), R = rng(31);
  x.fillStyle = col; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(0,0,0,${0.05 + R() * 0.08})`; x.fillRect(R() * w, 0, 1 + R() * 2, h); }
  return c;
}
function ivyCanvas() {
  const R = rng(81), w = 256, h = 256, c = cv(w, h), x = c.getContext('2d');
  for (let i = 0; i < 2600; i++) {
    const px = R() * w, py = R() * h;
    if (py > h * (0.15 + 0.5 * Math.abs(Math.sin(px * 0.03))) && R() < 0.55) continue; // 아래쪽은 듬성하게
    const v = R();
    x.fillStyle = `rgba(${40 + v * 50},${80 + v * 60},${30 + v * 30},0.95)`;
    x.beginPath(); x.ellipse(px, py, 3 + R() * 4, 2 + R() * 3, R() * 3, 0, Math.PI * 2); x.fill();
  }
  return c;
}
function cliffCanvas() {
  const R = rng(91), w = 256, h = 256, c = cv(w, h), x = c.getContext('2d');
  x.fillStyle = '#b9b5ab'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) { const px = R() * w; x.fillStyle = `rgba(${R() < 0.5 ? '70,66,58' : '230,228,220'},${0.06 + R() * 0.12})`; x.fillRect(px, 0, 2 + R() * 10, h); }
  for (let i = 0; i < 25; i++) { x.strokeStyle = 'rgba(40,38,34,0.35)'; x.lineWidth = 1 + R() * 2; x.beginPath(); let px = R() * w, py = R() * h; x.moveTo(px, py); for (let k = 0; k < 3; k++) { px += (R() - 0.5) * 30; py += 20 + R() * 40; x.lineTo(px, py); } x.stroke(); }
  for (let i = 0; i < 14; i++) { const gx = R() * w, gy = R() * h, g = x.createRadialGradient(gx, gy, 2, gx, gy, 20 + R() * 30); g.addColorStop(0, 'rgba(70,90,50,0.35)'); g.addColorStop(1, 'rgba(70,90,50,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }
  speckle(x, w, h, 6000, 2, ['#000', '#fff', '#8a857a'], R);
  return c;
}
function grassCanvas(seed = 41, base = [96, 122, 60]) {
  const R = rng(seed), w = 256, h = 256, c = cv(w, h), x = c.getContext('2d');
  x.fillStyle = `rgb(${base})`; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) {
    const v = (R() - 0.5) * 60;
    x.fillStyle = `rgba(${base[0] + v},${base[1] + v + 10},${base[2] + v * 0.5},0.5)`;
    x.fillRect(R() * w, R() * h, 1, 2 + R() * 4);
  }
  speckle(x, w, h, 1500, 3, ['#4c5a2a', '#a3a35c', '#3a4a22'], R);
  return c;
}
function rockCanvas(seed = 51) {
  const R = rng(seed), w = 256, h = 256, c = cv(w, h), x = c.getContext('2d');
  x.fillStyle = '#7d7769'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) {
    x.strokeStyle = `rgba(30,28,24,${0.2 + R() * 0.3})`; x.lineWidth = 1 + R() * 2;
    x.beginPath(); let px = R() * w, py = R() * h; x.moveTo(px, py);
    for (let k = 0; k < 4; k++) { px += (R() - 0.5) * 60; py += R() * 40; x.lineTo(px, py); }
    x.stroke();
  }
  speckle(x, w, h, 8000, 3, ['#000', '#ddd', '#5b5546', '#4a5a3a'], R);
  return c;
}
function reliefCanvas(kind = 'cloud') {
  // 병풍석 면석: 테두리와 돋을새김 무늬
  const w = 128, h = 128, c = cv(w, h), x = c.getContext('2d');
  x.fillStyle = '#a8a294'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#8f897c'; x.fillRect(8, 8, w - 16, h - 16);
  x.fillStyle = '#b9b3a5';
  if (kind === 'zodiac') {
    // 사람 모양 십이지신상(단순화)
    x.beginPath(); x.ellipse(64, 40, 12, 14, 0, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.moveTo(40, 112); x.quadraticCurveTo(44, 56, 64, 54); x.quadraticCurveTo(84, 56, 88, 112); x.fill();
    x.beginPath(); x.ellipse(64, 24, 16, 6, 0, 0, Math.PI * 2); x.fill();
  } else {
    for (let i = 0; i < 5; i++) { x.beginPath(); x.ellipse(30 + i * 17, 64 + Math.sin(i) * 14, 16, 10, 0, 0, Math.PI * 2); x.fill(); }
  }
  return c;
}
function pavingCanvas() {
  const R = rng(61), w = 256, h = 256, c = cv(w, h), x = c.getContext('2d');
  x.fillStyle = '#7d786d'; x.fillRect(0, 0, w, h);
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
    const v = (R() - 0.5) * 30;
    x.fillStyle = `rgb(${165 + v},${160 + v},${148 + v})`;
    x.fillRect(i * 32 + 1 + (j % 2) * 16, j * 32 + 1, 30, 30);
  }
  speckle(x, w, h, 3000, 2, ['#000', '#fff'], R);
  return c;
}
function concreteCanvas() {
  const R = rng(71), w = 128, h = 128, c = cv(w, h), x = c.getContext('2d');
  x.fillStyle = '#a7a59f'; x.fillRect(0, 0, w, h);
  speckle(x, w, h, 3000, 2, ['#000', '#fff'], R);
  return c;
}
function windowsCanvas(wall = '#d9d6cc', glass = '#3d5568', cols = 4, rows = 3) {
  const w = 256, h = 192, c = cv(w, h), x = c.getContext('2d');
  x.fillStyle = wall; x.fillRect(0, 0, w, h);
  const cw = w / cols, rh = h / rows;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    x.fillStyle = glass; x.fillRect(i * cw + cw * 0.18, j * rh + rh * 0.25, cw * 0.64, rh * 0.5);
    x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(i * cw + cw * 0.18, j * rh + rh * 0.25, cw * 0.64, rh * 0.1);
  }
  return c;
}

// ---------- 재질 ----------
let MAT = null;
export function mats() {
  if (MAT) return MAT;
  const S = (opts) => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...opts });
  const mason = masonryCanvas(), masonD = masonryCanvas([128, 122, 108], 9);
  const stoneC = smoothStoneCanvas(), graniteC = smoothStoneCanvas([196, 192, 182], 7);
  const tile = tileCanvas(), rock = rockCanvas(), grass = grassCanvas();
  MAT = {
    mason: S({ map: toTex(mason, { rep: [0.25, 0.5] }), normalMap: normalFrom(mason, 3, [0.25, 0.5]) }),
    masonDark: S({ map: toTex(masonD, { rep: [0.3, 0.6] }), normalMap: normalFrom(masonD, 3, [0.3, 0.6]) }),
    stone: S({ map: toTex(stoneC, { rep: [0.5, 0.5] }), normalMap: normalFrom(stoneC, 1.5, [0.5, 0.5]) }),
    granite: S({ map: toTex(graniteC, { rep: [0.6, 0.6] }), normalMap: normalFrom(graniteC, 1.2, [0.6, 0.6]), roughness: 0.85 }),
    statue: S({ map: toTex(graniteC, { rep: [1.2, 1.2] }), normalMap: normalFrom(graniteC, 1.5, [1.2, 1.2]), color: '#d8d2c4' }),
    tile: S({ map: toTex(tile, { rep: [1 / 2.4, 1 / 2.4] }), normalMap: normalFrom(tile, 4, [1 / 2.4, 1 / 2.4]), roughness: 0.75 }),
    tileRidge: S({ color: '#33373b', roughness: 0.8 }),
    ridgeWhite: S({ color: '#d9d4c7' }),
    under: S({ map: toTex(rafterCanvas(), { rep: [1 / 2.4, 1] }), roughness: 1, side: THREE.DoubleSide }),
    dancheong: S({ map: toTex(dancheongCanvas()), roughness: 0.8 }),
    green: S({ color: '#2f7d6d' }),
    pillar: S({ map: toTex(woodCanvas('#8a3b27'), { rep: [1, 0.3] }), roughness: 0.75 }),
    wood: S({ map: toTex(woodCanvas('#6f4a30'), { rep: [1, 0.3] }) }),
    floor: S({ map: toTex(woodCanvas('#9c7650'), { rep: [1.2, 0.5] }) }),
    lattice: S({ map: toTex(latticeCanvas()), roughness: 0.9 }),
    plaster: S({ map: toTex(plasterCanvas(), { rep: [0.5, 0.5] }) }),
    door: S({ color: '#8b3426' }),
    bronze: new THREE.MeshStandardMaterial({ color: '#4d5a4a', metalness: 0.7, roughness: 0.45 }),
    grass: S({ map: toTex(grass, { rep: [0.25, 0.25] }) }),
    mound: S({ map: toTex(grassCanvas(43, [104, 128, 64]), { rep: [0.4, 0.4] }), normalMap: normalFrom(grass, 1.5, [0.4, 0.4]) }),
    rock: S({ map: toTex(rock, { rep: [0.12, 0.12] }), normalMap: normalFrom(rock, 2.5, [0.12, 0.12]), roughness: 0.95 }),
    granRock: (() => { const cc = cliffCanvas(); return S({ map: toTex(cc, { rep: [0.06, 0.06] }), normalMap: normalFrom(cc, 2.5, [0.06, 0.06]), roughness: 0.75 }); })(),
    ivy: S({ map: toTex(ivyCanvas(), { rep: [0.25, 0.25] }), alphaTest: 0.5, side: THREE.DoubleSide }),
    relief: S({ map: toTex(reliefCanvas('cloud')) }),
    zodiac: S({ map: toTex(reliefCanvas('zodiac')) }),
    paving: S({ map: toTex(pavingCanvas(), { rep: [0.25, 0.25] }) }),
    concrete: S({ map: toTex(concreteCanvas(), { rep: [0.2, 0.2] }) }),
    asphalt: S({ color: '#4d4f52', roughness: 1 }),
    blue: S({ color: '#5aa8ea', roughness: 0.6 }),
    silver: S({ color: '#b9bfc6', roughness: 0.5, metalness: 0.3 }),
    whiteWall: S({ color: '#e7e4dc' }),
    winA: S({ map: toTex(windowsCanvas('#dcd8cd', '#41596b', 4, 3)) }),
    winB: S({ map: toTex(windowsCanvas('#cfd5da', '#3a5068', 6, 2)) }),
    factoryRoof: S({ color: '#8fa3b0', roughness: 0.55, metalness: 0.4 }),
    factoryWall: S({ color: '#e3e6e8', roughness: 0.7 }),
    dark: S({ color: '#2b2622' }),
    trunk: S({ color: '#5a4030' }),
    leaf: S({ color: '#4f7a36', flatShading: true }),
    leafY: S({ color: '#c9a640', flatShading: true }),
    pine: S({ color: '#2f5a2c', flatShading: true }),
    pineTrunk: S({ color: '#9a5a3a' }),
  };
  return MAT;
}

// ---------- 묶음 제작기 ----------
const UP = new THREE.Vector3(0, 1, 0);
function boxUV(g) {
  const p = g.attributes.position, n = p.count;
  const uv = new Float32Array(n * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    nn.subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b));
    const ax = Math.abs(nn.x), ay = Math.abs(nn.y), az = Math.abs(nn.z);
    for (let k = 0; k < 3; k++) {
      const v = k === 0 ? a : k === 1 ? b : c;
      let u, w;
      if (ay >= ax && ay >= az) { u = v.x; w = v.z; } else if (ax >= az) { u = v.z; w = v.y; } else { u = v.x; w = v.y; }
      uv[(i + k) * 2] = u; uv[(i + k) * 2 + 1] = w;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export class Kit {
  constructor() {
    this.buckets = new Map();
    this.base = { x: 0, y: 0, z: 0, ry: 0 };
    this.solids = []; this.floors = [];
    this.extra = []; // 개별 객체(애니메이션 등)
  }
  // 하위 조립 좌표계
  at(x, y, z, ry, fn) {
    const prev = this.base;
    const c = Math.cos(prev.ry), s = Math.sin(prev.ry);
    this.base = { x: prev.x + c * x + s * z, y: prev.y + y, z: prev.z - s * x + c * z, ry: prev.ry + ry };
    fn();
    this.base = prev;
  }
  P(x, z) { const b = this.base, c = Math.cos(b.ry), s = Math.sin(b.ry); return [b.x + c * x + s * z, b.z - s * x + c * z]; }
  matrix(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
    const [wx, wz] = this.P(x, z);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, this.base.ry + ry, rz, 'YXZ'));
    return new THREE.Matrix4().compose(new THREE.Vector3(wx, this.base.y + y, wz), q, new THREE.Vector3(sx, sy, sz));
  }
  add(geo, mat, m4, uv = 'box') {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (m4) g.applyMatrix4(m4);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (uv === 'box') boxUV(g);
    else if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.morphAttributes = {};
    if (!this.buckets.has(mat)) this.buckets.set(mat, []);
    this.buckets.get(mat).push(g);
    return g;
  }
  box(w, h, d, mat, x, y, z, ry = 0, uv = 'box') { return this.add(new THREE.BoxGeometry(w, h, d), mat, this.matrix(x, y + h / 2, z, ry), uv); }
  cyl(rt, rb, h, mat, x, y, z, seg = 16, ry = 0) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), mat, this.matrix(x, y + h / 2, z, ry)); }
  sphere(r, mat, x, y, z, sx = 1, sy = 1, sz = 1, ws = 16, hs = 10, ry = 0) {
    return this.add(new THREE.SphereGeometry(r, ws, hs), mat, this.matrix(x, y, z, ry, sx, sy, sz));
  }
  // 충돌: 막는 상자, 막는 원, 올라설 수 있는 바닥(경사 가능)
  solidBox(x, z, hw, hd, top, bottom = -5, ry = 0) {
    const [wx, wz] = this.P(x, z);
    this.solids.push({ t: 'b', x: wx, z: wz, hw, hd, ry: this.base.ry + ry, top: this.base.y + top, bottom: this.base.y + bottom });
  }
  solidCircle(x, z, r, top, bottom = -5) {
    const [wx, wz] = this.P(x, z);
    this.solids.push({ t: 'c', x: wx, z: wz, r, top: this.base.y + top, bottom: this.base.y + bottom });
  }
  // ramp: [앞(+z 끝) 높이, 뒤(-z 끝) 높이]
  floor(x, z, hw, hd, top, ry = 0, ramp = null) {
    const [wx, wz] = this.P(x, z);
    const by = this.base.y;
    this.floors.push({ x: wx, z: wz, hw, hd, ry: this.base.ry + ry, top: by + top, bottom: by - 1.2, ramp: ramp ? [by + ramp[0], by + ramp[1]] : null });
  }
  build() {
    const g = new THREE.Group();
    for (const [mat, list] of this.buckets) {
      const geo = mergeGeometries(list, false);
      if (!geo) continue;
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
    }
    for (const o of this.extra) g.add(o);
    return g;
  }
}

// ---------- 한옥 지붕 생성기 ----------
// a: 처마 반길이(x), b: 처마 반폭(z), H: 용마루 높이, e: 팔작 합각까지 깊이(0이면 맞배)
function gridGeo(nu, nv, f, wantDir) {
  const pos = [], uvs = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const r = f(i / nu, j / nv);
    pos.push(r[0], r[1], r[2]); uvs.push(r[3], r[4]);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // 바깥쪽을 향하도록 뒤집기
  const n = g.attributes.normal; let sx = 0, sy = 0, sz = 0;
  for (let k = 0; k < n.count; k++) { sx += n.getX(k); sy += n.getY(k); sz += n.getZ(k); }
  if (sx * wantDir[0] + sy * wantDir[1] + sz * wantDir[2] < 0) {
    for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
    g.setIndex(idx); g.computeVertexNormals();
  }
  return g;
}

export function roof(kit, { a, b, H, e = 0, lift = 0.6, pw = 1.45, thick = 0.32, mat, underMat, ridgeMat, gableMat, x = 0, y = 0, z = 0, ry = 0, ridgeH = 0.45, gin = 0.6 }) {
  const M = mats();
  mat = mat || M.tile; underMat = underMat || M.under; ridgeMat = ridgeMat || M.tileRidge; gableMat = gableMat || M.wood;
  const P = (d) => H * Math.pow(Math.min(Math.max(d, 0), b) / b, pw);
  const L = (px, pz) => { const ux = Math.min(1, Math.abs(px) / a), uz = Math.min(1, Math.abs(pz) / b); return lift * Math.max(ux ** 5 * uz ** 2, uz ** 5 * ux ** 2); };
  const paljak = e > 0.01;
  const xi = paljak ? a - e : a;
  const faces = [];
  // 앞뒤 경사면
  for (const sz of [1, -1]) {
    faces.push([gridGeo(14, 8, (u, v) => { const px = -xi + u * 2 * xi, d = v * b, pz = sz * (b - d); return [px, P(d) + L(px, pz), pz, px, d * 1.25]; }, [0, 1, sz])]);
    if (paljak) for (const sx of [1, -1]) {
      faces.push([gridGeo(4, 6, (u, v) => { const dx = e - u * e, px = sx * (a - dx), d = v * dx, pz = sz * (b - d); return [px, P(d) + L(px, pz), pz, px, d * 1.25]; }, [0, 1, sz])]);
    }
  }
  // 팔작 양 끝 경사면과 합각
  const gables = [];
  if (paljak) {
    for (const sx of [1, -1]) {
      faces.push([gridGeo(12, 5, (u, v) => { const dx = v * e, half = b - dx, pz = -half + u * 2 * half, px = sx * (a - dx); return [px, P(dx) + L(px, pz), pz, pz, dx * 1.25]; }, [sx, 1, 0])]);
      const h1 = P(e) + L(xi, b - e);
      gables.push(gridGeo(12, 1, (u, v) => { const pz = -(b - e) + u * 2 * (b - e); const top = P(b - Math.abs(pz)) + L(xi, pz); return [sx * (xi - 0.05), h1 + (top - h1) * v, pz, pz, h1 + (top - h1) * v]; }, [sx, 0, 0]));
    }
  } else {
    for (const sx of [1, -1]) {
      const gx = a - gin;
      gables.push(gridGeo(12, 1, (u, v) => { const pz = -(b - gin) + u * 2 * (b - gin); const top = P(b - Math.abs(pz)) - 0.1; const bot = P(gin); return [sx * gx, bot + (top - bot) * v, pz, pz, bot + (top - bot) * v]; }, [sx, 0, 0]));
    }
  }
  const m4 = kit.matrix(x, y, z, ry);
  const m4u = kit.matrix(x, y - thick, z, ry);
  for (const [g] of faces) {
    kit.add(g, mat, m4, 'keep');
    const gu = g.clone();
    // 밑면: 뒤집어서 아래를 보게
    const ix = gu.index.array.slice();
    for (let k = 0; k < ix.length; k += 3) { const t = ix[k + 1]; ix[k + 1] = ix[k + 2]; ix[k + 2] = t; }
    gu.setIndex(Array.from(ix)); gu.computeVertexNormals();
    kit.add(gu, underMat, m4u, 'keep');
  }
  for (const g of gables) kit.add(g, gableMat, m4, 'box');
  // 처마 두께(평고대)
  const edge = [];
  const N = 24;
  for (let i = 0; i <= N; i++) { const px = -a + (2 * a * i) / N; edge.push([px, b]); }
  for (let i = 1; i <= N; i++) { const pz = b - (2 * b * i) / N; edge.push([a, pz]); }
  for (let i = 1; i <= N; i++) { const px = a - (2 * a * i) / N; edge.push([px, -b]); }
  for (let i = 1; i <= N; i++) { const pz = -b + (2 * b * i) / N; edge.push([-a, pz]); }
  {
    const pos = [], idx = [];
    edge.forEach(([px, pz]) => { const yy = L(px, pz); pos.push(px, yy, pz, px, yy - thick, pz); });
    for (let i = 0; i < edge.length - 1; i++) { const q = i * 2; idx.push(q, q + 1, q + 2, q + 2, q + 1, q + 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    kit.add(g, M.ridgeWhite, m4, 'box');
  }
  // 마루(용마루·추녀마루·내림마루)
  const tube = (pts, r) => {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    kit.add(new THREE.TubeGeometry(curve, Math.max(6, pts.length * 2), r, 6, false), ridgeMat, m4, 'keep');
  };
  const rr = Math.max(0.12, ridgeH * 0.35);
  // 용마루
  kit.add(new THREE.BoxGeometry(2 * xi + 0.4, ridgeH, ridgeH * 0.8), ridgeMat, kit.matrix(x, y + H + ridgeH * 0.35, z, ry), 'box');
  kit.add(new THREE.BoxGeometry(2 * xi + 0.5, ridgeH * 0.25, ridgeH * 0.95), M.ridgeWhite, kit.matrix(x, y + H + ridgeH * 0.1, z, ry), 'box');
  // 치미 대신 마루 끝 장식
  for (const sx of [1, -1]) kit.add(new THREE.BoxGeometry(0.35, ridgeH * 1.9, ridgeH * 0.9), ridgeMat, kit.matrix(x + sx * (xi + 0.1), y + H + ridgeH * 0.7, z, ry, 1, 1, 1, 0, sx * 0.25), 'box');
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    if (paljak) {
      const p1 = [];
      for (let i = 0; i <= 6; i++) { const t = i / 6, dx = t * e, px = sx * (a - dx), pz = sz * (b - dx); p1.push([px, P(dx) + L(px, pz) + rr * 0.6, pz]); }
      tube(p1, rr);
      const p2 = [];
      for (let i = 0; i <= 8; i++) { const d = e + (b - e) * (i / 8), px = sx * xi, pz = sz * (b - d); p2.push([px, P(d) + L(px, pz) + rr * 0.6, pz]); }
      tube(p2, rr * 0.9);
    } else {
      const p2 = [];
      for (let i = 0; i <= 8; i++) { const d = b * (i / 8), px = sx * (a - 0.1), pz = sz * (b - d); p2.push([px, P(d) + L(px, pz) + rr * 0.5, pz]); }
      tube(p2, rr * 0.9);
    }
  }
}

// 사방 띠(단청 창방 등): uv u는 길이 기준
function bandRing(kit, w, d, y, h, mat, period = 2.0, x = 0, z = 0) {
  const sides = [[0, d / 2, w, 0], [0, -d / 2, w, Math.PI], [w / 2, 0, d, Math.PI / 2], [-w / 2, 0, d, -Math.PI / 2]];
  for (const [sx, sz, len, ry] of sides) {
    const g = new THREE.PlaneGeometry(len, h);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len / period);
    kit.add(g, mat, kit.matrix(x + sx, y + h / 2, z + sz, ry), 'keep');
  }
}

// ---------- 한옥 건물 ----------
// bx: 앞면 칸 너비 배열, bz: 옆면 칸 너비 배열
export function hanok(kit, o) {
  const M = mats();
  const { bx = [3, 3, 3], bz = [3, 3], colH = 3.2, plat = 0.7, platPad = 1.2, roofType = 'paljak', open = false,
    over = 1.9, front = 'lattice', steps = true, lift = 0.7, wallLow = true, roofScale = 1 } = o;
  const w = bx.reduce((s, v) => s + v, 0), d = bz.reduce((s, v) => s + v, 0);
  // 기단
  kit.box(w + 2 * platPad, plat, d + 2 * platPad, M.granite, 0, 0, 0);
  kit.floor(0, 0, w / 2 + platPad, d / 2 + platPad, plat);
  if (steps && plat > 0.25) {
    const n = Math.max(2, Math.round(plat / 0.22));
    for (let i = 0; i < n; i++) {
      const sh = plat * (i + 1) / n;
      kit.box(2.6, sh, 0.35, M.granite, 0, 0, d / 2 + platPad + 0.35 * (n - i) - 0.17);
    }
    kit.floor(0, d / 2 + platPad + 0.35 * n / 2, 1.3, 0.35 * n / 2, plat, 0, [0.05, plat]);
  }
  const y0 = plat;
  // 기둥 위치
  const xs = [-w / 2]; bx.forEach((v) => xs.push(xs[xs.length - 1] + v));
  const zs = [-d / 2]; bz.forEach((v) => zs.push(zs[zs.length - 1] + v));
  const cols = [];
  xs.forEach((cx, i) => zs.forEach((cz, j) => {
    const edge = i === 0 || i === xs.length - 1 || j === 0 || j === zs.length - 1;
    if (edge) cols.push([cx, cz]);
  }));
  for (const [cx, cz] of cols) {
    kit.cyl(0.36, 0.42, 0.25, M.granite, cx, y0, cz, 10);
    kit.cyl(0.21, 0.24, colH, M.pillar, cx, y0 + 0.25, cz, 12);
    kit.solidCircle(cx, cz, 0.35, y0 + colH + 0.25, y0 - 0.1);
  }
  // 벽
  if (!open) {
    const wallH = colH - 0.2;
    const panel = (x1, z1, x2, z2, kind) => {
      const len = Math.hypot(x2 - x1, z2 - z1) - 0.42, ry = Math.atan2(-(z2 - z1), x2 - x1);
      const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
      if (kind === 'lattice') {
        kit.box(len, 0.5, 0.18, M.wood, mx, y0 + 0.25, mz, ry);
        const g = new THREE.PlaneGeometry(len, wallH - 0.5);
        const nx = Math.sin(ry) * 0, out = [Math.sign(mx) && 0, 0];
        void nx; void out;
        // 바깥을 향하도록 두 면 모두 붙인다
        kit.add(g, M.lattice, kit.matrix(mx, y0 + 0.25 + 0.5 + (wallH - 0.5) / 2, mz, ry), 'keep');
        kit.add(g, M.lattice, kit.matrix(mx, y0 + 0.25 + 0.5 + (wallH - 0.5) / 2, mz, ry + Math.PI), 'keep');
      } else {
        if (wallLow) kit.box(len, 0.7, 0.24, M.wood, mx, y0 + 0.25, mz, ry);
        kit.box(len, wallH - (wallLow ? 0.7 : 0), 0.22, M.plaster, mx, y0 + 0.25 + (wallLow ? 0.7 : 0), mz, ry);
        // 중깃 나무 띠
        kit.box(len, 0.12, 0.25, M.wood, mx, y0 + 0.25 + wallH * 0.62, mz, ry);
      }
    };
    for (let i = 0; i < xs.length - 1; i++) {
      panel(xs[i], d / 2, xs[i + 1], d / 2, front === 'lattice' ? 'lattice' : 'plaster');
      panel(xs[i], -d / 2, xs[i + 1], -d / 2, 'plaster');
    }
    for (let j = 0; j < zs.length - 1; j++) {
      panel(w / 2, zs[j], w / 2, zs[j + 1], 'plaster');
      panel(-w / 2, zs[j], -w / 2, zs[j + 1], 'plaster');
    }
    kit.solidBox(0, 0, w / 2, d / 2, y0 + colH + 1, y0 - 0.2);
  } else {
    kit.box(w, 0.15, d, M.floor, 0, y0, 0);
  }
  // 창방(단청)과 공포
  const yb = y0 + 0.25 + colH;
  bandRing(kit, w + 0.06, d + 0.06, yb - 0.38, 0.36, M.dancheong);
  kit.box(w + 0.3, 0.2, d + 0.3, M.green, 0, yb - 0.02, 0);
  for (const [cx, cz] of cols) {
    kit.box(0.5, 0.25, 0.5, M.green, cx, yb + 0.18, cz);
    kit.box(1.3, 0.18, 0.22, M.green, cx, yb + 0.42, cz, Math.abs(cz) > d / 2 - 0.1 ? 0 : Math.PI / 2);
  }
  kit.box(w + 0.6, 0.35, d + 0.6, M.green, 0, yb + 0.55, 0);
  const yr = yb + 0.85;
  const a = (w / 2 + over) * roofScale, b = (d / 2 + over) * roofScale;
  const H = Math.max(2.2, b * 0.82);
  roof(kit, { a, b, H, e: roofType === 'paljak' ? Math.min(b * 0.55, a * 0.4) : 0, lift: roofType === 'paljak' ? lift : 0.18, y: yr, ridgeH: 0.5, gin: over * roofScale });
  return { w, d, top: yr + H, colTop: yb };
}

// ---------- 담장(기와 담) ----------
export function wall(kit, x1, z1, x2, z2, h = 2.1, cap = true) {
  const M = mats();
  const len = Math.hypot(x2 - x1, z2 - z1), ry = Math.atan2(-(z2 - z1), x2 - x1);
  const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
  kit.box(len, 0.9, 0.55, M.stone, mx, 0, mz, ry);
  kit.box(len, h - 0.9, 0.42, M.plaster, mx, 0.9, mz, ry);
  if (cap) {
    const g = new THREE.CylinderGeometry(0.01, 0.55, 0.38, 4, 1);
    g.rotateY(Math.PI / 4); g.scale(1, 1, 1);
    kit.add(g, M.tile, kit.matrix(mx, h + 0.17, mz, ry, len / 0.78, 1, 1.1), 'box');
  }
  const c = Math.cos(ry), s = Math.sin(ry);
  void c; void s;
  kit.solidBox(mx, mz, len / 2, 0.3, h + 0.4, -2, ry);
}

// ---------- 석물 ----------
export function stele(kit, x, z, ry, { h = 2.6, turtle = true, w = 1.0 } = {}) {
  const M = mats();
  kit.at(x, 0, z, ry, () => {
    let top = 0.2;
    kit.box(2.4, 0.2, 3.2, M.stone, 0, 0, 0);
    if (turtle) {
      // 거북 받침(귀부): 등딱지, 머리, 발
      kit.sphere(1.2, M.statue, 0, 0.35, 0, 0.95, 0.5, 1.25, 14, 8);
      kit.sphere(0.36, M.statue, 0, 0.55, 1.55, 0.9, 0.85, 1.25, 10, 7);
      kit.cyl(0.24, 0.3, 0.45, M.statue, 0, 0.3, 1.2, 8);
      for (const [fx, fz] of [[0.95, 0.8], [-0.95, 0.8], [0.95, -0.9], [-0.95, -0.9]]) kit.sphere(0.28, M.statue, fx, 0.3, fz, 1.2, 0.7, 1.3, 8, 6);
      kit.box(1.3, 0.3, 0.6, M.statue, 0, 0.75, 0);
      top = 1.05;
    }
    kit.box(w, h, 0.32, M.granite, 0, top, 0);
    roof(kit, { a: w / 2 + 0.28, b: 0.42, H: 0.42, e: 0.18, lift: 0.08, thick: 0.12, mat: M.statue, underMat: M.statue, ridgeMat: M.statue, gableMat: M.statue, y: top + h + 0.02, ridgeH: 0.12 });
    kit.solidBox(0, 0, 1.0, 1.4, top + h);
  });
}
export function lantern(kit, x, z, s = 1) {
  const M = mats();
  kit.at(x, 0, z, 0, () => {
    kit.box(1.2 * s, 0.3 * s, 1.2 * s, M.statue, 0, 0, 0);
    kit.cyl(0.25 * s, 0.3 * s, 1.0 * s, M.statue, 0, 0.3 * s, 0, 8);
    kit.cyl(0.55 * s, 0.4 * s, 0.25 * s, M.statue, 0, 1.3 * s, 0, 8);
    kit.cyl(0.42 * s, 0.42 * s, 0.75 * s, M.statue, 0, 1.55 * s, 0, 8);
    kit.box(0.32 * s, 0.4 * s, 0.9 * s, M.dark, 0, 1.72 * s, 0);
    kit.box(0.9 * s, 0.4 * s, 0.32 * s, M.dark, 0, 1.72 * s, 0);
    kit.cyl(0.08 * s, 0.75 * s, 0.45 * s, M.statue, 0, 2.3 * s, 0, 8);
    kit.sphere(0.13 * s, M.statue, 0, 2.85 * s, 0);
    kit.solidCircle(0, 0, 0.7 * s, 3 * s);
  });
}
export function pillarStone(kit, x, z, h = 2.6) {
  const M = mats();
  kit.box(0.8, 0.4, 0.8, M.statue, x, 0, z);
  kit.cyl(0.22, 0.26, h, M.statue, x, 0.4, z, 8);
  kit.sphere(0.28, M.statue, x, 0.4 + h + 0.1, z, 1, 1.2, 1, 8, 6);
  kit.solidCircle(x, z, 0.5, h);
}
export function tableStone(kit, x, z, w = 2.2, d = 1.2) {
  const M = mats();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.cyl(0.22, 0.26, 0.45, M.statue, x + sx * (w / 2 - 0.35), 0, z + sz * (d / 2 - 0.25), 10);
  kit.box(w, 0.32, d, M.granite, x, 0.45, z);
  kit.solidBox(x, z, w / 2, d / 2, 0.8);
}
// 문인석(military=false) / 무인석(military=true)
export function official(kit, x, z, ry, military = false, s = 1) {
  const M = mats();
  kit.at(x, 0, z, ry, () => {
    kit.box(0.9 * s, 0.25 * s, 0.8 * s, M.statue, 0, 0, 0);
    const robe = [];
    const prof = military ? [[0.42, 0], [0.4, 0.4], [0.36, 0.9], [0.38, 1.25], [0.33, 1.55], [0.2, 1.68], [0, 1.7]] : [[0.45, 0], [0.42, 0.5], [0.34, 1.0], [0.33, 1.4], [0.26, 1.62], [0.15, 1.7], [0, 1.72]];
    for (const [r, y] of prof) robe.push(new THREE.Vector2(r * s, y * s));
    kit.add(new THREE.LatheGeometry(robe, 16), M.statue, kit.matrix(0, 0.25 * s, 0, 0, 0.82, 1.12, 0.7));
    // 소매와 손
    kit.sphere(0.22 * s, M.statue, 0, 1.38 * s, 0.2 * s, 1.5, 0.9, 0.9, 10, 7);
    if (!military) kit.box(0.08 * s, 0.6 * s, 0.05 * s, M.statue, 0, 1.42 * s, 0.34 * s);
    else { kit.box(0.46 * s, 0.55 * s, 0.1 * s, M.statue, 0, 1.55 * s, 0.24 * s); kit.box(0.5 * s, 0.08 * s, 0.4 * s, M.statue, 0, 1.3 * s, 0.05 * s); }
    // 머리(몸을 늘린 만큼 위로)
    kit.sphere(0.23 * s, M.statue, 0, 2.38 * s, 0.02 * s, 1, 1.15, 1, 12, 9);
    if (military) {
      kit.sphere(0.26 * s, M.statue, 0, 2.5 * s, 0, 1, 0.95, 1, 12, 8);
      kit.cyl(0.29 * s, 0.31 * s, 0.1 * s, M.statue, 0, 2.38 * s, 0, 12);
      kit.cyl(0.03 * s, 0.05 * s, 0.25 * s, M.statue, 0, 2.72 * s, 0, 6);
    } else {
      kit.box(0.42 * s, 0.32 * s, 0.4 * s, M.statue, 0, 2.52 * s, -0.03 * s);
      kit.box(0.2 * s, 0.24 * s, 0.24 * s, M.statue, 0, 2.84 * s, -0.08 * s);
    }
    kit.solidCircle(0, 0, 0.55 * s, 2.9 * s);
  });
}
// 석수: kind 'tiger' | 'sheep'
export function stoneBeast(kit, x, z, ry, kind = 'tiger', s = 1) {
  const M = mats();
  kit.at(x, 0, z, ry, () => {
    kit.box(0.9 * s, 0.2 * s, 1.5 * s, M.statue, 0, 0, 0);
    const legH = kind === 'tiger' ? 0.42 : 0.32;
    for (const [lx, lz] of [[0.22, 0.45], [-0.22, 0.45], [0.22, -0.45], [-0.22, -0.45]]) kit.cyl(0.09 * s, 0.11 * s, legH * s, M.statue, lx * s, 0.2 * s, lz * s, 6);
    const by = (0.2 + legH + 0.18) * s;
    kit.sphere(0.36 * s, M.statue, 0, by, 0, 0.85, 0.75, 1.6, 10, 7);
    if (kind === 'tiger') {
      kit.sphere(0.27 * s, M.statue, 0, by + 0.2 * s, 0.62 * s, 1.1, 0.95, 1.05, 10, 7);
      kit.sphere(0.12 * s, M.statue, 0, by + 0.12 * s, 0.85 * s, 1.2, 0.8, 1, 8, 5);
      for (const ex of [-0.15, 0.15]) kit.sphere(0.07 * s, M.statue, ex * s, by + 0.44 * s, 0.6 * s, 1, 1, 0.6, 6, 4);
      kit.cyl(0.05 * s, 0.07 * s, 0.5 * s, M.statue, 0, by - 0.2 * s, -0.65 * s, 6);
    } else {
      kit.sphere(0.24 * s, M.statue, 0, by + 0.28 * s, 0.55 * s, 0.9, 1.1, 1.15, 10, 7);
      for (const ex of [-1, 1]) kit.add(new THREE.TorusGeometry(0.12 * s, 0.05 * s, 6, 10, Math.PI * 1.4), M.statue, kit.matrix(ex * 0.2 * s, by + 0.35 * s, 0.5 * s, ex * Math.PI / 2), 'box');
    }
    kit.solidCircle(0, 0, 0.7 * s, 1.3 * s);
  });
}
// 봉분 + 병풍석 + 난간석
export function mound(kit, x, z, { r = 7, h = 4, panels = 12, panelH = 1.1, relief = 'cloud', rail = true, railR = null } = {}) {
  const M = mats();
  const pm = relief === 'zodiac' ? M.zodiac : M.relief;
  kit.at(x, 0, z, 0, () => {
    // 병풍석: 면석 12개와 우석
    for (let i = 0; i < panels; i++) {
      const t0 = (i / panels) * Math.PI * 2;
      const g = new THREE.CylinderGeometry(r + 0.05, r + 0.05, panelH, 6, 1, true, t0 + 0.03, (Math.PI * 2) / panels - 0.06);
      kit.add(g, pm, kit.matrix(0, panelH / 2, 0), 'keep');
      const ang = t0;
      kit.box(0.35, panelH + 0.05, 0.3, M.statue, Math.sin(ang) * (r + 0.05), 0, Math.cos(ang) * (r + 0.05), ang);
    }
    kit.add(new THREE.CylinderGeometry(r + 0.35, r + 0.35, 0.22, 48, 1), M.statue, kit.matrix(0, panelH + 0.11, 0));
    kit.add(new THREE.CylinderGeometry(r + 0.6, r + 0.6, 0.18, 48, 1), M.granite, kit.matrix(0, 0.09, 0));
    // 봉분
    const g = new THREE.SphereGeometry(r, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    kit.add(g, M.mound, kit.matrix(0, panelH + 0.2, 0, 0, 1, (h - panelH) / r, 1));
    kit.solidCircle(0, 0, r + 0.4, h + 0.3);
    if (rail) {
      const rr = railR || r + 2.4, n = 16;
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2;
        const px = Math.sin(t) * rr, pz = Math.cos(t) * rr;
        if (pz > rr * 0.93) continue; // 앞쪽은 들어가는 곳
        kit.cyl(0.13, 0.15, 1.05, M.statue, px, 0, pz, 8);
        kit.sphere(0.13, M.statue, px, 1.12, pz, 1, 1.3, 1, 6, 5);
        const t2 = ((i + 1) / n) * Math.PI * 2, qx = Math.sin(t2) * rr, qz = Math.cos(t2) * rr;
        if (qz > rr * 0.93) continue;
        const len = Math.hypot(qx - px, qz - pz), ry = Math.atan2(-(qz - pz), qx - px);
        for (const yy of [0.45, 0.85]) {
          const cg = new THREE.CylinderGeometry(0.06, 0.06, len, 6); cg.rotateZ(Math.PI / 2);
          kit.add(cg, M.statue, kit.matrix((px + qx) / 2, yy, (pz + qz) / 2, ry));
        }
      }
    }
  });
}
// 울퉁불퉁한 바위
export function rockGeo(r, seed = 1, squash = 0.7, detail = 2) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const R = rng(seed), p = g.attributes.position, v = new THREE.Vector3();
  const offs = []; for (let i = 0; i < 6; i++) offs.push([R() * 10, R() * 10, R() * 10, 0.6 + R() * 1.6]);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    let f = 1;
    for (const [a, b, c, k] of offs) f += Math.sin(n.x * k * 3 + a) * Math.sin(n.y * k * 3 + b) * Math.sin(n.z * k * 3 + c) * 0.12;
    v.multiplyScalar(f); v.y *= squash;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
export function tree(kit, x, z, s = 1, kind = 'broad', y = 0) {
  const M = mats();
  if (kind === 'pine') {
    kit.add(new THREE.CylinderGeometry(0.18 * s, 0.3 * s, 7 * s, 7), M.pineTrunk, kit.matrix(x, y + 3.5 * s, z, 0, 1, 1, 1, 0.08, 0.05));
    for (const [ox, oy, oz, r] of [[0, 7.2, 0, 2.4], [1.2, 6.4, 0.6, 1.7], [-1.1, 6.6, -0.5, 1.8], [0.3, 8.1, -0.4, 1.6]]) kit.add(rockGeo(r * s, Math.floor(x * 7 + oy), 0.5, 1), M.pine, kit.matrix(x + ox * s, y + oy * s, z + oz * s));
  } else if (kind === 'ginkgo') {
    kit.cyl(0.35 * s, 0.55 * s, 6 * s, M.trunk, x, y, z, 9);
    for (const [ox, oy, oz, r] of [[0, 8, 0, 3.4], [1.6, 6.8, 0.8, 2.6], [-1.6, 7, -0.6, 2.7], [0.2, 10.5, 0.2, 2.4]]) kit.add(rockGeo(r * s, Math.floor(x * 3 + oy), 0.9, 1), M.leafY, kit.matrix(x + ox * s, y + oy * s, z + oz * s));
  } else {
    kit.cyl(0.3 * s, 0.5 * s, 4.5 * s, M.trunk, x, y, z, 8);
    for (const [ox, oy, oz, r] of [[0, 6.5, 0, 3.6], [2, 5.6, 1, 2.6], [-2, 5.8, -0.8, 2.8], [0.5, 8.4, -0.5, 2.6]]) kit.add(rockGeo(r * s, Math.floor(x * 5 + oy), 0.75, 1), M.leaf, kit.matrix(x + ox * s, y + oy * s, z + oz * s));
  }
  kit.solidCircle(x, z, 0.6 * s, 8 * s);
}
