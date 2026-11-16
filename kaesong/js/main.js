// 개성 특별편: 드론 → 착륙 → 걷기
import * as THREE from 'three';
import { loadGrid, ll2w, WORLD_W, WORLD_H } from './geo.js';
import { createWorld, makeBeacon, SUN_DIR } from './world.js';
import { PLOTS, PLOT_OF, buildPlot, makeCollider, animateWater } from './sites.js';
import { createWalker } from './walk.js';
import { createDrone, introPath } from './drone.js';
import { sfx, unlock, isMuted, setMuted, droneHum } from './audio.js';
import { store } from './store.js';
import * as UI from './ui.js';
const { $, esc } = UI;

const Q = new URLSearchParams(location.search);
const DEBUG = Q.has('debug');
const LOW = Q.get('low') === '1' || (Q.get('low') !== '0' && (matchMedia('(pointer: coarse)').matches || innerWidth < 760));
const TOUCH = matchMedia('(pointer: coarse)').matches || Q.has('touch');
if (Q.get('diff')) store.s.diff = Math.min(3, Math.max(1, +Q.get('diff')));

window.addEventListener('error', (e) => { if (DEBUG) UI.toast('오류: ' + e.message, 8000); });
window.addEventListener('unhandledrejection', (e) => { console.error(e.reason); if (DEBUG) UI.toast('오류: ' + (e.reason && e.reason.message), 8000); });

const QUEST = ['manwoldae', 'seonjuk', 'pyochung', 'sungyang'];
const QUEST_LINE = { manwoldae: 0, seonjuk: 0, pyochung: 1, sungyang: 0 }; // 장면에 보여 줄 story 문장 번호

const setLoad = (p, t) => { $('#ld-fill').style.width = p + '%'; if (t) $('#ld-text').textContent = t; };

// ---------- 렌더러 ----------
const canvas = $('#c');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW, powerPreference: 'high-performance' });
} catch (e) {
  $('#ld-text').textContent = '이 기기에서는 3D 화면(WebGL)을 사용할 수 없습니다.';
  throw e;
}
renderer.setPixelRatio(LOW ? 1 : Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.62;
renderer.shadowMap.enabled = !LOW;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 1.5, 60000);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

// ---------- 상태 ----------
let data, sites = {}, W, drone, walker, photos = {};
const plots = PLOTS;
const built = {}, colliders = {}, obsObjs = {};
let mode = 'loading', cur = null; // cur: 현재 걷는 부지
let modeT = 0, clockT = 0;
const inp = { mx: 0, mz: 0, turn: 0, strafe: 0, up: 0, run: false, jump: false, dragging: false };
const keys = new Set();
let parked = null; // 착륙한 드론 위치
let trans = null; // 전환 연출 상태
const labels = [];
const anims = [];
const sentences = (s) => s.story.split(/(?<=다\.)\s+/);

async function boot() {
  setLoad(8, '자료를 불러오는 중입니다');
  const base = '../shared/kaesong/';
  const [json, grid, img] = await Promise.all([
    fetch(base + 'kaesong.json').then((r) => r.json()),
    LOW ? loadGrid(base + 'height_512x406.i16', 512, 406) : loadGrid(base + 'height_1024x812.i16', 1024, 812),
    new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = base + 'colormap.jpg'; }),
  ]);
  data = json;
  for (const s of data.sites) sites[s.id] = s;
  if (!Q.has('nophoto')) {
    try {
      const r = await fetch('../shared/data/photos.json', { cache: 'no-cache' });
      if (r.ok) { const pj = await r.json(); photos = (pj && pj.photos) || {}; }
    } catch (e) { /* 사진 없이 진행 */ }
  }
  setLoad(30, '지형을 다듬는 중입니다');
  await tick();
  // 부지 위치·높이·평탄화
  for (const p of plots) {
    // 좌표는 kaesong.json 값을 사용한다(대표 장소가 표식 위치에 오도록 부지 중심을 옮김)
    const main = sites[p.members[0]];
    if (main) { p.lat = main.lat; p.lon = main.lon; }
    const w = ll2w(p.lat, p.lon); const [ax, az] = p.marks[p.members[0]];
    p.x = w.x - ax; p.z = w.z - az;
    p.h0 = grid.origAt(p.x, p.z);
    if (p.summit) { let m = 0; for (let a = 0; a < 6.28; a += 0.5) for (const r of [0, 10, 20]) m = Math.max(m, grid.origAt(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r)); p.h0 = m - 2; }
    grid.flatten(p.x, p.z, p.summit ? p.R + 4 : p.R + grid.dx * 1.6, p.summit ? 45 : 120, p.h0);
  }
  setLoad(45, '숲과 마을을 심는 중입니다');
  await tick();
  W = createWorld({ renderer, scene, grid, cmImg: img, plots, low: LOW });
  setLoad(65, '유적을 짓는 중입니다');
  await tick();
  for (const p of plots) {
    const b = buildPlot(p, renderer, LOW);
    built[p.id] = b; scene.add(b.group);
    colliders[p.id] = makeCollider(p, b, grid);
    anims.push(...b.anims);
    makeObsMarkers(p);
    await tick();
  }
  setLoad(85, '드론을 준비하는 중입니다');
  // 장소 표식(빛기둥)과 라벨
  for (const p of plots) for (const id of p.members) {
    const [mx, mz] = p.marks[id];
    const pos = new THREE.Vector3(p.x + mx, p.h0, p.z + mz);
    const bc = makeBeacon(store.hasStamp(id) ? '#4fd1a5' : '#ffc247');
    bc.position.copy(pos); scene.add(bc);
    const el = document.createElement('div'); el.className = 'lbl3d';
    el.innerHTML = `<div class="pill">${esc(UI.shortName(sites[id].name))}</div><div class="dist"></div><div class="stem"></div>`;
    el.onclick = (e) => { e.stopPropagation(); sfx.click(); landOn(id); };
    $('#labels').appendChild(el);
    labels.push({ id, el, pos, beacon: bc, plot: p });
  }
  walker = createWalker(scene);
  drone = createDrone(scene, grid);
  drone.model.visible = false;
  wireUI();
  setLoad(100, '준비 완료');
  W.updateTrees(new THREE.Vector3(0, 0, 0), true);
  setTimeout(() => $('#loading').classList.add('out'), 200);
  startFromParams();
  // ?tick: 헤드리스 검사용(requestAnimationFrame 대신 타이머로 진행)
  if (Q.has('tick')) setInterval(loop, 100); else renderer.setAnimationLoop(loop);
}
const tick = () => new Promise((r) => setTimeout(r, 0));

// ---------- 관찰 포인트 표시 ----------
let glowTex = null;
function glow() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,236,170,0.95)'); g.addColorStop(0.45, 'rgba(255,190,60,0.35)'); g.addColorStop(1, 'rgba(255,170,40,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  // 반짝이는 십자
  x.globalCompositeOperation = 'lighter'; x.fillStyle = 'rgba(255,255,255,0.5)'; x.fillRect(62, 4, 4, 120); x.fillRect(4, 62, 120, 4);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
function lookPos(p, look) {
  if (Array.isArray(look)) return new THREE.Vector3(p.x + look[0], p.h0 + look[1], p.z + look[2]);
  if (look === 'south') { const w = ll2w(37.93, 126.56); return new THREE.Vector3(w.x, 40, w.z); }
  const t = PLOT_OF[look]; const [mx, mz] = t.marks[look];
  return new THREE.Vector3(t.x + mx, t.h0 + 6, t.z + mz);
}
function makeObsMarkers(p) {
  const col = colliders[p.id];
  obsObjs[p.id] = p.obs.map((o, i) => {
    const look = lookPos(p, o.look);
    const ax = p.x + o.at[0], az = p.z + o.at[1];
    const gy = col.groundAt(ax, az, 999) ?? col.baseAt(ax, az);
    const g = new THREE.Group();
    const orbMat = new THREE.SpriteMaterial({ map: glow(), color: '#ffd36b', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    const orb = new THREE.Sprite(orbMat);
    const far = look.distanceTo(new THREE.Vector3(ax, gy, az)) > 60;
    orb.position.copy(far ? new THREE.Vector3(ax, gy + 2.6, az) : look); orb.scale.setScalar(far ? 1.4 : 1.6);
    g.add(orb);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.3, 40), new THREE.MeshBasicMaterial({ color: '#ffcf5a', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(ax, gy + 0.08, az); g.add(ring);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.3, 3.2, 10, 1, true), new THREE.MeshBasicMaterial({ color: '#ffcf5a', transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.position.set(ax, gy + 1.6, az); g.add(beam);
    g.visible = false;
    scene.add(g);
    const found = store.obsFound(o.site).includes(o.s);
    return { o, i, g, orb, ring, beam, look, at: new THREE.Vector3(ax, gy, az), found };
  });
}

// ---------- 입자 효과 ----------
const bursts = [];
function burst(pos, color = '#ffd36b', n = 40, speed = 4, life = 1.2, size = 0.5) {
  const geo = new THREE.BufferGeometry(); const P = new Float32Array(n * 3); const V = [];
  for (let i = 0; i < n; i++) { P[i * 3] = pos.x; P[i * 3 + 1] = pos.y; P[i * 3 + 2] = pos.z; const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8)); V.push(v); }
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  const m = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, map: glow(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.frustumCulled = false; scene.add(m);
  bursts.push({ m, V, t: 0, life });
}
function updateBursts(dt) {
  for (let k = bursts.length - 1; k >= 0; k--) {
    const b = bursts[k]; b.t += dt;
    const P = b.m.geometry.attributes.position;
    for (let i = 0; i < b.V.length; i++) { b.V[i].y -= 6 * dt; P.setXYZ(i, P.getX(i) + b.V[i].x * dt, P.getY(i) + b.V[i].y * dt, P.getZ(i) + b.V[i].z * dt); }
    P.needsUpdate = true; b.m.material.opacity = Math.max(0, 1 - b.t / b.life);
    if (b.t > b.life) { scene.remove(b.m); b.m.geometry.dispose(); bursts.splice(k, 1); }
  }
}

// ---------- 환경 전환 ----------
function envDrone() {
  camera.near = 1.5; camera.far = 60000; camera.updateProjectionMatrix();
  W.sky.scale.setScalar(50000);
  scene.fog.density = 0.000055;
  W.setTreeRadius(W.lowTrees ? 1800 : 3300);
  W.setShadowBox(750, 8000);
  W.tUni.uDetail.value = 1;
  for (const p of plots) built[p.id].group.visible = true;
}
function envWalk() {
  camera.near = 0.15; camera.far = 9000; camera.updateProjectionMatrix();
  W.sky.scale.setScalar(8000);
  scene.fog.density = 0.00016;
  W.setTreeRadius(LOW || W.lowTrees ? 900 : 1700);
  W.setShadowBox(75, 6000);
}

// ---------- 시작 ----------
function startFromParams() {
  const scn = Q.get('scene'), demo = Q.get('demo'), sid = Q.get('site');
  envDrone();
  if (scn === 'walk' && PLOT_OF[sid]) { enterWalkDirect(sid); return; }
  if (scn === 'drone') { startDrone(Q.get('at')); return; }
  if (scn === 'intro') { startIntro(+(Q.get('t') || 0)); return; }
  if (demo) {
    if (demo === 'quiz' || demo === 'card') { const id = sites[sid] ? sid : 'seonjuk'; if (PLOT_OF[id]) enterWalkDirect(id); else startDrone(); setTimeout(() => (demo === 'quiz' ? openSiteQuiz(id, true) : openSiteCard(id)), 400); return; }
    startDrone();
    if (demo === 'book') setTimeout(openBook, 300);
    if (demo === 'exam') setTimeout(() => runExam(true), 300);
    if (demo === 'result') setTimeout(() => showExamResult({ correct: 9, total: 10, score: 2240 }, true), 300);
    if (demo === 'stamp') setTimeout(() => UI.bigStamp('선죽교'), 400);
    // 착륙 흐름 확인: 드론에서 자동 비행 후 착륙
    if (demo === 'land') setTimeout(() => landOn(sites[sid] ? sid : 'manwoldae'), 300);
    // 관찰 포인트를 차례로 찾아 도장·문제 열림까지 확인
    if (demo === 'complete') {
      const id = sites[sid] ? sid : 'chomsongdae';
      enterWalkDirect(id);
      obsObjs[PLOT_OF[id].id].filter((o) => o.o.site === id).forEach((O, k) => setTimeout(() => { walker.pos.set(O.at.x, O.at.y, O.at.z); }, 600 + k * 900));
    }
    if (demo === 'takeoff') { enterWalkDirect(sites[sid] ? sid : 'namdaemun'); setTimeout(() => takeoff(), 600); }
    return;
  }
  showTitle();
}
function showTitle() {
  mode = 'title'; modeT = 0;
  $('#title').classList.remove('hidden'); $('#hud').classList.add('hidden');
  document.querySelectorAll('#diff button').forEach((b) => b.classList.toggle('on', +b.dataset.d === store.s.diff));
}
function hideTitle() { $('#title').classList.add('hidden'); }

// ---------- 시작 연출 ----------
let intro = null;
const INTRO_DUR = 46;
function startIntro(t0 = 0) {
  hideTitle(); unlock();
  mode = 'intro'; modeT = t0;
  intro = introPath(ll2w);
  $('#hud').classList.add('hidden');
  drone.model.visible = false;
  sfx.whoosh();
}
const INTRO_CAPS = [
  [0, 7, '개성 특별편', 0, null],
  [7, 14, '서울에서 약 60km', 5, 'kaesong_ic'],
  [14, 21, '고려의 도성', 1, 'namdaemun'],
  [21, 28, '1392년', 2, 'seonjuk'],
  [28, 36, '세계유산', 3, 'manwoldae'],
  [36, 46, '개성 역사유적지구', 4, 'songak'],
];
function updateIntro(dt) {
  const t = modeT, k = Math.min(1, t / INTRO_DUR);
  const e = k * k * (3 - 2 * k) * 0.35 + k * 0.65;
  camera.position.copy(intro.cam.getPointAt(e));
  camera.lookAt(intro.look.getPointAt(e));
  const intro_s = sentences(sites.kaesong_intro);
  const cap = INTRO_CAPS.find((c) => t >= c[0] && t < c[1]);
  const key = cap ? cap[0] : -1;
  if (updateIntro.key !== key) {
    updateIntro.key = key;
    if (cap) { UI.caption(cap[2], intro_s[cap[3]], skipIntro); sfx.whoosh(); } else UI.caption('');
  }
  // 이야기와 관련된 장소 라벨만 보이기
  const show = cap && cap[4];
  for (const L of labels) L.introShow = show === L.id;
  if (t >= INTRO_DUR) finishIntro();
}
function skipIntro() { sfx.click(); finishIntro(); }
function finishIntro() {
  UI.caption('');
  for (const L of labels) L.introShow = false;
  const end = intro.cam.getPointAt(1);
  startDrone(null, end);
  openSiteCard('kaesong_intro');
}

// ---------- 드론 ----------
function startDrone(at, pos) {
  hideTitle(); unlock();
  envDrone();
  if (pos) drone.place(pos.x, pos.y, pos.z, 0);
  else if (at) { const [la, lo] = at.split(',').map(Number); const w = ll2w(la, lo); drone.place(w.x, +(Q.get('alt') || 450), w.z, +(Q.get('heading') || 0)); }
  else { const w = ll2w(37.955, 126.556); drone.place(w.x, 520, w.z, 0); }
  if (Q.get('pitch')) drone.camPitch = +Q.get('pitch');
  drone.model.visible = true;
  walker.hide();
  cur = null; mode = 'drone'; modeT = 0;
  $('#hud').classList.remove('hidden');
  if (TOUCH) $('#touch').classList.remove('hidden');
  camera.position.copy(drone.pos).add(new THREE.Vector3(0, 12, 26));
  setActions(); refreshHUD();
}

// 장소로 날아가 착륙
function landOn(id) {
  if (UI.modalOpen()) UI.closeModal();
  const p = PLOT_OF[id];
  if (!p) { openSiteCard(id); return; }
  if (mode === 'walk') { if (cur === p) { UI.toast('지금 이곳을 걷고 있습니다'); return; } takeoff(() => landOn(id)); return; }
  if (mode === 'title') startDrone();
  if (mode !== 'drone') return;
  const [mx, mz] = p.marks[id];
  const tgt = new THREE.Vector3(p.x + mx, p.h0 + 130, p.z + mz + 170);
  const dist = drone.pos.distanceTo(tgt);
  mode = 'auto'; modeT = 0;
  UI.toast(`${UI.shortName(sites[id].name)}(으)로 날아갑니다`);
  sfx.whoosh();
  drone.flyTo(tgt, 0, THREE.MathUtils.clamp(dist / 900, 2.2, 8), () => beginLanding(p, id));
  setActions();
}
function beginLanding(p, focusId) {
  mode = 'landing'; modeT = 0;
  const [sx, sz, syaw] = p.spawn;
  const wx = p.x + sx, wz = p.z + sz;
  const col = colliders[p.id];
  const gy = col.groundAt(wx, wz, 999) ?? col.baseAt(wx, wz);
  const park = new THREE.Vector3(wx + Math.cos(syaw) * 4.5 - Math.sin(syaw) * 2, gy + 0.45, wz - Math.sin(syaw) * 4.5 - Math.cos(syaw) * 2);
  const head = new THREE.Vector3(wx, gy + 1.55, wz);
  const endCam = new THREE.Vector3(wx + Math.sin(syaw) * 6.2, gy + 3.6, wz + Math.cos(syaw) * 6.2);
  trans = { p, focusId, from: camera.position.clone(), fromLook: drone.pos.clone(), droneFrom: drone.pos.clone(), park, head, endCam, spawn: [wx, wz, syaw], env: false, shown: false, dur: 2.6 };
  sfx.land();
}
function updateLanding(dt) {
  const T = trans, k = Math.min(1, modeT / T.dur);
  const e = 1 - Math.pow(1 - k, 3);
  // 드론은 내려와 주차, 카메라는 위에서 사람 눈높이로
  drone.pos.lerpVectors(T.droneFrom, T.park, e); drone.model.scale.setScalar(2.2 - 1.1 * e);
  drone.model.position.copy(drone.pos); drone.spinRotors(dt, 60 * (1 - k * 0.6));
  const mid = T.from.clone().lerp(T.endCam, 0.5); mid.y = Math.max(T.from.y, T.endCam.y) * 0.6 + T.endCam.y * 0.4;
  const a = T.from.clone().lerp(mid, e), b = mid.clone().lerp(T.endCam, e);
  camera.position.copy(a.lerp(b, e));
  const look = T.fromLook.clone().lerp(T.head, Math.min(1, e * 1.3));
  camera.lookAt(look);
  if (!T.env && k > 0.55) { T.env = true; envWalk(); W.updateTrees(T.head, true); W.focusShadow(T.head); }
  if (!T.shown && k > 0.72) {
    T.shown = true;
    walker.place(T.spawn[0], T.spawn[1], T.spawn[2], colliders[T.p.id], T.p);
    burst(new THREE.Vector3(T.spawn[0], walker.pos.y + 0.3, T.spawn[1]), '#e8d3a8', 50, 4, 1.0, 0.7);
  }
  if (k >= 1) enterWalk(T.p, T.focusId);
}
function enterWalk(p, focusId) {
  cur = p; mode = 'walk'; modeT = 0;
  parked = trans ? trans.park.clone() : null;
  if (parked) { drone.pos.copy(parked); drone.model.position.copy(parked); drone.model.rotation.set(0, walker.yaw, 0); drone.model.scale.setScalar(1.1); }
  trans = null;
  UI.banner('착륙!');
  const ids = p.members.map((m) => UI.shortName(sites[m].name)).join(' · ');
  UI.toast(`${ids} 도착`);
  showObs(p);
  const total = p.obs.length, found = obsObjs[p.id].filter((o) => o.found).length;
  if (found < total) setTimeout(() => UI.toast(`빛나는 관찰 포인트에 다가가면 설명이 열립니다 (${found}/${total})`, 3800), 900);
  if (p.note) { $('#note').textContent = p.note; $('#note').classList.remove('hidden'); }
  setActions(); refreshHUD();
}
// 디버그: 바로 걷기
function enterWalkDirect(id) {
  const p = PLOT_OF[id];
  hideTitle();
  $('#hud').classList.remove('hidden');
  if (TOUCH) $('#touch').classList.remove('hidden');
  envWalk();
  let [sx, sz, syaw] = p.spawn;
  if (Q.get('pos')) [sx, sz] = Q.get('pos').split(',').map(Number);
  if (Q.get('yaw')) syaw = +Q.get('yaw');
  const wx = p.x + sx, wz = p.z + sz;
  walker.place(wx, wz, syaw, colliders[p.id], p);
  if (Q.get('cyaw')) walker.camYaw = +Q.get('cyaw');
  if (Q.get('cpitch')) walker.camPitch = +Q.get('cpitch');
  if (Q.get('cdist')) walker.camDist = +Q.get('cdist');
  trans = { park: new THREE.Vector3(wx + Math.cos(syaw) * 4.5 - Math.sin(syaw) * 2, walker.pos.y + 0.45, wz - Math.sin(syaw) * 4.5 - Math.cos(syaw) * 2) };
  drone.model.visible = true;
  W.updateTrees(walker.pos, true); W.focusShadow(walker.pos);
  camera.position.set(wx + Math.sin(walker.camYaw) * 6, walker.pos.y + 3, wz + Math.cos(walker.camYaw) * 6);
  enterWalk(p, id);
}
function showObs(p) {
  for (const id in obsObjs) for (const o of obsObjs[id]) o.g.visible = id === p.id && !o.found;
}
function takeoff(after) {
  if (mode !== 'walk') return;
  mode = 'takeoff'; modeT = 0;
  const start = parked ? parked.clone() : walker.pos.clone().add(new THREE.Vector3(0, 1, 0));
  burst(walker.pos.clone().add(new THREE.Vector3(0, 1, 0)), '#9fe7ff', 40, 3, 0.9, 0.6);
  walker.hide();
  $('#note').classList.add('hidden');
  showObs({ id: null });
  trans = { start, end: start.clone().add(new THREE.Vector3(0, 160, 0)), from: camera.position.clone(), after, env: false };
  sfx.takeoff();
  UI.closeModal();
  setActions();
}
function updateTakeoff(dt) {
  const T = trans, k = Math.min(1, modeT / 2.6), e = k * k * (3 - 2 * k);
  drone.pos.lerpVectors(T.start, T.end, e); drone.yaw = walker.yaw; drone.model.scale.setScalar(1.1 + 1.1 * e);
  drone.model.position.copy(drone.pos); drone.model.rotation.set(0, drone.yaw, 0); drone.spinRotors(dt, 70);
  const want = drone.pos.clone().add(new THREE.Vector3(Math.sin(drone.yaw) * 24, 10, Math.cos(drone.yaw) * 24));
  camera.position.lerpVectors(T.from, want, e);
  camera.lookAt(drone.pos);
  if (!T.env && k > 0.35) { T.env = true; envDrone(); }
  if (k >= 1) {
    cur = null; parked = null; mode = 'drone'; modeT = 0; drone.model.scale.setScalar(2.2);
    drone.vel.set(0, 0, 0); drone.camYawOff = 0;
    const after = T.after; trans = null;
    setActions(); refreshHUD();
    if (after) after();
  }
}

// ---------- 관찰 포인트 발견 ----------
function checkObs() {
  if (!cur) return;
  for (const O of obsObjs[cur.id]) {
    if (O.found) continue;
    const d = Math.hypot(walker.pos.x - O.at.x, walker.pos.z - O.at.z);
    if (d < 2.7 && Math.abs(walker.pos.y - O.at.y) < 2.5) foundObs(O);
  }
}
function foundObs(O) {
  O.found = true; O.g.visible = false;
  store.addObs(O.o.site, O.o.s);
  const site = sites[O.o.site];
  const list = obsObjs[cur.id].filter((x) => x.o.site === O.o.site);
  const n = list.filter((x) => x.found).length;
  sfx.obs();
  burst(O.orb.position, '#ffd36b', 60, 5, 1.4, 0.7);
  burst(O.at.clone().add(new THREE.Vector3(0, 0.5, 0)), '#ffffff', 30, 3, 1, 0.5);
  walker.focus = { target: O.look.clone(), t: 0, dur: 3.4 };
  store.addScore(20); UI.popScore(20);
  UI.obsPop(`관찰 포인트 ${n} / ${list.length} · ${UI.shortName(site.name)}`, O.o.name, sentences(site)[O.o.s]);
  if (n === list.length) setTimeout(() => completeSite(O.o.site), 1500);
  refreshHUD(); setActions();
}
function completeSite(id) {
  if (!store.stamp(id)) return;
  const site = sites[id];
  UI.bigStamp(site.name);
  setTimeout(() => { UI.banner('도장 획득!'); UI.confetti(80); }, 500);
  store.addScore(50);
  setTimeout(() => UI.toast(`${UI.shortName(site.name)} 문제가 열렸습니다`, 3200), 1400);
  const L = labels.find((l) => l.id === id);
  if (L) { L.beacon.userData.mat.uniforms.uCol.value.set('#4fd1a5'); L.beacon.userData.ring.material.color.set('#4fd1a5'); }
  setActions(); refreshHUD();
  setTimeout(checkQuest, 2600);
}
// "1392년 그날" 퀘스트
function checkQuest() {
  const q = store.s.quest;
  if (q.done) return;
  if (q.step < QUEST.length && store.hasStamp(QUEST[q.step])) {
    const id = QUEST[q.step], s = sites[id];
    UI.obsPop(`1392년 그날 · 장면 ${q.step + 1}`, UI.shortName(s.name), sentences(s)[QUEST_LINE[id]], 7000);
    q.step++; store.save(); sfx.open();
    if (q.step >= QUEST.length) {
      q.done = true; store.addScore(300); store.save();
      setTimeout(() => {
        UI.obsPop('1392년 그날 · 마지막 장면', '고려에서 조선으로', sentences(sites.kaesong_intro)[2], 9000);
        UI.banner('퀘스트 완료!'); UI.confetti(140); sfx.fanfare(); UI.popScore(300);
      }, 7200);
    } else setTimeout(checkQuest, 7400);
    refreshHUD();
  }
}

// ---------- 카드·문제 ----------
const thumbCache = {};
function renderThumb(id) {
  if (thumbCache[id]) return thumbCache[id];
  const p = PLOT_OF[id];
  if (!p) return null;
  const [mx, mz] = p.marks[id];
  const tgt = new THREE.Vector3(p.x + mx, p.h0 + (p.summit ? 0 : 3), p.z + mz);
  const d = THREE.MathUtils.clamp(p.R * 0.62, 16, 95);
  const tc = new THREE.PerspectiveCamera(48, 1.6, 0.3, 12000);
  const dir = new THREE.Vector3(0.55, 0, 0.85).normalize();
  if (p.summit) { tc.position.copy(tgt).add(new THREE.Vector3(-8, 8, -14)); tc.lookAt(tgt.clone().add(new THREE.Vector3(30, -60, 200))); }
  else { tc.position.copy(tgt).addScaledVector(dir, d).add(new THREE.Vector3(0, d * 0.45, 0)); tc.lookAt(tgt); }
  const prevVis = [];
  for (const k in obsObjs) for (const o of obsObjs[k]) { prevVis.push([o.g, o.g.visible]); o.g.visible = false; }
  const fogD = scene.fog.density; scene.fog.density = 0.00012;
  const lv = labels.map((l) => l.beacon.visible); labels.forEach((l) => (l.beacon.visible = false));
  W.updateTrees(tgt, true); W.focusShadow(tgt);
  const oldBox = W.sun.shadow.camera.right; W.setShadowBox(Math.max(60, d * 1.2), 6000);
  const wv = walker.body.visible; walker.body.visible = !!(cur && cur.id === p.id);
  const w = renderer.domElement.width, h = renderer.domElement.height;
  tc.aspect = w / h; tc.updateProjectionMatrix();
  W.sky.position.copy(tc.position);
  renderer.render(scene, tc);
  const out = document.createElement('canvas'); out.width = 480; out.height = 300;
  const sw = Math.min(w, h * 1.6), sh = sw / 1.6;
  out.getContext('2d').drawImage(renderer.domElement, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, 480, 300);
  const url = out.toDataURL('image/jpeg', 0.85);
  // 되돌리기
  for (const [g, v] of prevVis) g.visible = v;
  labels.forEach((l, i) => (l.beacon.visible = lv[i]));
  scene.fog.density = fogD; walker.body.visible = wv;
  W.setShadowBox(oldBox, 6000);
  W.updateTrees(mode === 'walk' ? walker.pos : focusPoint(), true);
  thumbCache[id] = url;
  return url;
}
function photoFor(id) {
  const list = photos[id];
  if (!list || !list.length) return null;
  const ph = list[0];
  return { ...ph, src: '../shared/' + ph.file };
}
function obsCount(id) {
  const p = PLOT_OF[id]; if (!p) return [0, 0];
  const list = p.obs.filter((o) => o.site === id);
  const f = store.obsFound(id);
  return [list.filter((o) => f.includes(o.s)).length, list.length];
}
function openSiteCard(id) {
  const s = sites[id];
  const [found, total] = obsCount(id);
  const stamped = store.hasStamp(id);
  const canQuiz = stamped || id === 'kaesong_intro';
  const photo = photoFor(id);
  const thumb = photo ? null : (id === 'kaesong_intro' ? renderIntroThumb() : renderThumb(id));
  const btns = [];
  if (id === 'kaesong_intro') { btns.push({ act: 'quiz', label: '문제 풀기' }); btns.push({ act: 'close', label: '자유 비행 시작', cls: 'jade' }); }
  else {
    btns.push({ act: 'quiz', label: canQuiz ? '문제 풀기' : `관찰 포인트를 모두 찾으면 열립니다`, disabled: !canQuiz });
    if (mode === 'drone' || mode === 'title') btns.push({ act: 'go', label: '날아가서 착륙', cls: 'jade' });
  }
  const best = store.s.quiz[id];
  const m = UI.openModal(UI.siteCard(s, { photo, thumb, obsTotal: total, obsFound: found, quizBest: best ?? null, canQuiz, buttons: btns }), () => { UI.closeModal(); });
  sfx.open();
  if (id === 'kaesong_intro' && store.stamp('kaesong_intro')) { setTimeout(() => UI.bigStamp(s.name), 500); store.addScore(50); refreshHUD(); }
  m.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => {
    sfx.click();
    const a = b.dataset.act;
    if (a === 'close') UI.closeModal();
    if (a === 'quiz') openSiteQuiz(id);
    if (a === 'go') landOn(id);
  }));
}
function renderIntroThumb() {
  if (thumbCache.kaesong_intro) return thumbCache.kaesong_intro;
  const tc = new THREE.PerspectiveCamera(50, renderer.domElement.width / renderer.domElement.height, 2, 60000);
  const a = ll2w(37.948, 126.566), b = ll2w(37.99, 126.545);
  tc.position.set(a.x, 900, a.z); tc.lookAt(b.x, 120, b.z);
  const fog = scene.fog.density; scene.fog.density = 0.00004;
  W.sky.position.copy(tc.position);
  const sc = W.sky.scale.x; W.sky.scale.setScalar(50000);
  renderer.render(scene, tc);
  const w = renderer.domElement.width, h = renderer.domElement.height;
  const out = document.createElement('canvas'); out.width = 480; out.height = 300;
  const sw = Math.min(w, h * 1.6), sh = sw / 1.6;
  out.getContext('2d').drawImage(renderer.domElement, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, 480, 300);
  scene.fog.density = fog; W.sky.scale.setScalar(sc);
  return (thumbCache.kaesong_intro = out.toDataURL('image/jpeg', 0.85));
}
function pickQuizzes(s) {
  const pat = { 1: [1, 1, 2], 2: [1, 2, 2], 3: [2, 2, 3] }[store.s.diff];
  const pool = [...s.quizzes]; const out = [];
  for (const lv of pat) {
    const k = pool.findIndex((q) => q.level === lv);
    if (k >= 0) out.push(pool.splice(k, 1)[0]);
  }
  return out;
}
const TIMER = { 1: 0, 2: 30, 3: 15 }, HINTS = { 1: 2, 2: 1, 3: 0 };
async function openSiteQuiz(id, force) {
  const s = sites[id];
  if (!force && !(store.hasStamp(id) || id === 'kaesong_intro')) { UI.toast('관찰 포인트를 모두 찾으면 문제가 열립니다'); return; }
  const r = await UI.runQuiz(pickQuizzes(s), { title: UI.shortName(s.name), timer: TIMER[store.s.diff], hints: HINTS[store.s.diff] });
  const best = store.s.quiz[id] || 0;
  if (r.score > best) { store.addScore(r.score - best); store.s.quiz[id] = r.score; store.save(); }
  const pct = (r.correct / r.total) * 100;
  UI.resultScreen({ heading: `${UI.shortName(s.name)} 문제 결과`, grade: UI.gradeFor(pct), score: r.score, correct: r.correct, total: r.total, record: r.score > best && best > 0 ? '최고 기록 갱신!' : '', buttons: [{ act: 'retry', label: '다시 풀기', cls: 'alt' }, { act: 'ok', label: '계속 답사하기' }] });
  bindResult({ retry: () => openSiteQuiz(id, force), ok: () => UI.closeModal() });
  refreshHUD();
}
function bindResult(map) { document.querySelectorAll('.result [data-act]').forEach((b) => (b.onclick = () => { sfx.click(); map[b.dataset.act] && map[b.dataset.act](); })); }

// ---------- 답사 수첩 ----------
const ORDER = ['kaesong_intro', 'songak', 'manwoldae', 'chomsongdae', 'namdaemun', 'seonjuk', 'pyochung', 'sungyang', 'seonggyun', 'wanggeon', 'gongmin', 'bakyeon', 'panmunjom', 'kaesong_ic'];
const EXAM_NEED = 5;
function openBook() {
  const st = store.s, nStamp = store.stampCount();
  let of = 0, ot = 0;
  for (const p of plots) for (const o of p.obs) { ot++; if (store.obsFound(o.site).includes(o.s)) of++; }
  const examPct = st.examBest ? Math.round(st.examBest.pct) : null;
  const ttl = UI.titleFor(nStamp, examPct);
  const slots = ORDER.map((id) => {
    const s = sites[id], has = store.hasStamp(id);
    const [f, t] = obsCount(id);
    return `<button class="slot" data-id="${id}">${has ? UI.stampHTML(s.name) : '<div class="empty">?</div>'}<div class="nm">${esc(UI.shortName(s.name))}</div><div class="sm">${t ? `관찰 ${f}/${t}` : '시작 연출'}${st.quiz[id] ? ` · ${st.quiz[id]}점` : ''}</div></button>`;
  }).join('');
  const q = st.quest;
  const m = UI.openModal(`<div class="book">
    <button class="x" data-act="close">✕</button>
    <h2>답사 수첩</h2>
    <div class="b-sub">난이도 ${['', '기초', '보통', '도전'][st.diff]} · 도장을 누르면 그 장소의 카드가 열립니다</div>
    <div class="b-title">${esc(ttl)}</div>
    <div class="b-stats">
      <div><b>${nStamp}/14</b><small>도장</small></div>
      <div><b>${ot ? Math.round((of / ot) * 100) : 0}%</b><small>관찰 포인트 ${of}/${ot}</small></div>
      <div><b>${st.score}</b><small>총점</small></div>
      <div><b>${st.examBest ? st.examBest.grade : '-'}</b><small>졸업 시험 최고</small></div>
    </div>
    <div class="grid">${slots}</div>
    <div class="b-sub" style="margin-top:12px">퀘스트 「1392년 그날」: ${q.done ? '완료' : `${q.step}/4 장면`} · 만월대 → 선죽교 → 표충비 → 숭양서원</div>
    <div class="b-btns">
      <button class="btn2" data-act="exam" ${nStamp >= EXAM_NEED ? '' : 'disabled'}>${nStamp >= EXAM_NEED ? '졸업 시험 보기' : `졸업 시험: 도장 ${EXAM_NEED}개부터`}</button>
      <button class="btn2 alt" data-act="diff">난이도 바꾸기</button>
      <button class="btn2 alt" data-act="reset">기록 지우기</button>
    </div>
    <div class="b-src">지형 고도: Mapzen/Tilezen Terrain Tiles(AWS Open Data). 물길은 고도 자료로 계산했습니다. 시가지와 숲의 배치는 색 지도와 지형을 바탕으로 만든 근삿값입니다. 유적 모형은 사진과 자료를 참고해 직접 만든 것으로 실제와 세부가 다를 수 있습니다. 장소 설명·문제: 교사 검토용 초안. 사진은 카드에 작가·라이선스·출처를 표시합니다.</div>
  </div>`, () => UI.closeModal());
  sfx.open();
  m.querySelectorAll('.slot').forEach((b) => (b.onclick = () => { sfx.click(); openSiteCard(b.dataset.id); }));
  m.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => {
    sfx.click();
    const a = b.dataset.act;
    if (a === 'close') UI.closeModal();
    if (a === 'exam') runExam();
    if (a === 'diff') { store.s.diff = (store.s.diff % 3) + 1; store.save(); openBook(); UI.toast(`난이도: ${['', '기초', '보통', '도전'][store.s.diff]}`); applyDiff(); }
    if (a === 'reset') { if (confirm('답사 기록을 모두 지울까요?')) { store.reset(); location.reload(); } }
  }));
}
function examQuestions() {
  const g = data.general;
  const by = (lv) => g.filter((q) => q.level === lv).sort(() => Math.random() - 0.5);
  const plan = { 1: [[1, 5], [2, 3]], 2: [[1, 2], [2, 6], [3, 2]], 3: [[1, 2], [2, 6], [3, 4]] }[store.s.diff];
  return plan.flatMap(([lv, n]) => by(lv).slice(0, n));
}
async function runExam(force) {
  if (!force && store.stampCount() < EXAM_NEED) { UI.toast(`도장 ${EXAM_NEED}개를 모으면 졸업 시험이 열립니다`); return; }
  UI.banner('졸업 시험');
  const r = await UI.runQuiz(examQuestions(), { title: '졸업 시험', timer: { 1: 40, 2: 25, 3: 15 }[store.s.diff], hints: { 1: 2, 2: 1, 3: 0 }[store.s.diff] });
  showExamResult(r);
}
function showExamResult(r, demo) {
  const pct = (r.correct / r.total) * 100, grade = UI.gradeFor(pct);
  const prev = store.s.examBest;
  let record = '';
  if (!demo) {
    store.s.examLast = { pct, grade, score: r.score };
    if (!prev || r.score > prev.score) { store.s.examBest = { pct, grade, score: r.score }; record = prev ? '최고 기록 갱신!' : '첫 기록!'; }
    store.addScore(Math.max(0, r.score - (prev ? prev.score : 0)));
  } else record = '최고 기록 갱신!';
  const ttl = UI.titleFor(store.stampCount(), Math.round(Math.max(pct, prev ? prev.pct : 0)));
  UI.resultScreen({ heading: '개성 답사 졸업 시험', grade, score: r.score, correct: r.correct, total: r.total, title: ttl, record, buttons: [{ act: 'retry', label: '다시 도전', cls: 'alt' }, { act: 'book', label: '답사 수첩' }, { act: 'ok', label: '닫기', cls: 'jade' }] });
  bindResult({ retry: () => runExam(true), book: openBook, ok: () => UI.closeModal() });
  refreshHUD();
}
function applyDiff() { if (cur) showObs(cur); }

// ---------- HUD ----------
function setActions() {
  const a = $('#actions'); const tb = $('#tbtns');
  let html = '', touch = '';
  if (mode === 'drone') {
    const near = nearestLabel(480);
    if (near && !TOUCH) html += `<button class="act pulse" data-act="land">착륙: ${esc(UI.shortName(sites[near.id].name))} <small>(E)</small></button>`;
    touch = `<button data-t="up">상승</button><button data-t="down">하강</button><button data-t="boost">빠르게</button>${near ? '<button data-t="land" class="on">착륙</button>' : '<button data-t="book">수첩</button>'}`;
    $('#keys').innerHTML = '<kbd>W</kbd><kbd>S</kbd> 앞뒤 · <kbd>A</kbd><kbd>D</kbd> 회전 · <kbd>Z</kbd><kbd>X</kbd> 옆 · <kbd>Space</kbd>/<kbd>C</kbd> 위아래 · <kbd>Shift</kbd> 빠르게 · 끌어서 둘러보기 · 빛기둥 이름을 누르면 착륙';
  } else if (mode === 'walk') {
    for (const id of cur.members) {
      if (store.hasStamp(id)) html += `<button class="act ${store.s.quiz[id] ? '' : 'pulse'}" data-act="quiz" data-id="${id}">문제 풀기: ${esc(UI.shortName(sites[id].name))}</button>`;
    }
    if (!TOUCH) {
      html += `<button class="act jade" data-act="card" data-id="${cur.members[0]}">카드 보기 <small>(C)</small></button>`;
      html += '<button class="act sky" data-act="takeoff">이륙 <small>(F)</small></button>';
    }
    touch = '<button data-t="jump">점프</button><button data-t="run">달리기</button><button data-t="takeoff">이륙</button><button data-t="card">카드</button>';
    $('#keys').innerHTML = '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 이동 · <kbd>Shift</kbd> 달리기 · <kbd>Space</kbd> 점프 · 끌어서 시점 · 휠 확대 · <kbd>F</kbd> 이륙 · <kbd>N</kbd> 수첩';
  } else { $('#keys').innerHTML = ''; }
  a.innerHTML = html; tb.innerHTML = touch;
  a.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => {
    sfx.click(); const act = b.dataset.act;
    if (act === 'land') { const n = nearestLabel(480); if (n) landOn(n.id); }
    if (act === 'quiz') openSiteQuiz(b.dataset.id);
    if (act === 'card') openSiteCard(b.dataset.id);
    if (act === 'takeoff') takeoff();
  }));
  bindTouchButtons();
  setActions.key = actionKey();
}
function actionKey() {
  if (mode === 'drone') { const n = nearestLabel(480); return 'd' + (n ? n.id : ''); }
  if (mode === 'walk') return 'w' + cur.id + cur.members.map((m) => (store.hasStamp(m) ? 1 : 0) + (store.s.quiz[m] ? 2 : 0)).join('');
  return mode;
}
function nearestLabel(maxD) {
  let best = null, bd = maxD;
  for (const L of labels) { const d = Math.hypot(drone.pos.x - L.pos.x, drone.pos.z - L.pos.z); if (d < bd) { bd = d; best = L; } }
  return best;
}
function refreshHUD() {
  $('#score').textContent = store.s.score;
  $('#stamp-count').textContent = store.stampCount();
  const q = store.s.quest;
  const next = !q.done && QUEST[q.step];
  $('#quest').innerHTML = `<h4>퀘스트 · 1392년 그날</h4>` + (q.done ? '<div class="q-step">완료했습니다. 고려에서 조선으로 넘어가는 이야기를 모두 따라갔습니다.</div>' :
    `<div class="q-step">다음 장소: ${esc(UI.shortName(sites[next].name))}</div><div class="q-hint" style="color:var(--muted);font-size:12px">관찰 포인트를 모두 찾아 도장을 받으면 다음 장면이 열립니다</div>`) +
    `<div class="q-dots">${QUEST.map((_, i) => `<i class="${i < q.step ? 'on' : ''}"></i>`).join('')}</div>`;
  if (mode === 'walk' && cur) {
    $('#where-mode').textContent = '걷기';
    $('#where-name').textContent = cur.members.map((m) => UI.shortName(sites[m].name)).join(' · ');
  } else { $('#where-mode').textContent = '드론'; $('#where-name').textContent = '개성 상공'; }
}
let hudT = 0;
function updateHUD(dt) {
  hudT -= dt; if (hudT > 0) return; hudT = 0.2;
  const st = $('#status');
  if (mode === 'drone' || mode === 'auto') {
    const agl = drone.pos.y - W.grid.heightAt(drone.pos.x, drone.pos.z);
    const sp = drone.vel.length() * 3.6;
    st.innerHTML = `<div class="row"><div><div style="font-size:11px;color:var(--muted)">고도(지면 위)</div><div class="bignum">${Math.round(agl)}m</div></div><div><div style="font-size:11px;color:var(--muted)">속도</div><div class="bignum">${Math.round(sp)}km/h</div></div></div><div style="font-size:12px;color:var(--muted);margin-top:4px">해발 ${Math.round(drone.pos.y / 1.2)}m · 지형 고도 1.2배</div>`;
  } else if (mode === 'walk' && cur) {
    const groups = cur.members.map((id) => {
      const os = obsObjs[cur.id].filter((o) => o.o.site === id);
      const f = os.filter((o) => o.found).length;
      return `<div style="margin-top:4px"><b>${esc(UI.shortName(sites[id].name))}</b> 관찰 ${f}/${os.length} ${store.hasStamp(id) ? '· <span style="color:var(--jade)">도장 받음</span>' : ''}<div class="bar"><i style="width:${(f / os.length) * 100}%"></i></div></div>`;
    }).join('');
    st.innerHTML = groups;
  }
  if (actionKey() !== setActions.key) setActions();
}

// ---------- 미니맵 ----------
const mm = $('#minimap'), mctx = mm.getContext('2d');
function drawMinimap() {
  const w = mm.width, h = mm.height;
  mctx.clearRect(0, 0, w, h);
  if (mode === 'walk' && cur) {
    const b = built[cur.id]; const R = cur.R + 24;
    const s = Math.min(w, h) / (2 * R);
    mctx.fillStyle = '#1c2a1c'; mctx.fillRect(0, 0, w, h);
    if (b.disc) {
      if (!b.mini) { const c = document.createElement('canvas'); c.width = c.height = 256; c.getContext('2d').drawImage(b.disc.material.map.image, 0, 0, 256, 256); b.mini = c; }
      mctx.drawImage(b.mini, w / 2 - R * s, h / 2 - R * s, 2 * R * s, 2 * R * s);
    }
    const tx = (x) => w / 2 + (x - cur.x) * s, tz = (z) => h / 2 + (z - cur.z) * s;
    if (store.s.diff < 3) for (const O of obsObjs[cur.id]) {
      mctx.beginPath(); mctx.arc(tx(O.at.x), tz(O.at.z), 4, 0, 6.28);
      mctx.fillStyle = O.found ? '#4fd1a5' : '#ffc247'; mctx.fill(); mctx.strokeStyle = '#000'; mctx.stroke();
    }
    arrow(tx(walker.pos.x), tz(walker.pos.z), walker.yaw, '#fff');
  } else if (W) {
    if (!drawMinimap.bg) { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(W.colormapTex.image, 0, 0, w, h); drawMinimap.bg = c; }
    mctx.drawImage(drawMinimap.bg, 0, 0);
    const tx = (x) => (x / WORLD_W + 0.5) * w, tz = (z) => (z / WORLD_H + 0.5) * h;
    for (const L of labels) {
      mctx.beginPath(); mctx.arc(tx(L.pos.x), tz(L.pos.z), 4, 0, 6.28);
      mctx.fillStyle = store.hasStamp(L.id) ? '#4fd1a5' : '#ffc247'; mctx.fill(); mctx.strokeStyle = '#000'; mctx.stroke();
    }
    arrow(tx(drone.pos.x), tz(drone.pos.z), drone.yaw, '#fff');
  }
}
function arrow(x, y, yaw, col) {
  mctx.save(); mctx.translate(x, y); mctx.rotate(-yaw);
  mctx.beginPath(); mctx.moveTo(0, -8); mctx.lineTo(5, 6); mctx.lineTo(0, 3); mctx.lineTo(-5, 6); mctx.closePath();
  mctx.fillStyle = col; mctx.fill(); mctx.strokeStyle = '#000'; mctx.lineWidth = 1.5; mctx.stroke(); mctx.restore();
}
mm.addEventListener('click', (e) => {
  if (mode !== 'drone') return;
  const r = mm.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * mm.width, y = (e.clientY - r.top) / r.height * mm.height;
  let best = null, bd = 14;
  for (const L of labels) { const d = Math.hypot((L.pos.x / WORLD_W + 0.5) * mm.width - x, (L.pos.z / WORLD_H + 0.5) * mm.height - y); if (d < bd) { bd = d; best = L; } }
  if (best) { sfx.click(); landOn(best.id); }
});

// ---------- 라벨·방향 표시 ----------
const v3 = new THREE.Vector3();
function updateLabels() {
  const showAll = mode === 'drone' || mode === 'auto';
  const summit = mode === 'walk' && cur && cur.summit;
  for (const L of labels) {
    let vis = (showAll || L.introShow || summit) && !(summit && L.id === 'songak');
    L.beacon.visible = mode !== 'walk' && mode !== 'landing';
    L.beacon.userData.mat.uniforms.uTime.value = clockT;
    if (!vis) { L.el.style.display = 'none'; continue; }
    v3.copy(L.pos); v3.y += mode === 'intro' ? 60 : summit ? 30 : 140;
    const d = camera.position.distanceTo(v3);
    v3.project(camera);
    if (v3.z > 1 || Math.abs(v3.x) > 1.1 || Math.abs(v3.y) > 1.1 || d > 17000) { L.el.style.display = 'none'; continue; }
    L.el.style.display = 'flex';
    L.el.style.left = ((v3.x + 1) / 2) * innerWidth + 'px';
    L.el.style.top = ((1 - v3.y) / 2) * innerHeight + 'px';
    L.el.style.opacity = d > 9000 ? 0.65 : 1;
    L.el.style.zIndex = String(Math.round(20000 - d));
    L.el.classList.toggle('done', store.hasStamp(L.id));
    L.el.classList.toggle('quest', !store.s.quest.done && QUEST[store.s.quest.step] === L.id);
    L.el.classList.toggle('passive', mode === 'intro' || summit);
    L.el.querySelector('.dist').textContent = d > 1000 ? (d / 1000).toFixed(1) + 'km' : Math.round(d) + 'm';
  }
  // 방향 표시: 걷기(기초)는 가장 가까운 관찰 포인트, 드론은 퀘스트 다음 장소
  const pt = $('#pointer');
  let target = null, txt = '';
  if (mode === 'walk' && cur && store.s.diff === 1) {
    let bd = 1e9;
    for (const O of obsObjs[cur.id]) if (!O.found) { const d = Math.hypot(O.at.x - walker.pos.x, O.at.z - walker.pos.z); if (d < bd) { bd = d; target = O.at; txt = `${O.o.name} ${Math.round(d)}m`; } }
  } else if (mode === 'drone' && !store.s.quest.done) {
    const L = labels.find((l) => l.id === QUEST[store.s.quest.step]);
    if (L) { target = L.pos; txt = `퀘스트: ${UI.shortName(sites[L.id].name)} ${(Math.hypot(L.pos.x - drone.pos.x, L.pos.z - drone.pos.z) / 1000).toFixed(1)}km`; }
  }
  if (target) {
    const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
    const a1 = Math.atan2(fwd.x, -fwd.z), a2 = Math.atan2(target.x - camera.position.x, -(target.z - camera.position.z));
    pt.style.display = 'block'; pt.style.top = TOUCH ? '128px' : '118px';
    pt.querySelector('.arrow').style.transform = `rotate(${a2 - a1}rad)`;
    $('#pointer-txt').textContent = txt;
  } else pt.style.display = 'none';
}

// ---------- 입력 ----------
function wireUI() {
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === 'escape') { if (UI.modalOpen()) UI.closeModal(); return; }
    if (UI.modalOpen()) return;
    keys.add(k); unlock();
    if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
    if (k === 'n') openBook();
    if (mode === 'walk') {
      if (k === 'f') takeoff();
      if (k === 'c') openSiteCard(cur.members[0]);
      if (k === 'q') { const id = cur.members.find((m) => store.hasStamp(m)); if (id) openSiteQuiz(id); }
    }
    if (mode === 'drone' && k === 'e' && !e.repeat) { const n = nearestLabel(480); if (n) landOn(n.id); }
  });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());
  // 끌어서 시점 돌리기
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); unlock(); });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
    inp.dragging = true;
    if (mode === 'walk') { walker.camYaw -= dx * 0.006; walker.camPitch = THREE.MathUtils.clamp(walker.camPitch + dy * 0.004, -0.15, 1.25); }
    if (mode === 'drone' || mode === 'auto') { drone.camYawOff -= dx * 0.005; drone.camPitch = THREE.MathUtils.clamp(drone.camPitch - dy * 0.003, -1.2, 0.25); }
  });
  const end = (e) => { if (drag && drag.id === e.pointerId) { drag = null; inp.dragging = false; } };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (mode === 'walk') walker.camDist = THREE.MathUtils.clamp(walker.camDist * (1 + Math.sign(e.deltaY) * 0.1), 2.2, 16);
    if (mode === 'drone') drone.camDist = THREE.MathUtils.clamp(drone.camDist * (1 + Math.sign(e.deltaY) * 0.1), 10, 90);
  }, { passive: false });
  // 가상 조이스틱
  const stick = $('#stick'), knob = $('#knob');
  let sid = null, sc = null;
  stick.addEventListener('pointerdown', (e) => { sid = e.pointerId; const r = stick.getBoundingClientRect(); sc = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; stick.setPointerCapture(e.pointerId); moveStick(e); unlock(); });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === sid) moveStick(e); });
  const stickEnd = (e) => { if (e.pointerId !== sid) return; sid = null; touchStick.x = touchStick.y = 0; knob.style.transform = ''; };
  stick.addEventListener('pointerup', stickEnd); stick.addEventListener('pointercancel', stickEnd);
  function moveStick(e) {
    let dx = (e.clientX - sc.x) / 50, dy = (e.clientY - sc.y) / 50; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    touchStick.x = dx; touchStick.y = dy; knob.style.transform = `translate(${dx * 38}px, ${dy * 38}px)`;
  }
  // 상단 버튼
  $('#btn-book').onclick = () => { sfx.click(); openBook(); };
  const sb = $('#btn-sound'); sb.textContent = isMuted() ? '🔇' : '🔊';
  sb.onclick = () => { setMuted(!isMuted()); sb.textContent = isMuted() ? '🔇' : '🔊'; unlock(); sfx.click(); };
  // 타이틀
  document.querySelectorAll('#diff button').forEach((b) => (b.onclick = () => { store.s.diff = +b.dataset.d; store.save(); unlock(); sfx.click(); showTitle(); }));
  $('#btn-start').onclick = () => { unlock(); sfx.click(); startIntro(); };
  $('#btn-skip').onclick = () => { unlock(); sfx.click(); startDrone(); };
  $('#btn-title-book').onclick = () => { unlock(); sfx.click(); openBook(); };
}
const touchStick = { x: 0, y: 0 };
const touchHeld = new Set();
function bindTouchButtons() {
  document.querySelectorAll('#tbtns button').forEach((b) => {
    const t = b.dataset.t;
    b.onpointerdown = (e) => {
      e.preventDefault(); unlock();
      if (t === 'land') { const n = nearestLabel(480); if (n) landOn(n.id); return; }
      if (t === 'takeoff') { takeoff(); return; }
      if (t === 'book') { openBook(); return; }
      if (t === 'card') { openSiteCard(cur.members[0]); return; }
      if (t === 'run' || t === 'boost') { if (touchHeld.has('run')) touchHeld.delete('run'); else touchHeld.add('run'); b.classList.toggle('on', touchHeld.has('run')); return; }
      touchHeld.add(t);
    };
    b.onpointerup = b.onpointerleave = () => { if (t !== 'run' && t !== 'boost') touchHeld.delete(t); };
  });
}
function readInput() {
  const k = (c) => keys.has(c);
  const fwd = (k('w') || k('arrowup') ? 1 : 0) - (k('s') || k('arrowdown') ? 1 : 0);
  const side = (k('d') || k('arrowright') ? 1 : 0) - (k('a') || k('arrowleft') ? 1 : 0);
  inp.run = k('shift') || touchHeld.has('run');
  if (mode === 'walk') {
    inp.mx = side + touchStick.x; inp.mz = fwd - touchStick.y;
    inp.jump = k(' ') || touchHeld.has('jump');
    touchHeld.delete('jump');
  } else {
    inp.mz = fwd - touchStick.y; inp.turn = side + touchStick.x;
    inp.strafe = (k('x') ? 1 : 0) - (k('z') ? 1 : 0);
    inp.up = (k(' ') || k('r') || touchHeld.has('up') ? 1 : 0) - (k('c') || k('control') || touchHeld.has('down') ? 1 : 0);
    inp.mx = 0;
  }
}
inp.onJump = () => sfx.jump();

// ---------- 루프 ----------
const clock = new THREE.Clock();
function focusPoint() {
  if (mode === 'walk') return walker.pos;
  const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
  const p = camera.position.clone().addScaledVector(fwd, Math.min(1500, camera.position.y * 1.5));
  p.y = 0; return p;
}
// 화면이 느리면 화질을 자동으로 낮춘다(학교 컴퓨터 대응)
const perf = { t: 0, n: 0, level: 0 };
function autoQuality(dt) {
  if (Q.has('tick') || mode === 'loading' || mode === 'title' || UI.modalOpen()) return;
  perf.t += dt; perf.n++;
  if (perf.t < 3) return;
  const fps = perf.n / perf.t; perf.t = 0; perf.n = 0;
  if (fps > 32 || perf.level >= 3) return;
  perf.level++;
  if (perf.level === 1) renderer.setPixelRatio(1);
  if (perf.level === 2) { W.sun.castShadow = false; for (const t of W.treeMeshes) { t.trunk.castShadow = t.crown.castShadow = false; } }
  if (perf.level === 3) { W.lowTrees = true; W.setTreeRadius(mode === 'walk' ? 900 : 1800); }
  if (DEBUG) UI.toast(`화질 조정 ${perf.level}단계 (${Math.round(fps)}fps)`);
}
function loop() {
  const dt = Math.min(0.05, clock.getDelta());
  autoQuality(dt);
  clockT += dt; modeT += dt;
  if (!UI.modalOpen()) readInput(); else { inp.mx = inp.mz = inp.turn = inp.up = inp.strafe = 0; inp.jump = false; }
  W.update(dt, clockT); animateWater(clockT);
  for (const a of anims) a(dt, clockT);
  if (mode === 'title') {
    const c = ll2w(37.982, 126.55), a = clockT * 0.035;
    camera.position.set(c.x + Math.sin(a) * 5200, 1500, c.z + Math.cos(a) * 5200);
    camera.lookAt(c.x, 150, c.z);
  } else if (mode === 'intro') updateIntro(dt);
  else if (mode === 'drone' || mode === 'auto') { drone.update(dt, inp, camera); droneHum(true, Math.min(1, drone.vel.length() / 200)); }
  else if (mode === 'landing') { updateLanding(dt); droneHum(true, 0.1); }
  else if (mode === 'takeoff') { updateTakeoff(dt); droneHum(true, 0.4); }
  else if (mode === 'walk') {
    droneHum(false);
    walker.update(dt, inp, camera, () => sfx.step(), () => { if (!loop.edgeT || clockT - loop.edgeT > 3) { loop.edgeT = clockT; UI.toast('부지 끝입니다. 다른 장소는 이륙(F)해서 날아갑니다'); } });
    checkObs();
    if (parked) { drone.model.position.copy(parked); drone.spinRotors(dt, 2); }
    // 관찰 포인트 깜박임, 도전 난이도는 가까이 가야 보임
    for (const O of obsObjs[cur.id]) {
      if (O.found) continue;
      const near = Math.hypot(O.at.x - walker.pos.x, O.at.z - walker.pos.z);
      const vis = store.s.diff < 3 || near < 16;
      O.g.visible = vis;
      const s = 1 + Math.sin(clockT * 4 + O.i) * 0.15;
      O.orb.scale.setScalar((O.orb.position.distanceTo(O.at) > 60 ? 1.4 : 1.6) * s);
      O.ring.scale.setScalar(1 + ((clockT * 0.8 + O.i * 0.3) % 1) * 0.6);
      O.ring.material.opacity = 0.9 - ((clockT * 0.8 + O.i * 0.3) % 1) * 0.7;
      const cd = Math.hypot(camera.position.x - O.at.x, camera.position.z - O.at.z);
      O.beam.material.opacity = THREE.MathUtils.clamp((cd - 1.5) / 6, 0, 1) * 0.3;
    }
  }
  if (mode === 'title' || mode === 'intro') droneHum(false);
  // 숲·그림자·하늘을 시점에 맞춤
  if (mode !== 'loading') {
    const fp = focusPoint();
    W.updateTrees(fp);
    W.focusShadow(mode === 'walk' ? walker.pos : (mode === 'drone' || mode === 'auto') ? new THREE.Vector3(drone.pos.x, W.grid.heightAt(drone.pos.x, drone.pos.z), drone.pos.z) : fp);
    W.sky.position.copy(camera.position);
    // 멀리 있는 부지는 숨김
    for (const p of plots) built[p.id].group.visible = Math.hypot(p.x - camera.position.x, p.z - camera.position.z) < (mode === 'walk' ? 4000 : 9000);
  }
  updateBursts(dt);
  updateLabels();
  if (mode === 'drone' || mode === 'walk' || mode === 'auto') { updateHUD(dt); drawMinimap(); }
  renderer.render(scene, camera);
}

if (DEBUG) setInterval(() => { document.title = `[${mode}] t=${modeT.toFixed(1)} drone=${drone ? drone.pos.toArray().map(Math.round) : ''} auto=${drone && !!drone.auto} trees=${W && W.treeCount} town=${W && W.town.count} calls=${renderer.info.render.calls} tris=${renderer.info.render.triangles}`; }, 250);
window.__kaesong = { get mode() { return mode; }, scene, camera, get W() { return W; }, get walker() { return walker; }, get drone() { return drone; }, store };
boot().catch((e) => { console.error(e); $('#ld-text').textContent = '불러오기에 실패했습니다: ' + e.message; });
