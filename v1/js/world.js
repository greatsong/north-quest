// 지형·바다·하늘·구름·조명·표지 기둥 등 3D 장면 구성
import * as THREE from 'three';
import { WORLD_W, WORLD_H, lonLatToWorld } from '../../shared/geo.js';

export const EXAG = 0.008; // 고도 1m → 0.008 월드 단위 (8배 과장)
export const SUN_DIR = new THREE.Vector3(-0.78, 0.36, 0.42).normalize();

const SKY = {
  top: new THREE.Color('#1d3f7a'),
  mid: new THREE.Color('#5d8fd0'),
  horizon: new THREE.Color('#ffc996'),
  sun: new THREE.Color('#ffb46b'),
};

export function seaY(m) { return Math.max(-2.4, -0.25 + m * 0.0011); }

export async function createWorld({ scene, renderer, heights, content, low, base }) {
  const world = {};
  const { w, h, data } = heights;

  function heightAt(x, z) {
    const m = heights.sampleWorld(x, z);
    return m > 0 ? m * EXAG : seaY(m);
  }
  world.heightAt = heightAt;
  world.floorAt = (x, z) => Math.max(heightAt(x, z), 0);
  world.inBounds = (x, z, pad = 0) => Math.abs(x) < WORLD_W / 2 - pad && Math.abs(z) < WORLD_H / 2 - pad;

  // ---------- 조명 ----------
  const hemi = new THREE.HemisphereLight('#cfe2ff', '#6b5a45', 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffd8ad', 1.9);
  sun.position.copy(SUN_DIR).multiplyScalar(500);
  scene.add(sun);
  world.sunLight = sun;

  // ---------- 지형 ----------
  const tex = await new THREE.TextureLoader().loadAsync(`${base}/colormap.jpg`);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const maskTex = await new THREE.TextureLoader().loadAsync(`${base}/mask.png`);
  maskTex.generateMipmaps = false;
  maskTex.minFilter = THREE.LinearFilter;

  const pos = new Float32Array(w * h * 3);
  const uv = new Float32Array(w * h * 2);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      const m = data[k];
      pos[k * 3] = ((i + 0.5) / w) * WORLD_W - WORLD_W / 2;
      pos[k * 3 + 1] = m > 0 ? m * EXAG : seaY(m);
      pos[k * 3 + 2] = ((j + 0.5) / h) * WORLD_H - WORLD_H / 2;
      uv[k * 2] = (i + 0.5) / w;
      uv[k * 2 + 1] = 1 - (j + 0.5) / h;
    }
  }
  const idx = new Uint32Array((w - 1) * (h - 1) * 6);
  let p = 0;
  for (let j = 0; j < h - 1; j++) {
    for (let i = 0; i < w - 1; i++) {
      const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
      idx[p++] = a; idx[p++] = c; idx[p++] = b;
      idx[p++] = b; idx[p++] = c; idx[p++] = d;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const terrainMat = new THREE.MeshLambertMaterial({ map: tex });
  const terrain = new THREE.Mesh(geo, terrainMat);
  scene.add(terrain);
  world.terrain = terrain;

  // 지형 테두리 벽 (디오라마처럼 보이게)
  {
    const edge = [];
    for (let i = 0; i < w; i++) edge.push(i);
    for (let j = 1; j < h; j++) edge.push(j * w + w - 1);
    for (let i = w - 2; i >= 0; i--) edge.push((h - 1) * w + i);
    for (let j = h - 2; j >= 0; j--) edge.push(j * w);
    const sp = new Float32Array(edge.length * 6);
    edge.forEach((k, n) => {
      sp[n * 6] = pos[k * 3]; sp[n * 6 + 1] = pos[k * 3 + 1]; sp[n * 6 + 2] = pos[k * 3 + 2];
      sp[n * 6 + 3] = pos[k * 3]; sp[n * 6 + 4] = -5; sp[n * 6 + 5] = pos[k * 3 + 2];
    });
    const si = [];
    for (let n = 0; n < edge.length - 1; n++) {
      const a = n * 2, b = a + 1, c = a + 2, d = a + 3;
      si.push(a, b, c, c, b, d);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sg.setIndex(si);
    sg.computeVertexNormals();
    const skirt = new THREE.Mesh(sg, new THREE.MeshLambertMaterial({ color: '#3a3027', side: THREE.DoubleSide }));
    scene.add(skirt);
  }

  // ---------- 바다 ----------
  const waterMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uMask: { value: null }, uTime: { value: 0 },
      uSun: { value: SUN_DIR.clone() }, uSunCol: { value: new THREE.Color('#ffd9a8') },
      uShallow: { value: new THREE.Color('#2f78b8') }, uDeep: { value: new THREE.Color('#123a6b') },
      uSky: { value: new THREE.Color('#bcd6f0') }, uSize: { value: new THREE.Vector2(WORLD_W, WORLD_H) },
    }]),
    vertexShader: `
      #include <fog_pars_vertex>
      varying vec3 vW;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <fog_pars_fragment>
      uniform sampler2D uMask; uniform float uTime; uniform vec3 uSun; uniform vec3 uSunCol;
      uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uSky; uniform vec2 uSize;
      varying vec3 vW;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        vec2 uv = vec2((vW.x + uSize.x * 0.5) / uSize.x, 1.0 - (vW.z + uSize.y * 0.5) / uSize.y);
        bool inside = uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0;
        float sea = inside ? texture2D(uMask, uv).g : 1.0;
        if (sea < 0.5) discard;
        vec2 p = vW.xz; float t = uTime;
        float cd = length(cameraPosition - vW);
        float f1 = clamp(1.0 - cd / 260.0, 0.0, 1.0);
        float f2 = clamp(1.0 - cd / 70.0, 0.0, 1.0);
        vec3 n = normalize(vec3(
          (sin(p.x * 0.35 + t * 0.9) * 0.05 + sin(p.x * 0.8 - p.y * 0.6 + t * 1.4) * 0.04) * f1 + sin((p.x + p.y) * 2.1 + t * 2.4) * 0.03 * f2,
          1.0,
          (cos(p.y * 0.3 + t * 0.8) * 0.05 + sin(p.y * 0.9 + p.x * 0.5 - t * 1.2) * 0.04) * f1 + cos((p.x - p.y) * 1.9 - t * 2.2) * 0.03 * f2));
        vec3 v = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
        vec3 r = reflect(-v, n);
        float sd = max(dot(r, uSun), 0.0);
        float spec = pow(sd, 220.0);
        float glint = step(0.985, h21(floor(p * 4.0) + floor(t * 4.0))) * pow(sd, 10.0) * f2;
        vec3 col = mix(uShallow, uSky, fres * 0.85);
        col += uSunCol * (spec * 2.2 + glint * 1.4);
        float a = clamp(0.22 + fres * 0.55 + spec + glint * 0.6, 0.0, 0.95);
        if (!inside) { col = mix(uDeep, col, 0.35); a = 1.0; }
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  waterMat.uniforms.uMask.value = maskTex;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000).rotateX(-Math.PI / 2), waterMat);
  water.position.y = 0.0;
  water.renderOrder = 1;
  scene.add(water);
  world.water = water;

  // ---------- 하늘 ----------
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: SKY.top }, mid: { value: SKY.mid }, horizon: { value: SKY.horizon },
      sunCol: { value: SKY.sun }, sunDir: { value: SUN_DIR },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 sunCol; uniform vec3 sunDir;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir); float hh = d.y;
        vec3 col = mix(horizon, mid, smoothstep(0.0, 0.28, hh));
        col = mix(col, top, smoothstep(0.28, 0.9, hh));
        col = mix(col, horizon * 0.85, smoothstep(0.0, -0.25, hh));
        float s = max(dot(d, sunDir), 0.0);
        col += sunCol * (pow(s, 900.0) * 6.0 + pow(s, 40.0) * 0.45 + pow(s, 6.0) * 0.18);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), skyMat);
  sky.renderOrder = -1;
  scene.add(sky);
  world.sky = sky;

  scene.fog = new THREE.Fog(SKY.horizon.clone(), 90, 360);
  world.setFog = (near, far) => { scene.fog.near = near; scene.fog.far = far; };

  // ---------- 구름 ----------
  const clouds = new THREE.Group();
  const cloudTexs = [0, 1, 2].map(() => makeCloudTexture());
  const nClouds = low ? 40 : 80;
  for (let i = 0; i < nClouds; i++) {
    const mat = new THREE.SpriteMaterial({
      map: cloudTexs[i % 3], color: new THREE.Color().setHSL(0.07, 0.6, 0.93 + Math.random() * 0.05),
      transparent: true, opacity: 0.65 + Math.random() * 0.25, depthWrite: false, fog: true,
    });
    const s = new THREE.Sprite(mat);
    const sw = 28 + Math.random() * 46;
    s.scale.set(sw, sw * 0.42, 1);
    s.position.set((Math.random() - 0.5) * WORLD_W * 1.2, 34 + Math.random() * 26, (Math.random() - 0.5) * WORLD_H * 1.2);
    s.userData.speed = 0.6 + Math.random() * 0.8;
    clouds.add(s);
  }
  scene.add(clouds);
  world.clouds = clouds;

  // ---------- 도 경계·국경 선 ----------
  function lineFromLonLat(coords, lift, step = 1.2) {
    const pts = [];
    for (let i = 0; i < coords.length; i++) {
      const a = lonLatToWorld(coords[i][0], coords[i][1]);
      if (i > 0) {
        const b0 = lonLatToWorld(coords[i - 1][0], coords[i - 1][1]);
        const len = Math.hypot(a.x - b0.x, a.z - b0.z);
        const n = Math.max(1, Math.ceil(len / step));
        for (let k = 1; k < n; k++) {
          const x = b0.x + (a.x - b0.x) * k / n, z = b0.z + (a.z - b0.z) * k / n;
          pts.push(x, Math.max(heightAt(x, z), 0) + lift, z);
        }
      }
      pts.push(a.x, Math.max(heightAt(a.x, a.z), 0) + lift, a.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }
  const provLines = new THREE.Group();
  const provMat = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false });
  for (const pv of content.geo.provinces) for (const ring of pv.rings) provLines.add(new THREE.Line(lineFromLonLat(ring, 0.35), provMat));
  provLines.visible = false;
  scene.add(provLines);
  world.provLines = provLines;

  const borderLines = new THREE.Group();
  const borderMat = new THREE.LineBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.95, depthWrite: false });
  for (const line of content.geo.border_lines) borderLines.add(new THREE.Line(lineFromLonLat(line, 0.45), borderMat));
  scene.add(borderLines);
  world.borderLines = borderLines;

  // ---------- 장소 표시(작은 보석 기둥) ----------
  const markers = new Map();
  const gemGeo = new THREE.OctahedronGeometry(0.9, 0);
  const stickGeo = new THREE.CylinderGeometry(0.12, 0.12, 1, 6, 1, true);
  for (const s of content.sites) {
    const col = s.country === 'CHN' ? '#ff6b8a' : (s.type === 'nature' ? '#59f0a2' : '#ffcf4a');
    const g = new THREE.Group();
    const small = !!s.cluster;
    const gy = world.floorAt(s.x, s.z);
    const hgt = small ? 3.5 : 6;
    const gem = new THREE.Mesh(gemGeo, new THREE.MeshBasicMaterial({ color: col, fog: true }));
    gem.scale.set(small ? 0.55 : 0.85, small ? 0.8 : 1.2, small ? 0.55 : 0.85);
    gem.position.y = hgt;
    const stick = new THREE.Mesh(stickGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    stick.scale.y = hgt; stick.position.y = hgt / 2;
    g.add(gem, stick);
    g.position.set(s.x, gy, s.z);
    g.userData = { gem, phase: Math.random() * 6 };
    scene.add(g);
    markers.set(s.id, g);
  }
  world.markers = markers;
  world.setMarkersVisible = (on) => { for (const g of markers.values()) g.visible = on; };

  // ---------- 업데이트 ----------
  const anim = [];
  world.addAnim = (fn) => { anim.push(fn); return fn; };
  world.removeAnim = (fn) => { const i = anim.indexOf(fn); if (i >= 0) anim.splice(i, 1); };

  world.update = (dt, t, camera) => {
    waterMat.uniforms.uTime.value = t;
    sky.position.copy(camera.position);
    if (clouds.visible) {
      for (const c of clouds.children) {
        c.position.x += c.userData.speed * dt;
        if (c.position.x > WORLD_W * 0.6) c.position.x = -WORLD_W * 0.6;
      }
    }
    for (const g of markers.values()) {
      if (!g.visible) continue;
      const u = g.userData;
      u.gem.rotation.y = t * 1.5 + u.phase;
      u.gem.position.y = (u.gem.scale.y > 1 ? 6 : 3.5) + Math.sin(t * 2 + u.phase) * 0.3;
    }
    for (let i = anim.length - 1; i >= 0; i--) anim[i](dt, t);
  };

  // ---------- 화면 좌표로 지형 찍기 (높이장 광선 진행) ----------
  const tmp = new THREE.Vector3();
  world.pick = (ray) => {
    const o = ray.origin, d = ray.direction;
    let t = 0, prev = 0;
    for (let n = 0; n < 2000 && t < 4000; n++) {
      tmp.copy(d).multiplyScalar(t).add(o);
      const g = world.inBounds(tmp.x, tmp.z) ? world.floorAt(tmp.x, tmp.z) : 0;
      const gap = tmp.y - g;
      if (gap <= 0) {
        let a = prev, b = t;
        for (let k = 0; k < 24; k++) {
          const m = (a + b) / 2;
          tmp.copy(d).multiplyScalar(m).add(o);
          if (tmp.y - world.floorAt(tmp.x, tmp.z) > 0) a = m; else b = m;
        }
        tmp.copy(d).multiplyScalar(b).add(o);
        if (!world.inBounds(tmp.x, tmp.z)) return null;
        return tmp.clone();
      }
      prev = t;
      t += Math.max(0.25, gap * 0.45);
    }
    return null;
  };

  return world;
}

function makeCloudTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 16; i++) {
    const x = 50 + Math.random() * 156, y = 58 + Math.random() * 30, r = 18 + Math.random() * 30;
    const gr = g.createRadialGradient(x, y - r * 0.2, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)');
    gr.addColorStop(0.55, 'rgba(250,246,245,0.6)');
    gr.addColorStop(1, 'rgba(235,230,235,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- 목적지 빛 기둥 + 고리 ----------
export function makeBeacon(color = '#ffd34a', radius = 1.6) {
  const g = new THREE.Group();
  const col = new THREE.Color(color);
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uCol: { value: col }, uTime: { value: 0 }, uOp: { value: 1 } },
    vertexShader: 'varying vec2 vUv; varying float vD; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform vec3 uCol; uniform float uTime; uniform float uOp; varying vec2 vUv;
      varying float vD;
      void main(){ float a = pow(1.0 - vUv.y, 2.2) * (0.42 + 0.12 * sin(vUv.y * 60.0 - uTime * 5.0));
        float near = smoothstep(4.0, 26.0, vD);
        gl_FragColor = vec4(uCol * 1.15, a * uOp * near); }`,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.7, radius * 0.9, 140, 24, 1, true), beamMat);
  beam.position.y = 70;
  const coreMat = beamMat.clone();
  coreMat.blending = THREE.AdditiveBlending;
  coreMat.uniforms.uCol.value = new THREE.Color('#ffffff');
  const core = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.18, radius * 0.22, 140, 12, 1, true), coreMat);
  core.position.y = 70;
  const ringMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const r1 = new THREE.Mesh(new THREE.TorusGeometry(radius * 2.4, radius * 0.12, 8, 48), ringMat);
  const r2 = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.8, radius * 0.08, 8, 40), ringMat);
  r1.rotation.x = r2.rotation.x = Math.PI / 2;
  const pulseMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const pulse = new THREE.Mesh(new THREE.RingGeometry(radius * 0.9, radius * 1.3, 48).rotateX(-Math.PI / 2), pulseMat);
  pulse.position.y = 0.4;
  g.add(beam, core, r1, r2, pulse);
  g.userData.update = (t) => {
    beamMat.uniforms.uTime.value = t; coreMat.uniforms.uTime.value = t;
    r1.position.y = 7 + Math.sin(t * 1.6) * 1.2; r1.rotation.z = t * 0.8;
    r2.position.y = 12 + Math.sin(t * 1.6 + 1.5) * 1.2; r2.rotation.z = -t * 1.1;
    const k = (t * 0.6) % 1;
    pulse.scale.setScalar(1 + k * 4);
    pulseMat.opacity = 0.8 * (1 - k);
  };
  g.userData.setOpacity = (o) => { beamMat.uniforms.uOp.value = o; coreMat.uniforms.uOp.value = o; ringMat.opacity = 0.9 * o; };
  return g;
}
