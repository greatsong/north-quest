// 디오라마 3D 월드: 층층 지형판, 젤리 바다, 단면 지층, 경계선, 카메라
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { WORLD_W, WORLD_H, lonLatToWorld } from '../../shared/geo.js';
import { gradientMap, toon, toonMat, buildLandmark, buildPawn, buildCloud, buildStarToken, buildDart, buildFlag } from './models.js';

export const EX = 12;            // 고도 과장 배율
export const LAND_BASE = 0.8;
export const WATER_Y = 0.3;
export const Y_BOTTOM = -16;
const LEVELS = [0, 100, 250, 450, 700, 1000, 1350, 1750, 2150, 2500];
const LCOL = ['#bfe8a0', '#a6dc8c', '#8fcf80', '#b9d77e', '#e1d38b', '#e8bd88', '#d6a283', '#bf9ea6', '#f3f1fb', '#ffffff'];
const SAND = '#f5e6b4';
const RIVER = '#8fd3f2';
const FOREIGN = '#efe7da';

function levelOf(h) { let l = 0; for (let i = 1; i < LEVELS.length; i++) if (h >= LEVELS[i]) l = i; return l; }
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack = (t) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);

function mulberry(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export class World {
  constructor(container, { low = false } = {}) {
    this.low = low;
    this.container = container;
    this.tweens = [];
    this.updaters = [];
    this.time = 0;
    this.follow = null;
    this.flying = false;
    this.landmarks = new Map();
    this.lineMats = [];

    const r = new THREE.WebGLRenderer({ antialias: !low, alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1.25 : 2));
    r.setSize(container.clientWidth, container.clientHeight);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = !low;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(r.domElement);
    this.renderer = r;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog('#f9dfe6', 1700, 3600);
    const cam = new THREE.PerspectiveCamera(40, container.clientWidth / container.clientHeight, 1, 6000);
    cam.position.set(0, 560, 640);
    this.camera = cam;

    const c = new OrbitControls(cam, r.domElement);
    c.enableDamping = true; c.dampingFactor = 0.08;
    c.maxPolarAngle = 1.2; c.minPolarAngle = 0.12;
    c.minDistance = 28; c.maxDistance = 1150;
    c.screenSpacePanning = false; c.rotateSpeed = 0.55; c.panSpeed = 0.9;
    c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    this.controls = c;

    // 빛
    const hemi = new THREE.HemisphereLight('#eaf6ff', '#f3d9bd', 1.35);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff4e2', 2.1);
    sun.position.set(-260, 420, -180);
    sun.target.position.set(0, 0, 0);
    if (!low) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const s = sun.shadow.camera; s.left = -380; s.right = 380; s.top = 380; s.bottom = -380; s.near = 50; s.far = 1200;
      sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6;
    }
    this.scene.add(sun, sun.target);
    this.sun = sun;

    this.raycaster = new THREE.Raycaster();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 52 : 40;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    for (const m of this.lineMats) m.resolution.set(w, h);
  }

  // ───────────────────────── 지형 만들기
  build(heights, mask, geo) {
    const low = this.low;
    const GW = low ? 256 : 480;
    const GH = Math.round(GW * WORLD_H / WORLD_W);
    this.GW = GW; this.GH = GH;
    const N = GW * GH;
    const Y = new Float32Array(N), sea = new Uint8Array(N), nk = new Uint8Array(N), lvl = new Int8Array(N);
    const riv = new Float32Array(N);
    const { data: md, width: mw, height: mh } = mask;
    for (let j = 0; j < GH; j++) {
      const v = j / (GH - 1);
      for (let i = 0; i < GW; i++) {
        const u = i / (GW - 1), k = j * GW + i;
        const mx = Math.min(mw - 1, Math.round(u * (mw - 1))), my = Math.min(mh - 1, Math.round(v * (mh - 1)));
        const p = (my * mw + mx) * 4;
        const R = md[p], G = md[p + 1], Bc = md[p + 2];
        const h = heights.sampleUV(u, v);
        const isSea = G > 127 && R < 128;
        sea[k] = isSea ? 1 : 0;
        nk[k] = R > 127 ? 1 : 0;
        riv[k] = Bc / 255;
        if (isSea) {
          const d = Math.max(h, -200);
          Y[k] = d > -30 ? -2.2 : d > -120 ? -4.3 : -6.6;
          lvl[k] = -1;
        } else {
          const l = levelOf(Math.max(h, 0));
          lvl[k] = l;
          Y[k] = LAND_BASE + (LEVELS[l] * EX) / 1000;
        }
      }
    }
    this.Y = Y; this.sea = sea; this.nk = nk; this.lvl = lvl;

    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    const tmp = new THREE.Color(), cA = new THREE.Color(), rnd = mulberry(7);
    const lc = LCOL.map((h) => new THREE.Color(h));
    const sand = new THREE.Color(SAND), river = new THREE.Color(RIVER), foreign = new THREE.Color(FOREIGN);
    const seaShallow = new THREE.Color('#f2e3b8'), seaMid = new THREE.Color('#bfe0cf'), seaDeep = new THREE.Color('#8ec5d6');
    for (let j = 0; j < GH; j++) {
      for (let i = 0; i < GW; i++) {
        const k = j * GW + i;
        pos[k * 3] = (i / (GW - 1) - 0.5) * WORLD_W;
        pos[k * 3 + 1] = Y[k];
        pos[k * 3 + 2] = (j / (GH - 1) - 0.5) * WORLD_H;
        if (sea[k]) {
          tmp.copy(Y[k] > -3 ? seaShallow : Y[k] > -5 ? seaMid : seaDeep);
        } else {
          const l = lvl[k];
          tmp.copy(lc[l]);
          let coast = false;
          if (l === 0) {
            for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const ii = i + di, jj = j + dj;
              if (ii >= 0 && jj >= 0 && ii < GW && jj < GH && sea[jj * GW + ii]) coast = true;
            }
          }
          if (coast) tmp.copy(sand);
          if (riv[k] > 0.3 && l < 7) tmp.lerp(river, Math.min(0.85, (riv[k] - 0.3) * 1.6));
          if (!nk[k]) {
            cA.copy(tmp).lerp(foreign, 0.62);
            tmp.copy(cA);
          }
          const jit = 1 + (rnd() - 0.5) * 0.05;
          tmp.multiplyScalar(jit);
        }
        col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
      }
    }
    const idx = new Uint32Array((GW - 1) * (GH - 1) * 6);
    let q = 0;
    for (let j = 0; j < GH - 1; j++) for (let i = 0; i < GW - 1; i++) {
      const a = j * GW + i, b = a + 1, c = a + GW, d = c + 1;
      if ((i + j) & 1) { idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d; }
      else { idx[q++] = a; idx[q++] = c; idx[q++] = d; idx[q++] = a; idx[q++] = d; idx[q++] = b; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    const tmat = toonMat({ vertexColors: true, flatShading: true });
    const terrain = new THREE.Mesh(g, tmat);
    terrain.receiveShadow = !low;
    terrain.castShadow = !low;
    this.scene.add(terrain);
    this.terrain = terrain;
    this.colors = col;

    this.buildWalls(col);
    this.buildWater(mask);
    this.buildTable();
    this.buildTrees();
    this.buildClouds();
    this.buildBorders(geo);
  }

  // 판 옆면: 풀 테두리 + 지층 + 젤리 바다 옆면
  buildWalls(col) {
    const { GW, GH, Y, sea } = this;
    const path = [];
    for (let i = 0; i < GW; i++) path.push(i);                          // 북쪽 서→동
    for (let j = 1; j < GH; j++) path.push(j * GW + GW - 1);             // 동쪽 북→남
    for (let i = GW - 2; i >= 0; i--) path.push((GH - 1) * GW + i);     // 남쪽 동→서
    for (let j = GH - 2; j >= 0; j--) path.push(j * GW);                 // 서쪽 남→북
    const n = path.length;
    const rimPos = [], rimCol = [], wallPos = [], wallUv = [], jelPos = [], jelUv = [], rimIdx = [], wallIdx = [], jelIdx = [];
    let dist = 0, px = 0, pz = 0;
    for (let s = 0; s < n; s++) {
      const k = path[s];
      const x = ((k % GW) / (GW - 1) - 0.5) * WORLD_W, z = (Math.floor(k / GW) / (GH - 1) - 0.5) * WORLD_H;
      if (s) dist += Math.hypot(x - px, z - pz);
      px = x; pz = z;
      const yt = Y[k], yr = yt - 1.1;
      rimPos.push(x, yt, z, x, yr, z);
      const dk = sea[k] ? 1 : 0.8;
      rimCol.push(col[k * 3] * dk, col[k * 3 + 1] * dk, col[k * 3 + 2] * dk, col[k * 3] * dk * 0.85, col[k * 3 + 1] * dk * 0.85, col[k * 3 + 2] * dk * 0.85);
      wallPos.push(x, yr, z, x, Y_BOTTOM, z);
      wallUv.push(dist / 60, (yr - Y_BOTTOM) / 48, dist / 60, 0);
      const jb = Math.min(yt, WATER_Y);
      jelPos.push(x, WATER_Y, z, x, jb, z);
      jelUv.push(0, 1, 0, 0);
      if (s < n - 1) {
        const a = s * 2, b = a + 1, c2 = a + 2, d = a + 3;
        rimIdx.push(a, b, c2, b, d, c2);
        wallIdx.push(a, b, c2, b, d, c2);
        jelIdx.push(a, b, c2, b, d, c2);
      }
    }
    const mk = (posArr, idxArr, extra) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
      for (const [k, v, sz] of extra) g.setAttribute(k, new THREE.Float32BufferAttribute(v, sz));
      g.setIndex(idxArr);
      g.computeVertexNormals();
      return g;
    };
    const rim = new THREE.Mesh(mk(rimPos, rimIdx, [['color', rimCol, 3]]),
      new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap(), side: THREE.DoubleSide }));
    const wall = new THREE.Mesh(mk(wallPos, wallIdx, [['uv', wallUv, 2]]),
      new THREE.MeshToonMaterial({ map: this.strataTexture(), gradientMap: gradientMap(), side: THREE.DoubleSide }));
    const jelly = new THREE.Mesh(mk(jelPos, jelIdx, [['uv', jelUv, 2]]), new THREE.ShaderMaterial({
      transparent: true, side: THREE.DoubleSide, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `varying vec2 vUv; void main(){ vec3 c = mix(vec3(0.33,0.70,0.86), vec3(0.62,0.90,0.95), vUv.y);
        float hl = smoothstep(0.86,1.0,vUv.y); c = mix(c, vec3(1.0), hl*0.7);
        gl_FragColor = vec4(c, 0.62 + hl*0.3); }`,
    }));
    jelly.renderOrder = 2;
    this.scene.add(rim, wall, jelly);
  }

  strataTexture() {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 512;
    const x = cv.getContext('2d');
    const bands = ['#8b6a55', '#a87e5c', '#c99b6c', '#e2bb88', '#b98a62', '#d9ae7c', '#9d7558', '#c79a70', '#e8c999', '#b88460', '#d3a676', '#a77a5a'];
    const rnd = mulberry(3);
    // 위에서 아래로: 각 띠는 자기 윗선부터 바닥까지 칠하고, 다음(아래) 띠가 그 아래를 덮는다
    let y = -12;
    let bi = 0;
    x.fillStyle = bands[0]; x.fillRect(0, 0, 256, 512);
    while (y < 512) {
      x.fillStyle = bands[bi++ % bands.length];
      x.beginPath();
      const ph = rnd() * 6, amp = 3 + rnd() * 5;
      x.moveTo(0, y + Math.sin(ph) * amp);
      for (let i = 0; i <= 256; i += 8) x.lineTo(i, y + Math.sin(i / 256 * Math.PI * 4 + ph) * amp);
      x.lineTo(256, 520); x.lineTo(0, 520); x.closePath();
      x.fill();
      y += 26 + rnd() * 34;
    }
    const cv2 = cv, x2 = x;
    for (let i = 0; i < 420; i++) { // 자갈 점
      x2.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(60,40,30,0.16)';
      x2.beginPath(); x2.arc(rnd() * 256, rnd() * 512, 1 + rnd() * 2.4, 0, Math.PI * 2); x2.fill();
    }
    const t = new THREE.CanvasTexture(cv2);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  buildWater(mask) {
    // 해안까지 거리감(번진 육지 비율) 텍스처
    const W = 256, H = Math.round(256 * WORLD_H / WORLD_W);
    const { data: md, width: mw, height: mh } = mask;
    let a = new Float32Array(W * H), b = new Float32Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const mx = Math.round(i / (W - 1) * (mw - 1)), my = Math.round(j / (H - 1) * (mh - 1));
      const p = (my * mw + mx) * 4;
      a[j * W + i] = md[p + 1] > 127 && md[p] < 128 ? 0 : 1;
    }
    const R = 5;
    for (let pass = 0; pass < 3; pass++) {
      for (let j = 0; j < H; j++) { let s = 0; for (let i = -R; i <= R; i++) s += a[j * W + Math.min(W - 1, Math.max(0, i))];
        for (let i = 0; i < W; i++) { b[j * W + i] = s / (2 * R + 1); s += a[j * W + Math.min(W - 1, i + R + 1)] - a[j * W + Math.max(0, i - R)]; } }
      for (let i = 0; i < W; i++) { let s = 0; for (let j = -R; j <= R; j++) s += b[Math.min(H - 1, Math.max(0, j)) * W + i];
        for (let j = 0; j < H; j++) { a[j * W + i] = s / (2 * R + 1); s += b[Math.min(H - 1, j + R + 1) * W + i] - b[Math.max(0, j - R) * W + i]; } }
    }
    const tex = new Uint8Array(W * H * 4);
    for (let k = 0; k < W * H; k++) { const v = Math.round(Math.min(1, a[k]) * 255); tex[k * 4] = v; tex[k * 4 + 1] = v; tex[k * 4 + 2] = v; tex[k * 4 + 3] = 255; }
    const dt = new THREE.DataTexture(tex, W, H, THREE.RGBAFormat);
    dt.magFilter = dt.minFilter = THREE.LinearFilter;
    dt.needsUpdate = true;
    this.waterUniforms = { uNear: { value: dt }, uTime: { value: 0 } };
    const geo = new THREE.PlaneGeometry(WORLD_W, WORLD_H, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.waterUniforms, transparent: true, depthWrite: false,
      vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform sampler2D uNear; uniform float uTime; varying vec2 vUv; varying vec3 vW;
        float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
        void main(){
          float n = texture2D(uNear, vec2(vUv.x, 1.0-vUv.y)).r;
          vec3 deep = vec3(0.38,0.72,0.92), shallow = vec3(0.66,0.94,0.93);
          vec3 col = mix(deep, shallow, smoothstep(0.02,0.5,n));
          float a = mix(0.80, 0.46, smoothstep(0.0,0.6,n));
          float ring = sin(n*46.0 - uTime*1.5);
          float zone = smoothstep(0.08,0.25,n)*(1.0-smoothstep(0.42,0.62,n));
          float foam = smoothstep(0.82,0.96,ring)*zone;
          col = mix(col, vec3(1.0), foam*0.8); a = max(a, foam*0.85);
          col += 0.035*sin(vW.x*0.09+uTime*0.9)*sin(vW.z*0.08-uTime*0.7);
          vec2 g = floor(vW.xz*0.3); float h = hash(g);
          vec2 f = fract(vW.xz*0.3)-0.5;
          float sp = step(0.986,h)*smoothstep(0.22,0.0,length(f))*max(sin(uTime*2.2+h*50.0),0.0);
          col += sp; a = max(a, sp*0.9);
          gl_FragColor = vec4(col, a);
        }`,
    });
    const water = new THREE.Mesh(geo, mat);
    water.position.y = WATER_Y;
    water.renderOrder = 3;
    this.scene.add(water);
  }

  buildTable() {
    // 받침판(나무) + 크림색 테두리 + 둥근 탁자
    const W = WORLD_W, H = WORLD_H;
    const trim = new THREE.Mesh(new THREE.BoxGeometry(W + 8, 1.6, H + 8), toon('#fff1d6'));
    trim.position.y = Y_BOTTOM - 0.8;
    const wood = new THREE.Mesh(new THREE.BoxGeometry(W + 22, 6, H + 22), toon('#d99d6c'));
    wood.position.y = Y_BOTTOM - 1.6 - 3;
    trim.receiveShadow = wood.receiveShadow = true;
    this.scene.add(trim, wood);
    // 이름표
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 128;
    const x = cv.getContext('2d');
    const gr = x.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#ffe9a8'); gr.addColorStop(1, '#e8b85c');
    x.fillStyle = gr; x.beginPath(); x.roundRect(4, 4, 1016, 120, 40); x.fill();
    x.strokeStyle = '#b07d2c'; x.lineWidth = 6; x.stroke();
    x.fillStyle = '#6b4a1a'; x.font = '700 92px "Dongle", "Do Hyeon", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('북녘 탐험대  ·  NORTH QUEST', 512, 76);
    const pt = new THREE.CanvasTexture(cv); pt.colorSpace = THREE.SRGBColorSpace;
    this.plateTex = pt; this.plateCanvas = cv;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(150, 18.75), new THREE.MeshBasicMaterial({ map: pt, transparent: true }));
    plate.position.set(0, Y_BOTTOM - 4.6, H / 2 + 11.05);
    this.scene.add(plate);

    const tc = document.createElement('canvas'); tc.width = 512; tc.height = 512;
    const t = tc.getContext('2d');
    t.fillStyle = '#f2cfa6'; t.fillRect(0, 0, 512, 512);
    const rnd = mulberry(11);
    for (let i = 0; i < 70; i++) {
      t.strokeStyle = `rgba(${170 + rnd() * 40},${110 + rnd() * 30},${70 + rnd() * 20},${0.12 + rnd() * 0.15})`;
      t.lineWidth = 1 + rnd() * 4;
      t.beginPath(); const y0 = rnd() * 512; t.moveTo(0, y0);
      for (let xx = 0; xx <= 512; xx += 32) t.lineTo(xx, y0 + Math.sin(xx / 70 + i) * 6);
      t.stroke();
    }
    const ttex = new THREE.CanvasTexture(tc); ttex.colorSpace = THREE.SRGBColorSpace;
    ttex.wrapS = ttex.wrapT = THREE.RepeatWrapping; ttex.repeat.set(5, 5);
    const table = new THREE.Mesh(new THREE.CylinderGeometry(980, 980, 40, 72),
      new THREE.MeshToonMaterial({ map: ttex, gradientMap: gradientMap() }));
    table.position.y = Y_BOTTOM - 7.6 - 20;
    table.receiveShadow = true;
    this.scene.add(table);
    // 부드러운 그림자
    const sc = document.createElement('canvas'); sc.width = sc.height = 128;
    const s = sc.getContext('2d');
    const rg = s.createRadialGradient(64, 64, 20, 64, 64, 64);
    rg.addColorStop(0, 'rgba(90,50,30,0.45)'); rg.addColorStop(1, 'rgba(90,50,30,0)');
    s.fillStyle = rg; s.fillRect(0, 0, 128, 128);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.45, H * 1.45), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = Y_BOTTOM - 7.5;
    this.scene.add(sh);

    // 탁자 위 소품: 카드 더미와 주사위
    const deck = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const cd = new THREE.Mesh(new THREE.BoxGeometry(34, 0.9, 48), toon(i % 2 ? '#ff8a7a' : '#ff7a6b'));
      cd.position.set((Math.sin(i * 1.7) * 1.2), i * 0.95, Math.cos(i * 2.3) * 1.2);
      cd.rotation.y = Math.sin(i) * 0.06;
      cd.castShadow = cd.receiveShadow = true;
      deck.add(cd);
    }
    const top = new THREE.Mesh(new THREE.PlaneGeometry(26, 38), new THREE.MeshBasicMaterial({ map: this.cardBackTexture() }));
    top.rotation.x = -Math.PI / 2; top.position.y = 8.1;
    deck.add(top);
    deck.position.set(W / 2 + 70, Y_BOTTOM - 7.6, H / 2 - 120);
    deck.rotation.y = -0.35;
    this.scene.add(deck);
    const dice = new THREE.Mesh(new THREE.BoxGeometry(14, 14, 14), toon('#ffffff'));
    dice.position.set(W / 2 + 64, Y_BOTTOM - 7.6 + 7, H / 2 - 20);
    dice.rotation.y = 0.6; dice.castShadow = true;
    this.scene.add(dice);
    for (const [px, py, pz] of [[0, 7.05, 0], [-3.5, 7.05, -3.5], [3.5, 7.05, 3.5]]) {
      const pip = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.4, 12), toon('#ff6f61'));
      pip.position.set(px, py, pz); dice.add(pip);
    }
  }

  cardBackTexture() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 188;
    const x = c.getContext('2d');
    x.fillStyle = '#ff7a6b'; x.fillRect(0, 0, 128, 188);
    x.strokeStyle = '#fff3dc'; x.lineWidth = 6; x.strokeRect(8, 8, 112, 172);
    x.fillStyle = '#fff3dc'; x.font = 'bold 72px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('?', 64, 98);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  buildTrees() {
    const rnd = mulberry(42);
    const n = this.low ? 900 : 2600;
    const trunkG = new THREE.CylinderGeometry(0.22, 0.3, 1.2, 5); trunkG.translate(0, 0.6, 0);
    const pineG = new THREE.ConeGeometry(1.3, 3.2, 6); pineG.translate(0, 2.6, 0);
    const roundG = new THREE.IcosahedronGeometry(1.25, 0); roundG.translate(0, 2.1, 0);
    const trunks = new THREE.InstancedMesh(trunkG, toon('#a8704a'), n);
    const pines = new THREE.InstancedMesh(pineG, toonMat({ color: '#ffffff', flatShading: true }), n);
    const rounds = new THREE.InstancedMesh(roundG, toonMat({ color: '#ffffff', flatShading: true }), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    const pineCols = ['#5fb27a', '#4fa37a', '#6cc08a', '#7ccf8f'].map((h) => new THREE.Color(h));
    const roundCols = ['#9bdc7c', '#86d077', '#b5e58a', '#ffc2d4', '#ffd98a'].map((h) => new THREE.Color(h));
    let tc = 0, pc = 0, rc = 0, tries = 0;
    this.treeSpots = [];
    while (tc < n && tries < n * 30) {
      tries++;
      const i = 1 + Math.floor(rnd() * (this.GW - 2)), j = 1 + Math.floor(rnd() * (this.GH - 2)), k = j * this.GW + i;
      if (this.sea[k]) continue;
      const l = this.lvl[k];
      if (l >= 7) continue;
      if (!this.nk[k] && rnd() < 0.7) continue;
      if (l <= 0 && rnd() < 0.75) continue;
      // 평평한 단 위에만
      const y = this.Y[k];
      if (this.Y[k + 1] !== y || this.Y[k - 1] !== y || this.Y[k + this.GW] !== y || this.Y[k - this.GW] !== y) continue;
      const x = (i / (this.GW - 1) - 0.5) * WORLD_W + (rnd() - 0.5) * 0.8, z = (j / (this.GH - 1) - 0.5) * WORLD_H + (rnd() - 0.5) * 0.8;
      const sc = 0.75 + rnd() * 0.65;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28);
      s.set(sc, sc * (0.9 + rnd() * 0.3), sc);
      p.set(x, y, z);
      m.compose(p, q, s);
      trunks.setMatrixAt(tc++, m);
      const pine = l >= 3 || rnd() < 0.35;
      if (pine) { pines.setMatrixAt(pc, m); pines.setColorAt(pc++, c.copy(pineCols[Math.floor(rnd() * 4)])); }
      else { rounds.setMatrixAt(rc, m); rounds.setColorAt(rc++, c.copy(roundCols[Math.floor(rnd() * (rnd() < 0.85 ? 3 : 5))])); }
      this.treeSpots.push(x, z);
    }
    trunks.count = tc; pines.count = pc; rounds.count = rc;
    for (const im of [trunks, pines, rounds]) { im.castShadow = !this.low; im.receiveShadow = !this.low; this.scene.add(im); }
    this.trees = [trunks, pines, rounds];
  }

  buildClouds() {
    const rnd = mulberry(5);
    this.clouds = [];
    for (let i = 0; i < (this.low ? 4 : 7); i++) {
      const c = buildCloud(rnd);
      c.position.set((rnd() - 0.5) * 700, 70 + rnd() * 30, (rnd() - 0.5) * 600);
      c.userData.speed = 3 + rnd() * 4;
      this.scene.add(c);
      this.clouds.push(c);
    }
  }

  // 국경·군사분계선·도 경계
  buildBorders(geo) {
    const mkLine = (coords, color, width, dashed = false, lift = 0.6) => {
      const pts = [];
      for (let i = 0; i < coords.length; i++) {
        const a = lonLatToWorld(coords[i][0], coords[i][1]);
        if (i) {
          const b = lonLatToWorld(coords[i - 1][0], coords[i - 1][1]);
          const d = Math.hypot(a.x - b.x, a.z - b.z), n = Math.max(1, Math.ceil(d / 1.2));
          for (let s = 1; s <= n; s++) {
            const x = b.x + (a.x - b.x) * s / n, z = b.z + (a.z - b.z) * s / n;
            pts.push(x, this.peakY(x, z) + lift, z);
          }
        } else pts.push(a.x, this.peakY(a.x, a.z) + lift, a.z);
      }
      const g = new LineGeometry(); g.setPositions(pts);
      const m = new LineMaterial({ color, linewidth: width, dashed, dashSize: 3, gapSize: 2.2, transparent: true, opacity: 0.95 });
      m.resolution.set(this.container.clientWidth, this.container.clientHeight);
      this.lineMats.push(m);
      const l = new Line2(g, m);
      if (dashed) l.computeLineDistances();
      l.renderOrder = 4;
      this.scene.add(l);
      return l;
    };
    this.borderLines = [];
    geo.border_lines.forEach((ln, i) => {
      const mdl = i === 0;
      this.borderLines.push(mkLine(ln, mdl ? '#ff5d73' : '#ffb13b', mdl ? 4.2 : 4.0, mdl, 0.8));
    });
    this.provLines = [];
    for (const p of geo.provinces) for (const ring of p.rings) {
      if (ring.length < 12) continue;
      this.provLines.push(mkLine(ring, '#ffffff', 2.0, false, 0.45));
    }
  }
  setProvinceLines(v) { for (const l of this.provLines) l.visible = v; }

  // ───────────────────────── 높이 질의
  terrainY(x, z) {
    const { GW, GH, Y } = this;
    const fx = Math.min(Math.max((x / WORLD_W + 0.5) * (GW - 1), 0), GW - 1.001);
    const fz = Math.min(Math.max((z / WORLD_H + 0.5) * (GH - 1), 0), GH - 1.001);
    const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, k = j * GW + i;
    return Y[k] * (1 - tx) * (1 - tz) + Y[k + 1] * tx * (1 - tz) + Y[k + GW] * (1 - tx) * tz + Y[k + GW + 1] * tx * tz;
  }
  peakY(x, z) {
    const { GW, GH, Y } = this;
    const i = Math.round((x / WORLD_W + 0.5) * (GW - 1)), j = Math.round((z / WORLD_H + 0.5) * (GH - 1));
    let m = -99;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = Math.min(GW - 1, Math.max(0, i + di)), jj = Math.min(GH - 1, Math.max(0, j + dj));
      m = Math.max(m, Y[jj * GW + ii]);
    }
    return Math.max(m, WATER_Y);
  }
  surfaceY(x, z) { return Math.max(this.terrainY(x, z), WATER_Y); }
  cell(x, z) {
    const i = Math.round((x / WORLD_W + 0.5) * (this.GW - 1)), j = Math.round((z / WORLD_H + 0.5) * (this.GH - 1));
    if (i < 0 || j < 0 || i >= this.GW || j >= this.GH) return -1;
    return j * this.GW + i;
  }
  isSea(x, z) { const k = this.cell(x, z); return k < 0 || !!this.sea[k]; }
  isNK(x, z) { const k = this.cell(x, z); return k >= 0 && !!this.nk[k]; }
  inside(x, z) { return Math.abs(x) <= WORLD_W / 2 && Math.abs(z) <= WORLD_H / 2; }

  /** 화면 좌표 → 지면 위 점 (높이장 행진) */
  pick(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const o = this.raycaster.ray.origin, d = this.raycaster.ray.direction;
    if (d.y >= -1e-4) return null;
    let t = Math.max(0, (36 - o.y) / d.y);
    const tEnd = (-8 - o.y) / d.y;
    const hor = Math.max(Math.hypot(d.x, d.z), 0.02);
    const dt = 0.5 / hor;
    let prev = t, inside = false;
    for (let it = 0; it < 6000 && t <= tEnd; it++, t += Math.min(dt, 2)) {
      const x = o.x + d.x * t, z = o.z + d.z * t, y = o.y + d.y * t;
      if (!this.inside(x, z)) { if (inside) break; prev = t; continue; }
      inside = true;
      if (y <= this.surfaceY(x, z)) {
        let lo = prev, hi = t;
        for (let k = 0; k < 12; k++) {
          const mid = (lo + hi) / 2, mx = o.x + d.x * mid, mz = o.z + d.z * mid;
          if (o.y + d.y * mid <= this.surfaceY(mx, mz)) hi = mid; else lo = mid;
        }
        const px = o.x + d.x * hi, pz = o.z + d.z * hi;
        return { x: px, y: this.surfaceY(px, pz), z: pz, sea: this.isSea(px, pz) };
      }
      prev = t;
    }
    return null;
  }

  project(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const w = this.container.clientWidth, h = this.container.clientHeight;
    return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, vis: v.z < 1 && v.z > -1 };
  }

  // ───────────────────────── 카메라
  camDist() { return this.camera.position.distanceTo(this.controls.target); }
  flyTo(target, dist, { polar = null, azimuth = null, dur = 1.2, done } = {}) {
    const c = this.controls;
    const t0 = c.target.clone();
    const off = this.camera.position.clone().sub(t0);
    const s0 = new THREE.Spherical().setFromVector3(off);
    const s1 = new THREE.Spherical(dist ?? s0.radius, polar ?? s0.phi, azimuth ?? s0.theta);
    let dth = s1.theta - s0.theta;
    while (dth > Math.PI) dth -= Math.PI * 2;
    while (dth < -Math.PI) dth += Math.PI * 2;
    const t1 = new THREE.Vector3(target.x, target.y ?? 0, target.z);
    this.flying = true;
    this.cancelTween('cam');
    this.tween(dur, (k) => {
      const e = easeInOut(k);
      c.target.lerpVectors(t0, t1, e);
      const s = new THREE.Spherical(s0.radius + (s1.radius - s0.radius) * e, s0.phi + (s1.phi - s0.phi) * e, s0.theta + dth * e);
      this.camera.position.setFromSpherical(s).add(c.target);
    }, () => { this.flying = false; done && done(); }, 'cam');
  }

  tween(dur, update, done, tag) { const tw = { t: 0, dur, update, done, tag }; this.tweens.push(tw); return tw; }
  cancelTween(tag) { this.tweens = this.tweens.filter((t) => t.tag !== tag); }

  // ───────────────────────── 오브젝트
  addLandmark(site, type, { pop = false, scale = 1 } = {}) {
    if (this.landmarks.has(site.id)) {
      const g = this.landmarks.get(site.id);
      if (pop) this.popObject(g, g.userData.s);
      return g;
    }
    const g = buildLandmark(type);
    const y = this.peakY(site.x, site.z) - 0.2;
    g.position.set(site.x, y, site.z);
    g.rotation.y = (site.lon * 37) % 1.2 - 0.6;
    g.userData.s = scale;
    g.scale.setScalar(pop ? 0.001 : scale);
    this.scene.add(g);
    this.landmarks.set(site.id, g);
    if (pop) this.popObject(g, scale);
    return g;
  }
  popObject(g, scale = 1, delay = 0) {
    const y0 = g.position.y;
    g.scale.setScalar(0.001);
    let wait = delay;
    this.tween(0.75 + delay, (k) => {
      const tt = Math.max(0, (k * (0.75 + delay) - wait) / 0.75);
      const e = easeOutBack(Math.min(1, tt));
      g.scale.set(scale * Math.max(0.001, e), scale * Math.max(0.001, e * (1 + Math.sin(tt * Math.PI) * 0.25)), scale * Math.max(0.001, e));
      g.position.y = y0 + Math.sin(Math.min(1, tt) * Math.PI) * 3;
    }, () => { g.position.y = y0; g.scale.setScalar(scale); });
  }
  removeLandmarks() { for (const g of this.landmarks.values()) this.scene.remove(g); this.landmarks.clear(); }

  makePawn() {
    if (this.pawn) return this.pawn;
    const p = buildPawn();
    this.scene.add(p.group);
    this.pawn = p;
    // 발밑 그림자 고리
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.4, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    this.scene.add(ring);
    p.ring = ring;
    return p;
  }
  placePawn(x, z) {
    const p = this.makePawn();
    p.group.position.set(x, this.surfaceY(x, z), z);
    p.group.visible = true; p.ring.visible = true;
  }
  hidePawn() { if (this.pawn) { this.pawn.group.visible = false; this.pawn.ring.visible = false; } }

  /** 통통 튀며 이동. onHop(i, n, x, z) 가 false를 돌려주면 그 자리에서 멈춘다 */
  hopPawn(tx, tz, { onHop, done, speed = 1 } = {}) {
    const p = this.pawn;
    const sx = p.group.position.x, sz = p.group.position.z;
    const dist = Math.hypot(tx - sx, tz - sz);
    if (dist < 0.3) { done && done(0); return; }
    const total = Math.min(6.5, Math.max(0.9, dist / 55)) / speed;
    const hops = Math.max(2, Math.round(total / 0.24));
    const hopDur = total / hops;
    p.group.rotation.y = Math.atan2(tx - sx, tz - sz);
    let h = 0;
    const next = () => {
      if (h >= hops) { done && done(dist); return; }
      const a = { x: sx + (tx - sx) * h / hops, z: sz + (tz - sz) * h / hops };
      const b = { x: sx + (tx - sx) * (h + 1) / hops, z: sz + (tz - sz) * (h + 1) / hops };
      const ya = this.surfaceY(a.x, a.z), yb = this.surfaceY(b.x, b.z);
      const hopH = 2.4 + Math.abs(yb - ya) * 0.6;
      this.tween(hopDur, (k) => {
        p.group.position.set(a.x + (b.x - a.x) * k, ya + (yb - ya) * k + Math.sin(k * Math.PI) * hopH, a.z + (b.z - a.z) * k);
        const sq = k < 0.15 ? 1 - (0.15 - k) * 1.6 : k > 0.85 ? 1 - (k - 0.85) * 1.6 : 1 + Math.sin(k * Math.PI) * 0.12;
        p.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
      }, () => {
        h++;
        p.body.scale.set(1, 1, 1);
        const go = onHop ? onHop(h, hops, b.x, b.z, Math.hypot(b.x - a.x, b.z - a.z)) : true;
        if (go === false) { done && done(Math.hypot(b.x - sx, b.z - sz), true); return; }
        next();
      }, 'pawn');
    };
    next();
  }

  makeStarToken(x, z) {
    const t = buildStarToken();
    t.position.set(x, this.peakY(x, z), z);
    this.scene.add(t);
    this.popObject(t, 1);
    return t;
  }
  makeDart() { const d = buildDart(); this.scene.add(d); return d; }
  makeFlag(x, z, color) { const f = buildFlag(color); f.position.set(x, this.peakY(x, z), z); this.scene.add(f); return f; }

  // 빛기둥(목적지 표시)
  makeBeacon() {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: '#fff3a6', transparent: true, opacity: 0.38, depthWrite: false, blending: THREE.AdditiveBlending });
    const col = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.2, 90, 20, 1, true), mat);
    col.position.y = 45;
    g.add(col);
    const ring = new THREE.Mesh(new THREE.RingGeometry(4, 5.4, 36), new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.5;
    g.add(ring);
    g.userData.ring = ring; g.userData.mat = mat;
    g.visible = false;
    this.scene.add(g);
    this.beacon = g;
    return g;
  }
  setBeacon(x, z, on) {
    const b = this.beacon || this.makeBeacon();
    b.visible = on;
    if (on) b.position.set(x, this.peakY(x, z), z);
  }

  // ───────────────────────── 루프
  start(onFrame) {
    this.onFrame = onFrame;
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(this.dtMax || 0.05, (now - last) / 1000);
      last = now;
      this.step(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  step(dt) {
    this.time += dt;
    if (this.waterUniforms) this.waterUniforms.uTime.value = this.time;
    const tw = this.tweens.slice();
    for (const t of tw) {
      t.t += dt;
      const k = Math.min(1, t.t / t.dur);
      t.update(k);
      if (k >= 1) { this.tweens.splice(this.tweens.indexOf(t), 1); t.done && t.done(); }
    }
    const c = this.controls;
    if (this.follow && !this.flying) {
      const fp = this.follow.position;
      const nt = c.target.clone().lerp(new THREE.Vector3(fp.x, fp.y, fp.z), 1 - Math.exp(-dt * 3.5));
      const d = nt.clone().sub(c.target);
      c.target.copy(nt);
      this.camera.position.add(d);
    }
    // 판 밖으로 너무 멀리 가지 않게
    c.target.x = Math.max(-WORLD_W * 0.6, Math.min(WORLD_W * 0.6, c.target.x));
    c.target.z = Math.max(-WORLD_H * 0.6, Math.min(WORLD_H * 0.6, c.target.z));
    c.target.y = Math.max(-5, Math.min(40, c.target.y));
    if (!this.flying) c.update();
    // 구름
    const cd = this.camDist();
    for (const cl of this.clouds || []) {
      cl.position.x += cl.userData.speed * dt;
      if (cl.position.x > 420) cl.position.x = -420;
      const d = cl.position.distanceTo(this.camera.position);
      cl.userData.mat.opacity = Math.min(0.92, Math.max(0, (d - 40) / 160)) * Math.min(1, cd / 220);
      cl.visible = cl.userData.mat.opacity > 0.02;
    }
    // 말 크기: 멀리서 볼 때 조금 크게
    if (this.pawn && this.pawn.group.visible) {
      const s = Math.min(3.2, Math.max(1, cd / 130));
      this.pawn.group.scale.setScalar(s);
      const gp = this.pawn.group.position;
      this.pawn.ring.position.set(gp.x, this.surfaceY(gp.x, gp.z) + 0.25, gp.z);
      this.pawn.ring.scale.setScalar(s * (1 + Math.sin(this.time * 4) * 0.08));
    }
    if (this.beacon && this.beacon.visible) {
      this.beacon.userData.ring.scale.setScalar(1 + (this.time % 1.2) * 0.8);
      this.beacon.userData.ring.material.opacity = 0.9 - (this.time % 1.2) * 0.7;
      this.beacon.scale.set(Math.max(1, cd / 200), 1, Math.max(1, cd / 200));
    }
    for (const u of this.updaters) u(dt, this.time);
    this.onFrame && this.onFrame(dt);
    this.renderer.render(this.scene, this.camera);
  }
}
