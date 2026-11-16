// 3D 장면: 홀로그램 지도 테이블, 빛 기둥, 카메라 이동, 선택
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { WORLD_W, WORLD_H, lonLatToWorld, loadHeights } from '../../shared/geo.js';
import { ERAS, parseEras } from './data.js';

const EXAG = 9;      // 육지 고도 과장 배율
const SEA_EX = 1.6;  // 바다 깊이 배율
const DATA = '../shared/data';

export const W = {
  renderer: null, scene: null, camera: null, controls: null, composer: null, bloom: null,
  heights: null, terrain: null, tMat: null, markers: [], byId: {}, lines: {}, labels: [],
  provLabels: [], clusterLabels: {}, signal: null, reticle: null, arcs: [], fx: [],
  flying: null, keys: {}, view: 0, mix: 0, mixTarget: 0, lowres: false,
  labelMode: { sites: 'active', provinces: true, showCollected: null },
  onMarkerHover: null, hovered: null, idle: true, ks: 1, kh: 1,
};

export function heightAt(x, z) {
  const m = W.heights.sampleWorld(x, z);
  return m > 0 ? (m / 1000) * EXAG : (m / 1000) * SEA_EX;
}
export function groundY(x, z) { return Math.max(heightAt(x, z), 0); }

// ---------------- 초기화 ----------------
export async function initWorld(container, { lowres = false } = {}) {
  W.lowres = lowres;
  const renderer = new THREE.WebGLRenderer({ antialias: !lowres, powerPreference: 'high-performance' });
  renderer.setPixelRatio(lowres ? 1 : Math.min(devicePixelRatio, 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  W.renderer = renderer;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#02060d');
  W.scene = scene;

  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 1, 6000);
  camera.position.set(0, 700, 620);
  W.camera = camera;

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.screenSpacePanning = false;
  controls.minDistance = 18; controls.maxDistance = 1300;
  controls.maxPolarAngle = 1.38; controls.minPolarAngle = 0.05;
  controls.rotateSpeed = 0.6; controls.zoomSpeed = 1.1; controls.panSpeed = 1.0;
  controls.autoRotateSpeed = 0.35;
  controls.target.set(0, 0, 10);
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  controls.addEventListener('start', () => { W.idle = false; });
  W.controls = controls;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bs = lowres ? 0.5 : 1;
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth * bs, innerHeight * bs), 0.85, 0.55, 0.62);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  W.composer = composer; W.bloom = bloom;

  const [heights, colorTex, maskTex] = await Promise.all([
    loadHeights(DATA, lowres ? '384x387' : '768x775'),
    new THREE.TextureLoader().loadAsync(`${DATA}/colormap.jpg`),
    new THREE.TextureLoader().loadAsync(`${DATA}/mask.png`),
  ]);
  W.heights = heights;
  colorTex.colorSpace = THREE.SRGBColorSpace;
  colorTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  maskTex.colorSpace = THREE.NoColorSpace;

  buildTable();
  buildTerrain(colorTex, maskTex);
  buildStars();
  buildSignal();
  buildReticle();

  addEventListener('resize', onResize);
  addEventListener('keydown', (e) => { if (!e.target.closest('input,textarea')) W.keys[e.key.toLowerCase()] = true; });
  addEventListener('keyup', (e) => { W.keys[e.key.toLowerCase()] = false; });
  renderer.domElement.addEventListener('pointermove', onHoverMove);
  renderer.setAnimationLoop(tick);
  return W;
}

function onResize() {
  const w = innerWidth, h = innerHeight;
  W.camera.aspect = w / h; W.camera.updateProjectionMatrix();
  W.renderer.setSize(w, h); W.composer.setSize(w, h);
  const bs = W.lowres ? 0.5 : 1;
  W.bloom.setSize(w * bs, h * bs);
  for (const k in W.lines) W.lines[k].material.resolution.set(w, h);
  for (const a of W.arcs) a.material.resolution.set(w, h);
}

// ---------------- 지형 ----------------
const terrainVS = /* glsl */`
  uniform float uExag; uniform float uSeaEx;
  varying vec2 vUv; varying vec3 vWorld; varying vec3 vN; varying float vElev;
  void main(){
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position,1.0);
    vWorld = wp.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    vElev = position.y > 0.0 ? position.y / uExag * 1000.0 : position.y / uSeaEx * 1000.0;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const terrainFS = /* glsl */`
  uniform sampler2D uColor; uniform sampler2D uMask;
  uniform float uMix; uniform float uTime; uniform float uScan; uniform float uGrid;
  uniform vec4 uHalo[16]; uniform vec3 uHaloCol[16]; uniform int uHaloN;
  uniform float uDim;
  varying vec2 vUv; varying vec3 vWorld; varying vec3 vN; varying float vElev;
  float line(float v, float interval, float w){
    float f = v / interval;
    float fw = max(fwidth(f), 1e-4);
    float d = abs(fract(f - 0.5) - 0.5) / fw;
    return (1.0 - clamp(d / w, 0.0, 1.0)) * (1.0 - smoothstep(0.08, 0.4, fw));
  }
  void main(){
    vec4 m = texture2D(uMask, vUv);
    float dprk = smoothstep(0.3, 0.7, m.r);
    float sea = smoothstep(0.3, 0.7, m.g) * (1.0 - dprk);
    float foreign = clamp(1.0 - dprk - sea, 0.0, 1.0);
    float river = smoothstep(0.25, 0.9, m.b);
    vec3 N = normalize(vN);
    float diff = clamp(dot(N, normalize(vec3(-0.45, 0.8, -0.35))), 0.0, 1.0);
    float slope = 1.0 - N.y;

    // 실제 색 지도
    vec3 real = texture2D(uColor, vUv).rgb * (0.82 + 0.32 * diff);

    // 홀로그램
    float e = max(vElev, 0.0);
    float hk = clamp(e / 2300.0, 0.0, 1.0);
    vec3 cyan = vec3(0.12, 0.92, 1.0);
    vec3 hot = vec3(1.0, 0.62, 0.22);
    vec3 cLine = mix(cyan, mix(vec3(0.75,1.0,1.0), hot, smoothstep(0.55, 0.95, hk)), smoothstep(0.25, 0.8, hk));
    float c1 = line(vElev, 100.0, 0.9);
    float c5 = line(vElev, 500.0, 1.3);
    vec3 holoBase = mix(vec3(0.006, 0.03, 0.05), vec3(0.02, 0.10, 0.13), hk) * (0.35 + 1.1 * diff);
    vec3 seaBase = vec3(0.003, 0.012, 0.03) + vec3(0.0, 0.02, 0.05) * smoothstep(-2500.0, 0.0, vElev);
    vec3 forBase = vec3(0.022, 0.024, 0.032) * (0.4 + 1.0 * diff);
    vec3 holo = holoBase * dprk + seaBase * sea + forBase * foreign;

    vec3 lines = vec3(0.0);
    lines += cLine * (c1 * 0.2 + c5 * 0.9) * dprk;
    lines += cLine * slope * 0.18 * dprk;
    lines += vec3(0.75, 0.55, 0.38) * (c1 * 0.05 + c5 * 0.22) * foreign;
    float b2 = line(vElev, 400.0, 1.0);
    lines += vec3(0.05, 0.28, 0.6) * b2 * 0.35 * sea;
    lines += vec3(0.35, 0.9, 1.0) * river * (dprk * 0.9 + foreign * 0.3);
    // 격자 (50 km)
    float gx = line(vWorld.x, 50.0, 1.0), gz = line(vWorld.z, 50.0, 1.0);
    lines += cyan * max(gx, gz) * 0.07 * uGrid;
    // 스캔 라인
    float sd = vWorld.z - uScan;
    float band = exp(-sd * sd / 90.0);
    float trail = sd < 0.0 ? exp(sd / 40.0) : 0.0;
    lines += cyan * (band * 0.9 + trail * 0.18) * (c1 + c5 + 0.15) * (dprk + 0.25);
    lines += cyan * smoothstep(1.2, 0.0, abs(sd)) * 0.25;
    // 테두리
    float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    lines += cyan * smoothstep(0.004, 0.0, edge) * 1.2;

    // 시대 후광
    vec3 halo = vec3(0.0);
    for (int i = 0; i < 16; i++) {
      if (i >= uHaloN) break;
      vec4 h = uHalo[i];
      float d = length(vWorld.xz - h.xy);
      float g = exp(-d * d / (h.z * h.z)) * h.w;
      float ring = smoothstep(1.2, 0.0, abs(d - h.z * 0.9)) * h.w * 0.6;
      halo += uHaloCol[i] * (g * 0.35 + ring);
    }

    float lineAmt = 1.0 - smoothstep(0.55, 1.0, uMix) * 0.88;
    vec3 col = mix(holo, real * (1.0 - 0.45 * foreign), uMix) + lines * lineAmt + halo;
    col *= mix(1.0, 0.45, uDim);
    col *= smoothstep(0.0, 0.012, edge) * 0.85 + 0.15;
    gl_FragColor = vec4(col, 1.0);
  }`;

function buildTerrain(colorTex, maskTex) {
  const { w, h, data } = W.heights;
  const geo = new THREE.PlaneGeometry(WORLD_W, WORLD_H, w - 1, h - 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const m = data[i];
    pos.setY(i, m > 0 ? (m / 1000) * EXAG : Math.max(m, -3500) / 1000 * SEA_EX);
  }
  geo.computeVertexNormals();
  const halo = Array.from({ length: 16 }, () => new THREE.Vector4());
  const haloCol = Array.from({ length: 16 }, () => new THREE.Color());
  const mat = new THREE.ShaderMaterial({
    vertexShader: terrainVS, fragmentShader: terrainFS,
    uniforms: {
      uColor: { value: colorTex }, uMask: { value: maskTex }, uMix: { value: 0 }, uTime: { value: 0 },
      uScan: { value: -400 }, uGrid: { value: 1 }, uExag: { value: EXAG }, uSeaEx: { value: SEA_EX },
      uHalo: { value: halo }, uHaloCol: { value: haloCol }, uHaloN: { value: 0 }, uDim: { value: 0 },
    },
  });
  const mesh = new THREE.Mesh(geo, mat);
  W.scene.add(mesh);
  W.terrain = mesh; W.tMat = mat;
}

function buildTable() {
  // 관제실 테이블 원판
  const R = 560;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(R, 128).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: `uniform float uTime; varying vec2 vP;
      float ln(float v, float k, float w){ float f=v/k; float d=abs(fract(f-0.5)-0.5)/max(fwidth(f),1e-4); return 1.0-clamp(d/w,0.0,1.0);}
      void main(){
        float r = length(vP); float a = atan(vP.y, vP.x);
        vec3 c = vec3(0.01,0.03,0.05) * (1.0 - r/600.0);
        float rings = ln(r, 40.0, 1.0) * 0.12 + ln(r, 200.0, 1.2) * 0.25;
        float spokes = ln(a * 57.2958, 15.0, 1.0) * 0.06 * smoothstep(330.0, 420.0, r);
        float rim = smoothstep(6.0, 0.0, abs(r - 540.0)) * 0.9 + smoothstep(2.0, 0.0, abs(r - 470.0)) * 0.5;
        float ticks = step(0.5, fract(a * 57.2958 / 3.0 + uTime*0.02)) * smoothstep(3.0,0.0,abs(r-505.0)) * 0.6;
        vec3 col = c + vec3(0.1,0.85,1.0) * (rings + spokes + rim + ticks);
        float alpha = smoothstep(${R}.0, ${R - 30}.0, r);
        gl_FragColor = vec4(col, alpha);
      }`,
  }));
  disc.position.y = -6.5;
  W.scene.add(disc);
  W.table = disc;
  // 회전 링
  const ringMat = (color, dash) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(color) }, uDash: { value: dash } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: `uniform vec3 uColor; uniform float uDash; varying vec2 vUv; void main(){ float s = step(0.45, fract(vUv.x*uDash)); gl_FragColor = vec4(uColor, 0.75*s);} `,
  });
  const mkRing = (r1, r2, color, dash, y) => {
    const g = new THREE.RingGeometry(r1, r2, 256, 1);
    // 각도 방향 uv
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { uv.setX(i, (Math.atan2(p.getY(i), p.getX(i)) / (Math.PI * 2) + 1) % 1); }
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, ringMat(color, dash)); m.position.y = y; W.scene.add(m); return m;
  };
  W.rings = [mkRing(486, 492, '#3ff4ff', 90, -6), mkRing(512, 515, '#ffb547', 36, -6), mkRing(550, 552, '#3ff4ff', 180, -6.2)];
  // 북쪽 표시
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#ffb547'; g.font = '900 84px "Black Han Sans", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('N', 64, 70);
  const sp = new THREE.Mesh(new THREE.PlaneGeometry(36, 36), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sp.rotation.x = -Math.PI / 2; sp.position.set(0, -5.8, -WORLD_H / 2 - 40);
  W.scene.add(sp);
  // 지도 둘레 빛 벽
  const wallMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: `uniform float uTime; varying vec2 vUv; void main(){ float a = pow(1.0 - vUv.y, 2.0) * 0.28; a *= 0.8 + 0.2*sin(vUv.x*300.0 + uTime*2.0); gl_FragColor = vec4(0.15,0.9,1.0, a);} `,
  });
  W.wallMat = wallMat;
  const hW = WORLD_W / 2, hH = WORLD_H / 2, wh = 14;
  const walls = [[WORLD_W, 0, -hH, 0], [WORLD_W, 0, hH, Math.PI], [WORLD_H, hW, 0, -Math.PI / 2], [WORLD_H, -hW, 0, Math.PI / 2]];
  for (const [len, x, z, ry] of walls) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, wh), wallMat);
    m.position.set(x, -6.5 + wh / 2, z); m.rotation.y = ry; W.scene.add(m);
  }
}

function buildStars() {
  const n = 1800, p = new Float32Array(n * 3), c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, r = 2200 + Math.random() * 1500;
    const s = Math.sqrt(1 - u * u);
    p[i * 3] = r * s * Math.cos(t); p[i * 3 + 1] = Math.abs(r * u) * 0.9 - 300; p[i * 3 + 2] = r * s * Math.sin(t);
    const k = 0.4 + Math.random() * 0.6, warm = Math.random() < 0.15;
    c[i * 3] = warm ? k : k * 0.6; c[i * 3 + 1] = warm ? k * 0.7 : k * 0.9; c[i * 3 + 2] = warm ? k * 0.4 : k;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false }));
  W.scene.add(pts); W.stars = pts;
}

// ---------------- 선(국경·해안·도 경계) ----------------
function drapedSegments(polys, lift = 0.45, step = 1.6) {
  const out = [];
  for (const line of polys) {
    let prev = null;
    for (const [lon, lat] of line) {
      const p = lonLatToWorld(lon, lat);
      if (prev) {
        const dx = p.x - prev.x, dz = p.z - prev.z, len = Math.hypot(dx, dz);
        const n = Math.max(1, Math.ceil(len / step));
        let a = prev;
        for (let i = 1; i <= n; i++) {
          const b = { x: prev.x + (dx * i) / n, z: prev.z + (dz * i) / n };
          out.push(a.x, groundY(a.x, a.z) + lift, a.z, b.x, groundY(b.x, b.z) + lift, b.z);
          a = b;
        }
      }
      prev = p;
    }
  }
  return out;
}
export function buildLines(geo) {
  const mk = (key, polys, color, width, opacity) => {
    const g = new LineSegmentsGeometry();
    g.setPositions(drapedSegments(polys));
    const m = new LineMaterial({ color, linewidth: width, transparent: true, opacity, depthWrite: false });
    m.resolution.set(innerWidth, innerHeight);
    const l = new LineSegments2(g, m);
    l.renderOrder = 2;
    W.scene.add(l); W.lines[key] = l;
    l.userData.base = opacity;
  };
  const provRings = [];
  for (const p of geo.provinces) for (const r of p.rings) provRings.push(r);
  mk('prov', provRings, new THREE.Color('#9feaff'), 1.1, 0.4);
  mk('coast', geo.coast_lines, new THREE.Color('#3ff4ff'), 1.4, 0.55);
  mk('border', geo.border_lines, new THREE.Color(1.6, 0.75, 0.25), 2.4, 0.95);
  // 도 이름 라벨
  const box = document.getElementById('labels');
  for (const p of geo.provinces) {
    const el = document.createElement('div');
    el.className = 'lbl prov'; el.textContent = p.name_dprk;
    box.appendChild(el);
    const w = lonLatToWorld(p.label_lon, p.label_lat);
    W.provLabels.push({ el, pos: new THREE.Vector3(w.x, groundY(w.x, w.z) + 3, w.z) });
  }
}

// ---------------- 빛 기둥 표지 ----------------
const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true).translate(0, 0.5, 0);
const coreGeo = new THREE.CylinderGeometry(0.28, 0.28, 1, 8, 1, true).translate(0, 0.5, 0);
const gemGeo = new THREE.OctahedronGeometry(1.5, 0);
const ringGeo = new THREE.RingGeometry(2.2, 2.9, 48).rotateX(-Math.PI / 2);
const beamVS = `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vV = -mv.xyz; vN = normalMatrix * normal; gl_Position = projectionMatrix * mv; }`;
const beamFS = `uniform vec3 uColor; uniform float uOpacity; uniform float uTime;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main(){
    float fres = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    float fade = pow(1.0 - vUv.y, 1.4);
    float st = 0.72 + 0.28 * sin(vUv.y * 46.0 - uTime * 7.0);
    float a = uOpacity * fade * (0.5 + 0.5 * fres) * st;
    gl_FragColor = vec4(uColor * 1.8 + vec3(0.15), min(a * 1.3, 1.0));
  }`;
function beamMaterial(color) {
  return new THREE.ShaderMaterial({
    vertexShader: beamVS, fragmentShader: beamFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0 }, uTime: { value: 0 } },
  });
}

export function buildMarkers(sites) {
  const box = document.getElementById('labels');
  for (const s of sites) {
    const eras = parseEras(s.era);
    s.eras = eras;
    const mainEra = eras.find((e) => e !== '자연') || eras[0] || '자연';
    const color = ERAS[mainEra].color;
    const y = groundY(s.x, s.z) + 0.2;
    const g = new THREE.Group(); g.position.set(s.x, y, s.z);
    const beam = new THREE.Mesh(beamGeo, beamMaterial(color));
    const core = new THREE.Mesh(coreGeo, beamMaterial('#ffffff'));
    const gemMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.8), transparent: true, opacity: 0 });
    const gem = new THREE.Mesh(gemGeo, gemMat);
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.3;
    if (s.country === 'CHN') { ringMat.color.set('#ffb547'); }
    g.add(beam, core, gem, ring);
    W.scene.add(g);
    const el = document.createElement('div');
    el.className = 'lbl site' + (s.country === 'CHN' ? ' chn' : '');
    el.innerHTML = `<b>${s.name}</b>${s.country === 'CHN' ? '<i>지금은 중국 땅</i>' : ''}`;
    el.style.setProperty('--c', color);
    box.appendChild(el);
    const mk = {
      site: s, color, group: g, beam, core, gem, ring, el, y,
      h: 0, hT: 0, a: 0, aT: 0, rad: 1, radT: 1, state: 'dim', phase: Math.random() * 6, labelOn: false,
    };
    W.markers.push(mk); W.byId[s.id] = mk;
  }
  // 묶음 라벨
  for (const mk of W.markers) {
    const c = mk.site.cluster;
    if (!c || W.clusterLabels[c]) continue;
    const el = document.createElement('div');
    el.className = 'lbl cluster';
    box.appendChild(el);
    W.clusterLabels[c] = { el, name: c, members: W.markers.filter((m) => m.site.cluster === c) };
  }
}

/**
 * 표지 상태: 'hidden' | 'dim' | 'active' | 'target' | 'reveal'
 */
export function setMarkerState(id, state) {
  const mk = W.byId[id]; if (!mk) return;
  mk.state = state;
  const fame = mk.site.fame;
  const H = { hidden: 0, dim: 4, active: 26 + fame * 12, target: 90, reveal: 70 }[state];
  const A = { hidden: 0, dim: 0.22, active: 0.9, target: 1, reveal: 1 }[state];
  const R = { hidden: 0.4, dim: 0.5, active: 0.55 + fame * 0.1, target: 1.1, reveal: 1 }[state];
  mk.hT = H; mk.aT = A; mk.radT = R;
}
export function setAllMarkers(fn) { for (const mk of W.markers) setMarkerState(mk.site.id, fn(mk.site)); }

/** 지형 후광(최대 16개) */
export function setHalos(list) {
  const u = W.tMat.uniforms;
  const n = Math.min(16, list.length);
  for (let i = 0; i < 16; i++) {
    if (i < n) { const h = list[i]; u.uHalo.value[i].set(h.x, h.z, h.r || 9, h.s ?? 1); u.uHaloCol.value[i].set(h.color); }
  }
  u.uHaloN.value = n;
}

// ---------------- 목적지 신호 ----------------
function buildSignal() {
  const g = new THREE.Group();
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.RingGeometry(3.4, 4, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 1.1, 0.35), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.y = 0.6; g.add(m); rings.push(m);
  }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1, 12, 1, true).translate(0, 0.5, 0), beamMaterial('#ffb547'));
  beam.scale.set(1, 160, 1);
  g.add(beam);
  g.visible = false;
  W.scene.add(g);
  W.signal = { group: g, rings, beam, site: null };
}
export function setSignal(site) {
  const s = W.signal;
  if (!site) { s.group.visible = false; s.site = null; return; }
  s.site = site;
  s.group.position.set(site.x, groundY(site.x, site.z) + 0.2, site.z);
  s.group.visible = true;
}

// ---------------- 위치 맞히기 표적 ----------------
function buildReticle() {
  const g = new THREE.Group();
  const mat = (c, o = 0.9) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c), transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const outer = new THREE.Mesh(new THREE.RingGeometry(7, 7.8, 64, 1, 0, Math.PI * 1.6).rotateX(-Math.PI / 2), mat(new THREE.Color(0.3, 2, 2.2)));
  const inner = new THREE.Mesh(new THREE.RingGeometry(3.2, 3.8, 48).rotateX(-Math.PI / 2), mat(new THREE.Color(2, 1.1, 0.3)));
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.9, 24).rotateX(-Math.PI / 2), mat('#ffffff', 1));
  const cross = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.5).rotateX(-Math.PI / 2), mat(new THREE.Color(0.3, 2, 2.2)));
    const a = (i * Math.PI) / 2; b.position.set(Math.cos(a) * 10.5, 0, Math.sin(a) * 10.5); b.rotation.y = -a; cross.add(b);
  }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1, 8, 1, true).translate(0, 0.5, 0), beamMaterial('#3ff4ff'));
  beam.scale.set(1, 60, 1); beam.material.uniforms.uOpacity.value = 0.9;
  [outer, inner, dot, cross].forEach((m) => { m.position.y += 0.8; });
  g.add(outer, inner, dot, cross, beam);
  g.visible = false;
  W.scene.add(g);
  W.reticle = { group: g, outer, inner, cross, t: 0 };
}
export function setReticle(p) {
  const r = W.reticle;
  if (!p) { r.group.visible = false; return; }
  r.group.position.set(p.x, groundY(p.x, p.z), p.z);
  r.group.visible = true; r.t = 0;
}

/** 두 지점을 잇는 빛 호 */
export function addArc(a, b, color = '#ffb547', { width = 3, lift = null, dashed = false } = {}) {
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  const h = lift ?? Math.max(6, d * 0.25);
  const pts = [];
  const ya = groundY(a.x, a.z) + 1, yb = groundY(b.x, b.z) + 1;
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    pts.push(a.x + (b.x - a.x) * t, ya + (yb - ya) * t + Math.sin(Math.PI * t) * h, a.z + (b.z - a.z) * t);
  }
  const g = new LineGeometry(); g.setPositions(pts);
  const c = new THREE.Color(color).multiplyScalar(1.6);
  const m = new LineMaterial({ color: c, linewidth: width, transparent: true, opacity: 1, depthWrite: false, dashed, dashSize: 4, gapSize: 3 });
  m.resolution.set(innerWidth, innerHeight);
  const l = new Line2(g, m);
  if (dashed) l.computeLineDistances();
  l.renderOrder = 3;
  W.scene.add(l); W.arcs.push(l);
  return l;
}
export function clearArcs() {
  for (const a of W.arcs) { W.scene.remove(a); a.geometry.dispose(); a.material.dispose(); }
  W.arcs = [];
}

/** 지형 위 충격파 */
export function shockwave(x, z, color = '#3ff4ff', max = 40) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.position.set(x, groundY(x, z) + 1.2, z);
  W.scene.add(m);
  W.fx.push({ m, t: 0, dur: 1.3, max });
}

// ---------------- 카메라 ----------------
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export function flyTo({ x, z, y = null, dist = 80, az = null, el = 0.75, dur = 1.6, hop = 0.35 }) {
  return new Promise((resolve) => {
    const c = W.controls, cam = W.camera;
    const t0 = c.target.clone();
    const off0 = cam.position.clone().sub(t0);
    const s0 = new THREE.Spherical().setFromVector3(off0);
    const ty = y ?? groundY(x, z);
    const t1 = new THREE.Vector3(x, ty, z);
    let th1 = az ?? s0.theta;
    let dth = th1 - s0.theta;
    while (dth > Math.PI) dth -= Math.PI * 2;
    while (dth < -Math.PI) dth += Math.PI * 2;
    const ph1 = Math.PI / 2 - el;
    W.flying = { t: 0, dur: Math.max(0.05, dur), t0, t1, s0, r1: dist, ph1, dth, hop: hop * Math.max(s0.radius, dist), resolve };
    c.enabled = false; c.autoRotate = false;
    if (W.fast) { W.flying.t = 1; updateFlight(0); }
  });
}
function updateFlight(dt) {
  const f = W.flying; if (!f) return;
  f.t += dt / f.dur;
  const k = Math.min(1, f.t), e = ease(k);
  const tgt = f.t0.clone().lerp(f.t1, e);
  const r = f.s0.radius + (f.r1 - f.s0.radius) * e + Math.sin(Math.PI * e) * f.hop * 0.4;
  const ph = f.s0.phi + (f.ph1 - f.s0.phi) * e;
  const th = f.s0.theta + f.dth * e;
  const off = new THREE.Vector3().setFromSpherical(new THREE.Spherical(r, ph, th));
  W.camera.position.copy(tgt).add(off);
  W.controls.target.copy(tgt);
  W.camera.lookAt(tgt);
  if (k >= 1) { W.flying = null; W.controls.enabled = true; W.controls.update(); f.resolve(); }
}
export function overviewParams() {
  const asp = innerWidth / innerHeight;
  const fit = asp < 0.8 ? 1150 / Math.max(asp, 0.45) * 0.5 : asp < 1.2 ? 900 : 800;
  return { x: 0, z: 60, y: 0, dist: fit, el: 0.95 };
}
export function overview(dur = 1.4, extra = {}) { return flyTo({ ...overviewParams(), az: 0, dur, ...extra }); }
export function setAutoRotate(on, speed = 0.35) { W.controls.autoRotate = on; W.controls.autoRotateSpeed = speed; }

// ---------------- 화면 투영 · 선택 ----------------
const _v = new THREE.Vector3();
export function project(p) {
  _v.set(p.x, p.y, p.z).project(W.camera);
  return { x: (_v.x * 0.5 + 0.5) * innerWidth, y: (-_v.y * 0.5 + 0.5) * innerHeight, behind: _v.z > 1, ndc: { x: _v.x, y: _v.y } };
}
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}
export function pickMarkers(cx, cy, radius = 24) {
  const out = [];
  for (const mk of W.markers) {
    if (mk.a < 0.12 || mk.state === 'hidden') continue;
    const b = project({ x: mk.site.x, y: mk.y, z: mk.site.z });
    if (b.behind) continue;
    const t = project({ x: mk.site.x, y: mk.y + Math.max(mk.h * W.kh, 4), z: mk.site.z });
    const d = segDist(cx, cy, b.x, b.y, t.x, t.y);
    if (d < radius) out.push({ mk, d });
  }
  out.sort((a, b) => a.d - b.d);
  return out.map((o) => o.mk.site);
}
/** 화면 좌표 → 지형 위 점 (광선 진행) */
export function raycastTerrain(cx, cy) {
  const ndc = new THREE.Vector2((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
  const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, W.camera);
  const o = rc.ray.origin, d = rc.ray.direction;
  if (d.y >= 0 && o.y > 30) return null;
  let t = d.y < 0 ? Math.max(0, (o.y - 30) / -d.y) : 0;
  const hw = WORLD_W / 2, hh = WORLD_H / 2;
  let prev = null;
  for (let i = 0; i < 4000; i++) {
    const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
    const gy = groundY(x, z);
    if (y <= gy) {
      let lo = prev ?? t - 0.5, hi = t;
      for (let j = 0; j < 20; j++) {
        const mid = (lo + hi) / 2;
        const mx = o.x + d.x * mid, my = o.y + d.y * mid, mz = o.z + d.z * mid;
        if (my <= groundY(mx, mz)) hi = mid; else lo = mid;
      }
      const px = o.x + d.x * hi, pz = o.z + d.z * hi;
      if (Math.abs(px) > hw || Math.abs(pz) > hh) return null;
      return new THREE.Vector3(px, groundY(px, pz), pz);
    }
    if (y < -10) return null;
    prev = t;
    t += Math.max(0.25, (y - gy) * 0.5);
  }
  return null;
}

function onHoverMove(e) {
  if (e.pointerType === 'touch' || !W.onMarkerHover) return;
  const hit = pickMarkers(e.clientX, e.clientY, 18)[0] || null;
  if (hit !== W.hovered) { W.hovered = hit; W.onMarkerHover(hit); }
  W.renderer.domElement.style.cursor = hit ? 'pointer' : '';
}

// ---------------- 라벨 ----------------
export function setLabelMode(m) { Object.assign(W.labelMode, m); }
function updateLabels() {
  const lm = W.labelMode;
  for (const p of W.provLabels) {
    const s = project(p.pos);
    const on = lm.provinces && !s.behind;
    p.el.style.opacity = on ? 1 : 0;
    if (on) p.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%,-50%)`;
  }
  const camD = W.camera.position.distanceTo(W.controls.target);
  const pos = new Map();
  for (const mk of W.markers) {
    let on = false;
    if (lm.sites === 'all') on = mk.state !== 'hidden';
    else if (lm.sites === 'active') on = mk.state === 'active' || mk.state === 'target' || mk.state === 'reveal';
    else if (lm.sites === 'reveal') on = mk.state === 'reveal';
    if (lm.sites === 'active' && mk.state === 'active' && mk.site.fame === 1 && camD > 650) on = false;
    if (W.hovered === mk.site && mk.state !== 'hidden') on = true;
    const top = { x: mk.site.x, y: mk.y + mk.h * W.kh + 3.5 * W.ks, z: mk.site.z };
    const s = project(top);
    if (s.behind || s.x < -50 || s.x > innerWidth + 50 || s.y < -30 || s.y > innerHeight + 30) on = false;
    pos.set(mk, s);
    mk.labelOn = on;
  }
  for (const k in W.clusterLabels) {
    const cl = W.clusterLabels[k];
    const vis = cl.members.filter((m) => m.labelOn);
    let spread = 0, cx = 0, cy = 0;
    for (const m of vis) { const s = pos.get(m); cx += s.x; cy += s.y; }
    if (vis.length) { cx /= vis.length; cy /= vis.length; }
    for (const m of vis) { const s = pos.get(m); spread = Math.max(spread, Math.hypot(s.x - cx, s.y - cy)); }
    const merge = vis.length >= 2 && spread < 26 * vis.length ** 0.5 + 10;
    if (merge) {
      for (const m of vis) if (m.state !== 'target') m.labelOn = false;
      cl.el.innerHTML = `<b>${cl.name}</b><span>${vis.length}곳</span>`;
      cl.el.style.transform = `translate(${cx}px, ${cy - 14}px) translate(-50%,-100%)`;
      cl.el.style.opacity = 1; cl.el.style.pointerEvents = 'auto';
      cl.cx = cx; cl.cy = cy; cl.vis = vis;
    } else { cl.el.style.opacity = 0; cl.el.style.pointerEvents = 'none'; }
  }
  for (const mk of W.markers) {
    const s = pos.get(mk);
    mk.el.style.opacity = mk.labelOn ? 1 : 0;
    mk.el.classList.toggle('tgt', mk.state === 'target');
    mk.el.classList.toggle('hov', W.hovered === mk.site);
    if (mk.labelOn) mk.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%,-100%)`;
  }
}

// ---------------- 시점 · 표시 방식 ----------------
export function setView(v) { W.view = v; W.mixTarget = [0, 0.55, 1][v]; }
export function setDim(d) { W.tMat.uniforms.uDim.value = d; }
export function setProvinceLines(on) { W.lines.prov && (W.lines.prov.userData.on = on); }

// ---------------- 프레임 ----------------
let last = performance.now(), time = 0;
const keyVec = new THREE.Vector3();
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
  const u = W.tMat?.uniforms;
  if (u) {
    u.uTime.value = time;
    u.uScan.value = ((time * 70) % 900) - 450;
    W.mix += (W.mixTarget - W.mix) * (W.fast ? 1 : Math.min(1, dt * 4));
    u.uMix.value = W.mix;
    u.uGrid.value = 1 - W.mix * 0.8;
  }
  if (W.table) W.table.material.uniforms.uTime.value = time;
  if (W.wallMat) W.wallMat.uniforms.uTime.value = time;
  if (W.rings) { W.rings[0].rotation.y = time * 0.05; W.rings[1].rotation.y = -time * 0.08; W.rings[2].rotation.y = time * 0.02; }
  for (const k in W.lines) {
    const l = W.lines[k];
    let o = l.userData.base;
    if (k === 'prov') o *= (l.userData.on === false ? 0 : 1) * (1 - W.mix * 0.7);
    if (k === 'coast') o *= 1 - W.mix * 0.8;
    if (k === 'border') o *= 1 - W.mix * 0.35;
    l.material.opacity += (o - l.material.opacity) * (W.fast ? 1 : Math.min(1, dt * 5));
    l.visible = l.material.opacity > 0.01;
  }
  // 표지 (카메라 거리에 따라 굵기 보정)
  const camD = W.camera.position.distanceTo(W.controls.target);
  const ks = Math.max(0.55, Math.min(4, camD / 200));
  const kh = 0.7 + 0.3 * ks;
  for (const mk of W.markers) {
    const k = W.fast ? 1 : Math.min(1, dt * 4);
    mk.h += (mk.hT - mk.h) * k; mk.a += (mk.aT - mk.a) * k; mk.rad += (mk.radT - mk.rad) * k;
    const hov = W.hovered === mk.site ? 1.4 : 1;
    const vis = mk.a > 0.01;
    mk.group.visible = vis;
    if (!vis) continue;
    const H = Math.max(0.01, mk.h * kh);
    mk.beam.scale.set(mk.rad * hov * ks, H, mk.rad * hov * ks);
    mk.core.scale.set(ks, H * 0.98, ks);
    mk.beam.material.uniforms.uOpacity.value = mk.a * (mk.state === 'dim' ? 0.7 : 1);
    mk.core.material.uniforms.uOpacity.value = mk.a * 0.9;
    mk.beam.material.uniforms.uTime.value = time + mk.phase;
    mk.core.material.uniforms.uTime.value = time + mk.phase;
    mk.gem.position.y = H + 2 * ks + Math.sin(time * 2 + mk.phase) * 0.6 * ks;
    mk.gem.rotation.y = time * 1.5 + mk.phase;
    const gs = (mk.state === 'dim' ? 0.45 : 1) * hov * (mk.state === 'target' ? 1.6 : 1);
    mk.gem.scale.setScalar(gs * ks);
    mk.gem.material.opacity = Math.min(1, mk.a * 1.2);
    const pulse = 1 + 0.25 * Math.sin(time * 3 + mk.phase);
    mk.ring.scale.setScalar(mk.rad * pulse * ks * (mk.state === 'dim' ? 0.6 : 1));
    mk.ring.material.opacity = mk.a * 0.8;
  }
  // 목적지 신호
  const sg = W.signal;
  if (sg && sg.group.visible) {
    sg.rings.forEach((r, i) => {
      const p = ((time * 0.6 + i / 3) % 1);
      r.scale.setScalar((1 + p * 3.5) * ks * 0.55); r.material.opacity = (1 - p) * 0.9;
    });
    sg.beam.scale.set(ks, 160 * kh, ks);
    sg.beam.material.uniforms.uOpacity.value = 0.55 + 0.25 * Math.sin(time * 5);
    sg.beam.material.uniforms.uTime.value = time;
  }
  const rt = W.reticle;
  if (rt && rt.group.visible) {
    rt.t += dt;
    rt.outer.rotation.y = time * 1.2; rt.cross.rotation.y = -time * 0.6;
    const s = rt.t < 0.25 ? 2.2 - rt.t / 0.25 * 1.2 : 1 + Math.sin(time * 6) * 0.05;
    rt.group.scale.set(s * ks * 0.8, 1, s * ks * 0.8);
  }
  // 충격파
  W.fx = W.fx.filter((f) => {
    f.t += dt;
    const k = f.t / f.dur;
    f.m.scale.setScalar(1 + k * f.max);
    f.m.material.opacity = Math.max(0, 1 - k);
    if (k >= 1) { W.scene.remove(f.m); f.m.geometry.dispose(); f.m.material.dispose(); return false; }
    return true;
  });
  for (const a of W.arcs) if (a.material.dashed) a.material.dashOffset -= dt * 8;
  // 키보드 이동
  if (!W.flying && W.controls.enabled) {
    const kk = W.keys;
    const fw = (kk['w'] || kk['arrowup'] ? 1 : 0) - (kk['s'] || kk['arrowdown'] ? 1 : 0);
    const rt2 = (kk['d'] || kk['arrowright'] ? 1 : 0) - (kk['a'] || kk['arrowleft'] ? 1 : 0);
    if (fw || rt2) {
      const az = W.controls.getAzimuthalAngle();
      const sp = W.camera.position.distanceTo(W.controls.target) * 0.9 * dt;
      keyVec.set(-Math.sin(az) * fw + Math.cos(az) * rt2, 0, -Math.cos(az) * fw - Math.sin(az) * rt2).multiplyScalar(sp);
      W.camera.position.add(keyVec); W.controls.target.add(keyVec);
      W.idle = false;
    }
  }
  updateFlight(dt);
  if (!W.flying) {
    // 지도 범위 안으로 제한
    const t = W.controls.target, lim = { x: WORLD_W / 2, z: WORLD_H / 2 };
    const cx = Math.max(-lim.x, Math.min(lim.x, t.x)), cz = Math.max(-lim.z, Math.min(lim.z, t.z));
    if (cx !== t.x || cz !== t.z) { const dx = cx - t.x, dz = cz - t.z; t.x = cx; t.z = cz; W.camera.position.x += dx; W.camera.position.z += dz; }
    W.controls.update();
  }
  if (W.stars) W.stars.rotation.y = time * 0.004;
  W.ks = ks; W.kh = kh; W.frames = (W.frames || 0) + 1;
  updateLabels();
  W.onFrame && W.onFrame(dt, time);
  W.composer.render();
}
export function getTime() { return time; }
