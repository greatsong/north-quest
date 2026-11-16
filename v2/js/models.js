// 미니어처 디오라마용 장난감 모형 (툰 셰이딩 로우폴리)
import * as THREE from 'three';

let grad = null;
export function gradientMap() {
  if (grad) return grad;
  const data = new Uint8Array([120, 120, 120, 255, 195, 195, 195, 255, 255, 255, 255, 255]);
  grad = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  grad.minFilter = grad.magFilter = THREE.NearestFilter;
  grad.generateMipmaps = false;
  grad.needsUpdate = true;
  return grad;
}

const matCache = new Map();
/** MeshToonMaterial 생성자는 flatShading 인자를 받지 않으므로 생성 뒤에 지정한다 */
export function toonMat(opts = {}) {
  const { flatShading, ...rest } = opts;
  const m = new THREE.MeshToonMaterial({ gradientMap: gradientMap(), ...rest });
  if (flatShading) m.flatShading = true;
  return m;
}
export function toon(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, toonMat({ color, ...opts }));
  return matCache.get(key);
}

function mesh(geo, color, x = 0, y = 0, z = 0, opts) {
  const m = new THREE.Mesh(geo, toon(color, opts));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
const FLAT = { flatShading: true };

const C = {
  stone: '#d8cfc2', stoneD: '#b3a796', roof: '#5d7d95', roofD: '#486379', red: '#d4553f',
  cream: '#fff3dc', grass: '#8fd17f', grassD: '#6fbf6a', snow: '#ffffff', water: '#79d0ef',
  sand: '#f6e0ae', gold: '#ffc94a', dark: '#3b3450', steel: '#8fa7bd', blue: '#5aa9e6',
  rock: '#bfb1c4', earth: '#c99a6b', wood: '#b9774f', pink: '#ff8fb1',
};

function baseDisc(g, r = 4.2, color = C.cream) {
  g.add(mesh(new THREE.CylinderGeometry(r, r + 0.35, 0.7, 28), color, 0, 0.35, 0));
  g.add(mesh(new THREE.CylinderGeometry(r + 0.38, r + 0.38, 0.16, 28), '#ffb5a7', 0, 0.08, 0));
}
function roof(w, d, h, color = C.roof) {
  const geo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
  geo.rotateY(Math.PI / 4);
  geo.scale(w, h, d);
  return mesh(geo, color, 0, 0, 0, FLAT);
}
function box(w, h, d, color, x = 0, y = 0, z = 0, opts) {
  return mesh(new THREE.BoxGeometry(w, h, d), color, x, y + h / 2, z, opts);
}
function cyl(rt, rb, h, color, x = 0, y = 0, z = 0, seg = 16, opts) {
  return mesh(new THREE.CylinderGeometry(rt, rb, h, seg), color, x, y + h / 2, z, opts);
}
function cone(r, h, color, x = 0, y = 0, z = 0, seg = 7, opts = FLAT) {
  return mesh(new THREE.ConeGeometry(r, h, seg), color, x, y + h / 2, z, opts);
}
function sphere(r, color, x, y, z, ws = 12, hs = 9, opts) {
  return mesh(new THREE.SphereGeometry(r, ws, hs), color, x, y, z, opts);
}
function hall(g, w, d, y, wallColor = C.cream) {
  g.add(box(w, 2.0, d, wallColor, 0, y, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.35, 2.0, 0.35, C.red, sx * (w / 2 - 0.1), y, sz * (d / 2 - 0.1)));
  const r = roof(w + 1.8, d + 1.6, 1.8);
  r.position.y = y + 2.0 + 0.9;
  g.add(r);
  g.add(box(w + 2.0, 0.25, d + 1.8, C.roofD, 0, y + 1.9, 0));
}
function miniTree(g, x, z, s = 1) {
  g.add(cyl(0.15 * s, 0.2 * s, 0.8 * s, C.wood, x, 0.7, z, 6));
  g.add(cone(0.8 * s, 2.0 * s, C.grassD, x, 0.7 + 0.6 * s, z, 6));
}
function waterDisc(g, rx, rz, x = 0, z = 0, y = 0.72) {
  const m = mesh(new THREE.CylinderGeometry(1, 1, 0.12, 24), C.water, x, y, z);
  m.scale.set(rx, 1, rz);
  g.add(m);
}

const B = {
  mountain(g) {
    g.add(cone(3.6, 7.5, '#7cc47a', 0, 0.7, 0, 7));
    g.add(cone(1.5, 3.0, C.snow, 0, 0.7 + 4.5, 0, 7));
  },
  volcano(g) {
    g.add(mesh(new THREE.CylinderGeometry(1.9, 4.2, 5.5, 9), '#b99a85', 0, 0.7 + 2.75, 0, FLAT));
    g.add(mesh(new THREE.CylinderGeometry(1.95, 2.5, 1.2, 9), C.snow, 0, 0.7 + 5.0, 0, FLAT));
    g.add(mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.3, 18), '#4fc3f7', 0, 0.7 + 5.5, 0));
  },
  peaks(g) {
    const P = [[0, 0, 7.5], [-1.9, 0.8, 5.5], [1.8, 0.4, 6.2], [0.4, -1.8, 4.6], [-0.6, 1.9, 3.8]];
    P.forEach(([x, z, h], i) => g.add(cone(1.3 + h * 0.08, h, i % 2 ? '#c7b9cf' : '#b5a7c0', x, 0.7, z, 5)));
    miniTree(g, 2.6, 2.2, 0.8); miniTree(g, -2.8, -1.6, 0.8);
  },
  range(g) {
    g.add(cone(2.6, 5.5, '#7cc47a', -2.6, 0.7, 0.4, 6));
    g.add(cone(3.0, 8.0, '#6db46c', 0, 0.7, -0.3, 6));
    g.add(cone(1.1, 2.6, C.snow, 0, 0.7 + 5.4, -0.3, 6));
    g.add(cone(2.4, 5.0, '#7cc47a', 2.7, 0.7, 0.5, 6));
  },
  plateau(g) {
    g.add(mesh(new THREE.CylinderGeometry(3.4, 4.0, 2.6, 8), '#d6b88a', 0, 0.7 + 1.3, 0, FLAT));
    g.add(mesh(new THREE.CylinderGeometry(3.42, 3.42, 0.35, 8), C.grass, 0, 0.7 + 2.65, 0, FLAT));
    for (const [x, z] of [[-1.2, 0.5], [0.9, -1.1], [1.4, 1.2], [-0.4, -1.8]]) {
      g.add(cyl(0.12, 0.16, 0.6, C.wood, x, 3.6, z, 6));
      g.add(cone(0.6, 1.5, C.grassD, x, 4.0, z, 6));
    }
  },
  temple(g) {
    g.add(box(6.4, 0.8, 4.8, C.stone, 0, 0.7, 0));
    hall(g, 4.4, 2.8, 1.5);
    g.add(box(0.3, 0.5, 0.3, C.gold, 0, 5.6, 0));
    miniTree(g, -3.4, 2.2, 0.8);
  },
  pavilion(g) {
    g.add(box(5.2, 1.2, 5.2, C.stoneD, 0, 0.7, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.22, 0.25, 2.6, C.red, sx * 1.9, 1.9, sz * 1.9, 8));
    const r = roof(6.4, 6.4, 2.0); r.position.y = 4.5 + 1.0; g.add(r);
    g.add(box(6.6, 0.25, 6.6, C.roofD, 0, 4.4, 0));
  },
  gate(g) {
    g.add(box(7.4, 3.2, 2.6, C.stone, 0, 0.7, 0, FLAT));
    g.add(box(1.7, 2.0, 2.7, C.dark, 0, 0.7, 0));
    g.add(box(4.4, 0.4, 2.4, C.stoneD, 0, 3.9, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.18, 0.2, 1.6, C.red, sx * 1.8, 4.3, sz * 0.8, 8));
    const r = roof(5.4, 3.4, 1.6); r.position.y = 5.9 + 0.8; g.add(r);
    g.add(box(5.6, 0.22, 3.4, C.roofD, 0, 5.85, 0));
  },
  palace(g) {
    g.add(box(7.6, 0.6, 5.6, C.stone, 0, 0.7, 0));
    g.add(box(6.6, 0.6, 4.6, C.stoneD, 0, 1.3, 0));
    hall(g, 5.0, 2.8, 1.9);
  },
  tower(g) {
    g.add(box(5, 0.6, 5, C.stone, 0, 0.7, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.8, 3.4, 0.8, C.stoneD, sx * 1.4, 1.3, sz * 1.4, FLAT));
    g.add(box(4.2, 0.8, 4.2, C.stone, 0, 4.7, 0, FLAT));
    g.add(box(2.2, 0.5, 2.2, C.stoneD, 0, 5.5, 0, FLAT));
  },
  stoneBridge(g) {
    waterDisc(g, 3.8, 1.6);
    g.add(box(2.6, 0.9, 7.6, C.stone, 0, 0.8, 0, FLAT));
    for (const sx of [-1, 1]) g.add(box(0.3, 0.6, 7.6, C.stoneD, sx * 1.2, 1.7, 0));
    g.add(box(2.7, 0.6, 1.4, C.dark, 0, 0.75, 0));
  },
  brokenBridge(g) {
    waterDisc(g, 4, 2.4);
    for (const x of [-3, -0.6, 1.8]) g.add(box(0.8, 2.6, 1.6, C.stoneD, x, 0.7, 0));
    g.add(box(4.6, 0.5, 1.8, C.steel, -1.9, 3.3, 0));
    for (const x of [-3.6, -2.4, -1.2, 0]) {
      const b = box(0.2, 2.2, 0.2, C.steel, x, 3.8, 0.8); b.rotation.z = 0.5; g.add(b);
      const b2 = b.clone(); b2.position.z = -0.8; g.add(b2);
    }
    g.add(box(4.6, 0.2, 0.2, C.steel, -1.9, 5.6, 0.8));
    g.add(box(4.6, 0.2, 0.2, C.steel, -1.9, 5.6, -0.8));
  },
  bridge(g) {
    waterDisc(g, 4, 2.4);
    for (const x of [-3, 0, 3]) g.add(box(0.8, 2.4, 1.6, C.stoneD, x, 0.7, 0));
    g.add(box(7.6, 0.5, 1.8, '#9fb8a0', 0, 3.1, 0));
    for (let x = -3.4; x <= 3.4; x += 1.7) {
      const b = box(0.2, 2.0, 0.2, '#9fb8a0', x, 3.6, 0.8); b.rotation.z = 0.5; g.add(b);
      const b2 = b.clone(); b2.position.z = -0.8; g.add(b2);
    }
  },
  tomb(g) {
    const m = sphere(3.0, C.grass, 0, 0.7, 0, 16, 10, FLAT); m.scale.y = 0.62; g.add(m);
    g.add(box(1.6, 0.5, 0.9, C.stone, 0, 0.7, 3.2));
    g.add(box(0.7, 1.6, 0.35, C.stoneD, -2.4, 0.7, 2.6));
  },
  tomb2(g) {
    for (const x of [-1.8, 1.8]) { const m = sphere(2.1, C.grass, x, 0.7, 0, 14, 9, FLAT); m.scale.y = 0.7; g.add(m); }
    g.add(box(1.0, 1.6, 0.4, C.stoneD, -3.3, 0.7, 2.2));
    g.add(box(1.0, 1.6, 0.4, C.stoneD, 3.3, 0.7, 2.2));
  },
  tomb3(g) {
    for (const [x, z, r] of [[-2.2, 0.8, 1.7], [2.2, 0.8, 1.7], [0, -1.4, 2.2]]) {
      const m = sphere(r, C.grass, x, 0.7, z, 14, 9, FLAT); m.scale.y = 0.7; g.add(m);
    }
    g.add(box(1.0, 0.8, 0.6, C.dark, 0, 0.7, 0.8));
  },
  pyramid(g) {
    for (let i = 0; i < 6; i++) { const s = 6.6 - i * 1.0; g.add(box(s, 0.9, s, i % 2 ? C.stoneD : C.stone, 0, 0.7 + i * 0.9, 0)); }
  },
  waterfall(g) {
    g.add(box(5.4, 7.0, 3.0, '#b9a99b', 0, 0.7, -1.4, FLAT));
    g.add(box(1.7, 6.6, 0.4, '#d6f6ff', 0, 1.0, 0.15));
    waterDisc(g, 2.6, 1.6, 0, 1.6, 0.75);
    for (const [x, z] of [[-0.8, 1.6], [0.7, 1.9], [0, 2.4]]) g.add(sphere(0.6, '#ffffff', x, 1.3, z, 8, 6));
    miniTree(g, -2.4, 0.5, 0.7); miniTree(g, 2.4, 0.4, 0.8);
  },
  lake(g) {
    waterDisc(g, 3.2, 2.2);
    g.add(cone(1.6, 3.2, '#7cc47a', -3.0, 0.7, -1.8, 6));
    g.add(cone(1.9, 4.0, '#6db46c', 2.6, 0.7, -2.0, 6));
    g.add(cone(1.4, 2.6, '#7cc47a', 3.2, 0.7, 1.8, 6));
    g.add(box(1.2, 0.35, 0.6, C.wood, -0.4, 0.75, 0.3));
  },
  dam(g) {
    waterDisc(g, 3.6, 2.0, 0, -1.6, 0.9);
    g.add(box(8.0, 3.4, 1.4, '#e3e1d6', 0, 0.7, 0.5, FLAT));
    for (let x = -3; x <= 3; x += 1.5) g.add(box(0.7, 2.0, 0.2, C.dark, x, 1.2, 1.25));
    g.add(box(8.2, 0.3, 1.8, C.stoneD, 0, 4.1, 0.5));
  },
  ship(g) {
    waterDisc(g, 4, 2.8);
    g.add(box(6.2, 1.4, 2.2, '#3f5a8a', 0, 0.8, 0));
    g.add(box(6.3, 0.35, 2.3, C.red, 0, 0.8, 0));
    const bow = mesh(new THREE.CylinderGeometry(0.01, 1.1, 1.4, 4), '#3f5a8a', 3.6, 1.5, 0, FLAT);
    bow.rotation.z = Math.PI / 2; bow.rotation.x = Math.PI / 4; g.add(bow);
    g.add(box(2.0, 1.4, 1.6, C.cream, -1.2, 2.2, 0));
    g.add(cyl(0.35, 0.35, 1.2, C.gold, -1.4, 3.6, 0, 10));
    g.add(box(0.15, 3.0, 0.15, C.dark, 1.4, 2.2, 0));
  },
  stele(g) {
    g.add(box(3.0, 0.8, 3.0, C.stoneD, 0, 0.7, 0));
    const s = mesh(new THREE.CylinderGeometry(0.85, 1.05, 6.4, 4), '#9c9486', 0, 1.5 + 3.2, 0, FLAT);
    s.rotation.y = Math.PI / 4; g.add(s);
    miniTree(g, 2.6, -1.6, 0.8);
  },
  school(g) {
    g.add(box(6.0, 2.4, 3.2, '#e0856b', 0, 0.7, 0));
    const r = mesh(new THREE.CylinderGeometry(2.0, 2.0, 6.4, 3), C.roof, 0, 3.6, 0, FLAT);
    r.rotation.z = Math.PI / 2; r.scale.set(1, 1, 0.55); g.add(r);
    for (let x = -2; x <= 2; x += 1.3) g.add(box(0.7, 0.8, 0.1, '#bfe8ff', x, 1.6, 1.62));
    g.add(box(0.12, 4.5, 0.12, C.dark, 3.7, 0.7, 1.6));
    g.add(box(1.4, 0.9, 0.06, C.gold, 4.4, 4.2, 1.6));
  },
  islandFlag(g) {
    waterDisc(g, 4.0, 3.0);
    const m = sphere(2.6, C.grass, 0, 0.6, 0, 14, 8, FLAT); m.scale.y = 0.4; g.add(m);
    g.add(box(0.16, 5.2, 0.16, C.dark, 0, 1.2, 0));
    g.add(box(2.2, 1.3, 0.08, C.gold, 1.1, 5.0, 0));
    miniTree(g, -1.4, 1.0, 0.6);
  },
  swords(g) {
    g.add(mesh(new THREE.DodecahedronGeometry(2.2, 0), C.stoneD, 0, 1.4, 0, FLAT));
    for (const s of [-1, 1]) {
      const sw = new THREE.Group();
      sw.add(box(0.45, 6.0, 0.12, '#e8eef5', 0, 0, 0));
      sw.add(box(1.8, 0.3, 0.4, C.gold, 0, -0.2, 0));
      sw.add(box(0.35, 1.2, 0.35, C.wood, 0, -1.4, 0));
      sw.position.set(s * 0.4, 3.2, 0.4);
      sw.rotation.z = s * 0.5;
      g.add(sw);
    }
    const sh = mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.3, 16), C.red, 0, 3.0, 1.0);
    sh.rotation.x = Math.PI / 2;
    g.add(sh);
  },
  lighthouse(g) {
    g.add(mesh(new THREE.DodecahedronGeometry(2.6, 0), '#b8aa9e', 0, 1.2, 0, FLAT));
    for (let i = 0; i < 4; i++) g.add(cyl(0.95 - i * 0.08, 1.05 - i * 0.08, 1.2, i % 2 ? '#ffffff' : C.red, 0, 2.6 + i * 1.2, 0, 12));
    g.add(cyl(0.7, 0.7, 0.9, '#fff5a8', 0, 7.4, 0, 10, { emissive: '#ffe066', emissiveIntensity: 0.6 }));
    g.add(cone(0.9, 0.9, C.red, 0, 8.3, 0, 10));
  },
  beach(g) {
    const s = mesh(new THREE.CylinderGeometry(4, 4.2, 0.4, 24), C.sand, 0, 0.9, 0); g.add(s);
    waterDisc(g, 4.4, 1.6, 0, 3.6, 0.8);
    g.add(box(0.15, 3.6, 0.15, C.cream, 0, 1.1, 0));
    const u = mesh(new THREE.ConeGeometry(2.4, 1.2, 10), '#ff8fa3', 0, 4.9, 0, FLAT); g.add(u);
    for (const [x, z] of [[-2.4, -1.4], [-1.6, -2.2], [2.2, -1.6]]) {
      g.add(sphere(0.55, C.grassD, x, 1.5, z, 8, 6));
      g.add(sphere(0.3, C.pink, x + 0.2, 1.9, z + 0.3, 8, 6));
    }
  },
  thermometer(g) {
    for (const [x, z, r] of [[-2, 1, 1.4], [2.2, -0.5, 1.1], [0.6, 2.2, 1.0]]) g.add(sphere(r, C.snow, x, 0.9, z, 10, 8));
    g.add(cyl(0.55, 0.55, 6.2, '#eaf6ff', 0, 1.6, 0, 12));
    g.add(sphere(1.0, '#4aa3ff', 0, 1.6, 0, 12, 10));
    g.add(cyl(0.3, 0.3, 1.6, '#4aa3ff', 0, 1.8, 0.3, 8));
    for (let i = 0; i < 5; i++) g.add(box(0.5, 0.08, 0.08, C.dark, -0.55, 2.8 + i * 1.0, 0.35));
  },
  huts(g) {
    g.add(box(8.2, 0.25, 0.5, C.stone, 0, 0.7, 0));
    for (const x of [-2.6, 0, 2.6]) {
      g.add(box(1.9, 2.4, 3.4, '#6db5ef', x, 0.8, 0));
      g.add(box(2.1, 0.25, 3.6, '#4d8fc6', x, 3.2, 0));
    }
  },
  factory(g) {
    g.add(box(6.6, 2.2, 3.6, '#e9e4da', 0, 0.7, 0));
    for (let i = 0; i < 3; i++) {
      const w = mesh(new THREE.CylinderGeometry(1.2, 1.2, 3.6, 3), '#9cc2d9', -2.2 + i * 2.2, 3.3, 0, FLAT);
      w.rotation.x = Math.PI / 2; w.rotation.y = Math.PI / 2; w.scale.set(0.8, 1, 1); g.add(w);
    }
    g.add(cyl(0.45, 0.55, 5.0, C.red, 3.6, 0.7, -1.0, 10));
    g.add(sphere(0.8, '#ffffff', 3.8, 6.4, -1.0, 8, 6));
    g.add(sphere(0.6, '#ffffff', 4.5, 7.2, -1.2, 8, 6));
  },
  earthwall(g) {
    const t = mesh(new THREE.TorusGeometry(3.0, 0.8, 5, 14), C.earth, 0, 1.0, 0, FLAT);
    t.rotation.x = Math.PI / 2; t.scale.z = 1.3; g.add(t);
    g.add(box(2.0, 1.4, 1.6, C.cream, 0, 0.7, 0));
    const r = roof(2.8, 2.2, 1.2); r.position.y = 2.7; g.add(r);
  },
  fortressMesa(g) {
    g.add(mesh(new THREE.CylinderGeometry(2.8, 3.7, 6.0, 7), '#b5a08e', 0, 0.7 + 3.0, 0, FLAT));
    g.add(mesh(new THREE.CylinderGeometry(2.82, 2.82, 0.3, 7), C.grass, 0, 6.85, 0, FLAT));
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      g.add(box(0.6, 0.7, 0.6, C.stone, Math.cos(a) * 2.4, 7.0, Math.sin(a) * 2.4));
    }
  },
};

export const LANDMARK_TYPES = Object.keys(B);

export function buildLandmark(type) {
  const g = new THREE.Group();
  baseDisc(g);
  (B[type] || B.mountain)(g);
  return g;
}

export function buildPawn() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  body.add(cyl(2.0, 2.3, 0.9, C.cream, 0, 0, 0, 28));
  body.add(cyl(2.12, 2.12, 0.28, '#ff9a8b', 0, 0.62, 0, 28));
  const prof = [[0.01, 0.9], [1.7, 0.9], [1.45, 1.5], [1.05, 2.6], [0.9, 3.5], [1.25, 3.85], [1.25, 4.1], [0.6, 4.3], [0.01, 4.3]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  body.add(mesh(new THREE.LatheGeometry(prof, 24), '#ff6f61'));
  body.add(sphere(1.5, '#ffe2c8', 0, 5.45, 0, 20, 16));
  for (const s of [-1, 1]) {
    body.add(sphere(0.19, '#2b2440', s * 0.5, 5.6, 1.36, 8, 6));
    body.add(sphere(0.07, '#ffffff', s * 0.5 + 0.06, 5.68, 1.52, 6, 4));
    const ch = sphere(0.28, '#ff9fae', s * 0.9, 5.15, 1.15, 8, 6); ch.scale.z = 0.4; body.add(ch);
  }
  body.add(cyl(2.05, 2.05, 0.2, '#d9b36b', 0, 6.35, 0, 24));
  body.add(cyl(1.08, 1.25, 1.1, '#e7c47f', 0, 6.5, 0, 20));
  body.add(cyl(1.27, 1.27, 0.3, '#8a5a3c', 0, 6.55, 0, 20));
  body.add(box(1.5, 1.7, 0.8, '#4fc39a', 0, 2.4, -1.15));
  body.add(box(1.0, 0.5, 0.2, '#ffd166', 0, 3.0, -1.6));
  return { group: g, body };
}

export function buildDart() {
  const g = new THREE.Group();
  const tip = mesh(new THREE.ConeGeometry(0.28, 1.4, 10), '#dfe7ee', 0, 0, 0);
  tip.rotation.x = Math.PI / 2; tip.position.z = 3.0; g.add(tip);
  const shaft = mesh(new THREE.CylinderGeometry(0.32, 0.32, 3.2, 12), '#ff6f61', 0, 0, 0);
  shaft.rotation.x = Math.PI / 2; shaft.position.z = 0.8; g.add(shaft);
  const band = mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.5, 12), '#ffd166', 0, 0, 0);
  band.rotation.x = Math.PI / 2; band.position.z = 1.8; g.add(band);
  for (let i = 0; i < 3; i++) {
    const f = mesh(new THREE.BoxGeometry(0.08, 1.4, 1.8), i === 0 ? '#4fc39a' : '#6ec3ff', 0, 0, 0);
    const a = (i / 3) * Math.PI * 2;
    f.position.set(Math.cos(a) * 0.6, Math.sin(a) * 0.6, -1.0);
    f.rotation.z = a + Math.PI / 2;
    g.add(f);
  }
  return g;
}

export function buildStarToken() {
  const g = new THREE.Group();
  g.add(cyl(2.4, 2.6, 0.6, '#fff1b8', 0, 0, 0, 24));
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.75 : 1.8, a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    i ? shape.lineTo(x, y) : shape.moveTo(x, y);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.15, bevelSegments: 1 });
  geo.center();
  const star = mesh(geo, C.gold, 0, 3.4, 0, { emissive: '#ffb300', emissiveIntensity: 0.35 });
  g.add(star);
  g.userData.star = star;
  return g;
}

export function buildCloud(rand) {
  const g = new THREE.Group();
  const mat = toonMat({ color: '#ffffff', transparent: true, opacity: 0.92, flatShading: true });
  const n = 4 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const r = 5 + rand() * 6;
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat);
    m.position.set((i - n / 2) * 6 + rand() * 3, rand() * 3, rand() * 6 - 3);
    m.scale.y = 0.75;
    g.add(m);
  }
  g.userData.mat = mat;
  return g;
}

export function buildFlag(color = '#ff6f61') {
  const g = new THREE.Group();
  g.add(cyl(0.9, 1.1, 0.4, C.cream, 0, 0, 0, 16));
  g.add(box(0.18, 6.5, 0.18, C.dark, 0, 0.3, 0));
  const f = mesh(new THREE.BoxGeometry(2.6, 1.6, 0.08), color, 1.3, 6.0, 0);
  g.add(f);
  return g;
}
