// 북녘 탐험대 v1 · 하늘길 탐험대: 시작·화면 전환·카메라·입력
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadHeights, loadContent, lonLatToWorld, WORLD_W, WORLD_H } from '../../shared/geo.js';
import { createWorld, makeBeacon } from './world.js';
import { Plane } from './plane.js';
import { LabelLayer } from './labels.js';
import { createExplore } from './explore.js';
import { createGuess } from './guess.js';
import { MISSIONS, FREE_FLIGHT, BADGES, LEVELS, eraMatch, eraColor } from './data.js';
import { sfx, unlockAudio, setMuted, isMuted, engineStop } from './audio.js';
import { store, visitedCount, solvedCount } from './store.js';
import {
  $, $$, esc, fmt, showScreen, showHud, openModal, closeModal, anyModalOpen, toast, banner, shakeState,
  initFx, fxUpdate, burst, sparkle, itemCardHTML, flipIn, countUp, ICONS, fameStars,
} from './ui.js';

const BASE = '../shared/data';
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');

if (DEBUG) {
  const show = (m) => { const e = $('#err'); e.style.display = 'block'; e.textContent += m + '\n'; };
  window.addEventListener('error', (e) => show('오류: ' + e.message));
  window.addEventListener('unhandledrejection', (e) => show('오류: ' + (e.reason && e.reason.message || e.reason)));
}

const coarse = matchMedia('(pointer: coarse)').matches;
const LOW = params.has('low') || (coarse && Math.min(screen.width, screen.height) < 820) || (navigator.deviceMemory && navigator.deviceMemory < 4);

const G = { params, base: BASE, WORLD_W, WORLD_H, paused: false, state: 'loading', low: LOW };
window.__NQ = G;

function setLoad(k, msg) {
  $('#load-bar').style.width = Math.round(k * 100) + '%';
  if (msg) $('#load-msg').textContent = msg;
}

async function boot() {
  initFx();
  setLoad(0.08, '지도 정보를 불러오는 중입니다');
  const renderer = new THREE.WebGLRenderer({ canvas: $('#gl'), antialias: !LOW, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, LOW ? 1.25 : 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.3, 4000);
  Object.assign(G, { renderer, scene, camera });

  const [content, heights] = await Promise.all([
    loadContent(BASE),
    loadHeights(BASE, LOW ? '384x387' : '768x775'),
  ]);
  setLoad(0.45, '3D 지형을 만드는 중입니다');
  await new Promise((r) => setTimeout(r, 30));
  G.content = content;
  G.sites = content.sites;
  G.siteById = Object.fromEntries(content.sites.map((s) => [s.id, s]));
  const world = await createWorld({ scene, renderer, heights, content, low: LOW, base: BASE });
  G.world = world;
  setLoad(0.8, '탐사 비행기를 준비하는 중입니다');

  G.plane = new Plane(scene, world);
  G.labels = new LabelLayer($('#labels'));
  G.softTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();

  // 카메라 조작(위치 맞히기·지도 보기)
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = false;
  controls.minDistance = 18;
  controls.maxDistance = 1100;
  controls.maxPolarAngle = 1.25;
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
  controls.enabled = false;
  G.controls = controls;

  buildLabels();
  G.explore = createExplore(G);
  G.guess = createGuess(G);
  setupInput();
  setupMenus();
  addEventListener('resize', onResize);
  onResize();

  // 타이틀 시작 위치(함흥 앞바다와 산지 위를 선회)
  const c = lonLatToWorld(127.25, 40.15);
  G.attractCenter = new THREE.Vector3(c.x, 0, c.z);
  G.plane.place(c.x + 48, c.z, 0, 8);
  setLoad(1, '준비 완료');
  G.camMode = 'attract';
  camera.position.set(c.x - 70, 75, c.z + 120);
  G.camLook = new THREE.Vector3(c.x, 0, c.z);
  G.camBase = camera.position.clone();
  G.introT = 0;

  requestAnimationFrame(frame);
  setTimeout(() => {
    $('#scr-loading').classList.add('fade');
    goTitle(true);
    routeDebug();
  }, 250);
}

// ---------- 라벨 ----------
function buildLabels() {
  const L = G.labels, W = G.world;
  G.siteLabels = new Map();
  for (const s of G.sites) {
    const y = W.floorAt(s.x, s.z) + (s.cluster ? 4.6 : 7.6);
    const it = L.add(`<span class="ln">${esc(s.name)}</span>${s.country === 'CHN' ? '<em>지금은 중국 땅</em>' : ''}`,
      new THREE.Vector3(s.x, y, s.z), { cls: `lbl-site ${s.type} ${s.country === 'CHN' ? 'chn' : ''} ${s.cluster ? 'cl' : ''}`, maxDist: s.cluster ? 60 : 160, group: 'site', data: s });
    G.siteLabels.set(s.id, it);
  }
  for (const p of G.content.geo.provinces) {
    const w = lonLatToWorld(p.label_lon, p.label_lat);
    L.add(esc(p.name_dprk), new THREE.Vector3(w.x, W.floorAt(w.x, w.z) + 14, w.z), { cls: 'lbl-prov', maxDist: 1400, minDist: 25, group: 'prov' });
  }
  const geoL = [
    ['중국', 125.2, 42.3], ['러시아', 130.85, 42.75], ['대한민국', 127.6, 37.62], ['동해', 130.0, 39.6], ['서해', 124.05, 38.5],
  ];
  for (const [n, lo, la] of geoL) {
    const w = lonLatToWorld(lo, la);
    L.add(n, new THREE.Vector3(w.x, W.floorAt(w.x, w.z) + 10, w.z), { cls: 'lbl-geo', maxDist: 1600, minDist: 30, group: 'geo' });
  }
  G.labelMode = { sites: 'none', prov: false, provLines: false };
  L.setGroupVisible('site', false);
  L.setGroupVisible('prov', false);
}

G.setLabelMode = (m) => {
  G.labelMode = m;
  const L = G.labels;
  L.setGroupVisible('site', m.sites !== 'none');
  for (const it of G.siteLabels.values()) {
    const s = it.data;
    it.maxDist = m.sites === 'near' ? (s.cluster ? 40 : 70) : (s.cluster ? 60 : 160);
    it.visible = m.sites === 'visited' ? !!store.visited[s.id] : true;
  }
  L.setGroupVisible('prov', !!m.prov);
  L.setGroupVisible('geo', m.geo !== false);
  for (const it of L.items) if (it.group === 'prov' || it.group === 'geo') it.maxDist = G.state === 'guess' ? 1600 : 210;
  G.world.provLines.visible = !!m.provLines;
};

G.refreshSiteLabel = (id) => {
  const it = G.siteLabels.get(id);
  if (it && G.labelMode.sites === 'visited') it.visible = !!store.visited[id];
};

G.toScreen = (v) => {
  const p = v.clone().project(G.camera);
  return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight };
};

// ---------- 카메라 ----------
const tw = { on: false };
G.tweenCam = (pos, look, dur, after) => {
  G.controls.enabled = false;
  Object.assign(tw, {
    on: true, t: 0, dur, after,
    p0: G.camBase.clone(), l0: G.camLook.clone(), p1: pos, l1: look,
  });
};

G.setCamMode = (mode, snap) => {
  G.camMode = mode;
  tw.on = false;
  G.controls.enabled = mode === 'orbit';
  if (mode === 'orbit') G.controls.target.copy(G.camLook);
  if (mode === 'chase' && snap) {
    const p = G.plane, f = p.forward(new THREE.Vector3());
    G.camBase.copy(p.pos).addScaledVector(f, -11).add(new THREE.Vector3(0, 4, 0));
    G.camLook.copy(p.pos).addScaledVector(f, 6);
  }
};

const vA = new THREE.Vector3(), vB = new THREE.Vector3(), vF = new THREE.Vector3();
function updateCamera(dt, t) {
  const cam = G.camera, P = G.plane, W = G.world;
  if (tw.on) {
    tw.t += dt / tw.dur;
    const k = tw.t >= 1 ? 1 : 1 - Math.pow(1 - tw.t, 3);
    const p1 = typeof tw.p1 === 'function' ? tw.p1() : tw.p1;
    const l1 = typeof tw.l1 === 'function' ? tw.l1() : tw.l1;
    G.camBase.lerpVectors(tw.p0, p1, k);
    G.camLook.lerpVectors(tw.l0, l1, k);
    if (tw.t >= 1) {
      tw.on = false;
      G.camMode = tw.after || G.camMode;
      G.controls.enabled = G.camMode === 'orbit';
      if (G.camMode === 'orbit') G.controls.target.copy(G.camLook);
    }
  } else if (G.camMode === 'attract') {
    const a = P.yaw + 0.9 + Math.sin(t * 0.11) * 0.7;
    const dist = 13 + Math.sin(t * 0.07) * 3;
    vA.set(P.pos.x + Math.sin(a) * dist, P.pos.y + 3.2 + Math.sin(t * 0.09) * 1.5, P.pos.z + Math.cos(a) * dist);
    G.introT = Math.min(1, G.introT + dt / 3.2);
    const k = G.introT < 1 ? 1 - Math.exp(-dt * (0.6 + G.introT * 3)) : 1 - Math.exp(-dt * 3);
    G.camBase.lerp(vA, k);
    G.camLook.lerp(P.pos, k * 1.5 > 1 ? 1 : k * 1.5);
  } else if (G.camMode === 'chase') {
    const f = P.forward(vF);
    const back = 11 + (P.boosting ? 2.5 : 0);
    vA.copy(P.pos).addScaledVector(f, -back);
    vA.y = P.pos.y + 3.8 - P.vy * 0.08;
    const g = W.floorAt(vA.x, vA.z) + 1.5;
    if (vA.y < g) vA.y = g;
    G.camBase.lerp(vA, 1 - Math.exp(-dt * 4.5));
    vB.copy(P.pos).addScaledVector(f, 7); vB.y += 1;
    G.camLook.lerp(vB, 1 - Math.exp(-dt * 8));
    const fovT = P.boosting ? 74 : 62;
    cam.fov += (fovT - cam.fov) * (1 - Math.exp(-dt * 3));
    cam.updateProjectionMatrix();
  } else if (G.camMode === 'orbit') {
    G.controls.update();
    const tg = G.controls.target;
    tg.x = THREE.MathUtils.clamp(tg.x, -WORLD_W / 2, WORLD_W / 2);
    tg.z = THREE.MathUtils.clamp(tg.z, -WORLD_H / 2, WORLD_H / 2);
    G.camBase.copy(cam.position);
    G.camLook.copy(tg);
    const g = W.floorAt(cam.position.x, cam.position.z) + 3;
    if (cam.position.y < g) cam.position.y = g;
    G.camBase.copy(cam.position);
  }
  if (G.camMode !== 'chase' && Math.abs(cam.fov - 55) > 0.1 && !G.titleFov) {
    cam.fov += (55 - cam.fov) * (1 - Math.exp(-dt * 3));
    cam.updateProjectionMatrix();
  }
  if (G.camMode !== 'orbit' || tw.on) {
    cam.position.copy(G.camBase);
    if (shakeState.mag > 0.01) {
      cam.position.x += (Math.random() - 0.5) * shakeState.mag;
      cam.position.y += (Math.random() - 0.5) * shakeState.mag;
      cam.position.z += (Math.random() - 0.5) * shakeState.mag;
    }
    cam.lookAt(G.camLook);
  }
  shakeState.mag *= Math.exp(-dt * 6);
}

// ---------- 입력 ----------
const keys = new Set();
const joy = { x: 0, y: 0, active: false };
let boostBtn = false;
function setupInput() {
  addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key) && G.state === 'explore' && !anyModalOpen()) e.preventDefault();
    keys.add(e.code);
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (G.state === 'explore' || G.state === 'guess') { if (!anyModalOpen()) openPause(); }
    }
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  const pad = $('#joy'), knob = $('#joy .joy-knob');
  let pid = null;
  const move = (e) => {
    const r = pad.getBoundingClientRect();
    const R = r.width / 2;
    let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R);
    const L = Math.hypot(dx, dy);
    if (L > R) { dx *= R / L; dy *= R / L; }
    joy.x = dx / R; joy.y = dy / R;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  pad.addEventListener('pointerdown', (e) => { pid = e.pointerId; pad.setPointerCapture(pid); joy.active = true; move(e); unlockAudio(); });
  pad.addEventListener('pointermove', (e) => { if (e.pointerId === pid) move(e); });
  const end = (e) => { if (e.pointerId !== pid) return; pid = null; joy.active = false; joy.x = joy.y = 0; knob.style.transform = ''; };
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', end);
  const bb = $('#boost-btn');
  bb.addEventListener('pointerdown', (e) => { boostBtn = true; bb.classList.add('on'); bb.setPointerCapture(e.pointerId); });
  const bend = () => { boostBtn = false; bb.classList.remove('on'); };
  bb.addEventListener('pointerup', bend);
  bb.addEventListener('pointercancel', bend);
  document.addEventListener('pointerdown', () => unlockAudio(), { once: true });
}

G.readInput = () => {
  const k = (c) => keys.has(c);
  let turn = (k('KeyA') || k('ArrowLeft') ? 1 : 0) - (k('KeyD') || k('ArrowRight') ? 1 : 0);
  let climb = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0);
  if (joy.active) {
    turn += -joy.x * Math.min(1, Math.abs(joy.x) * 1.3);
    climb += -joy.y;
  }
  return { turn, climb, boost: k('ShiftLeft') || k('ShiftRight') || k('Space') || boostBtn };
};

G.touchUI = coarse || params.has('touch');
G.showTouch = (on) => {
  $('#hud-explore').classList.toggle('touch', on && G.touchUI);
};

// ---------- 화면 흐름 ----------
function goTitle(first) {
  for (const m of [G.explore, G.guess]) if (m.active) m.stop();
  engineStop();
  G.state = 'title';
  G.paused = false;
  showHud(null);
  showScreen('scr-title');
  $$('#modal-root .modal').forEach((m) => closeModal(m));
  G.world.setFog(140, 650);
  G.world.clouds.visible = true;
  G.world.setMarkersVisible(false);
  G.plane.mesh.visible = true;
  G.setLabelMode({ sites: 'none', prov: false, provLines: false, geo: false });
  if (!first) {
    const c = G.attractCenter;
    G.plane.place(c.x + 48, c.z, 0, 8);
    G.tweenCam(() => G.camBase.clone(), () => G.plane.pos.clone(), 0.01, 'attract');
  }
  G.camMode = 'attract';
  G.controls.enabled = false;
  updateDexCount();
  applyTitleOffset();
}
G.goTitle = goTitle;

function applyTitleOffset() {
  const cam = G.camera;
  if (G.state === 'title' || G.state === 'level' || G.state === 'mission') {
    if (innerWidth > innerHeight * 1.1) cam.setViewOffset(innerWidth, innerHeight, -innerWidth * 0.2, 0, innerWidth, innerHeight);
    else cam.setViewOffset(innerWidth, innerHeight, 0, innerHeight * 0.17, innerWidth, innerHeight);
  } else cam.clearViewOffset();
}

function updateDexCount() { $('#dex-count').textContent = `${visitedCount()}/${G.sites.length}`; }

let levelFor = 'explore';
function openLevel(mode) {
  levelFor = mode;
  G.state = 'level';
  $('#level-title').textContent = mode === 'explore' ? '탐험 비행 · 난이도 선택' : '위치 맞히기 · 난이도 선택';
  for (const l of [1, 2, 3]) {
    $(`#lv${l}-desc`).textContent = LEVELS[l][mode];
    const best = mode === 'guess' ? store.best[`guess:${l}`] : null;
    $(`#lv${l}-best`).textContent = best ? `최고 ${fmt(best)}점` : '';
  }
  showScreen('scr-level');
  applyTitleOffset();
}
G.openLevel = openLevel;

function openMissionSelect(level) {
  G.state = 'mission';
  G.curLevel = level;
  showHud(null);
  const list = $('#mission-list');
  const all = [...MISSIONS, FREE_FLIGHT];
  list.innerHTML = all.map((m, i) => {
    const best = store.best[`explore:${m.id}:${level}`];
    const done = m.badge && store.badges[m.badge];
    const seen = m.sites.filter((id) => store.visited[id]).length;
    return `<button class="mcard ${m.id === 'free' ? 'free' : ''}" data-id="${m.id}" style="--mc:${m.color}">
      <div class="mc-num">${m.id === 'free' ? '∞' : i + 1}</div>
      <div class="mc-body">
        <div class="mc-top"><b>${esc(m.name)}</b>${m.stars ? `<span class="mc-stars">${'★'.repeat(m.stars)}<i>${'★'.repeat(3 - m.stars)}</i></span>` : ''}</div>
        <p>${esc(m.desc)}</p>
        <div class="mc-meta">${m.sites.length ? `<span>장소 ${m.sites.length}곳</span><span>발견 ${seen}/${m.sites.length}</span>` : `<span>발견 ${visitedCount()}/43</span>`}${best ? `<span class="mc-best">최고 ${fmt(best)}점</span>` : ''}${done ? `<span class="mc-badge">배지 획득</span>` : ''}</div>
      </div></button>`;
  }).join('');
  $('#mission-level').textContent = LEVELS[level].name;
  $$('.mcard', list).forEach((b) => {
    b.onclick = () => { sfx.click(); showScreen(null); G.camera.clearViewOffset(); G.explore.start(b.dataset.id, level); };
    b.onmouseenter = () => sfx.hover();
  });
  showScreen('scr-mission');
  applyTitleOffset();
}
G.openMissionSelect = openMissionSelect;

function setupMenus() {
  $('#btn-mute').innerHTML = isMuted() ? ICONS.mute : ICONS.sound;
  $('#btn-mute').onclick = () => { setMuted(!isMuted()); $('#btn-mute').innerHTML = isMuted() ? ICONS.mute : ICONS.sound; if (!isMuted()) sfx.click(); };
  $('#hx-pause').innerHTML = ICONS.pause;
  $('#gq-pause').innerHTML = ICONS.pause;
  $('#hx-dex').innerHTML = ICONS.book;
  $('#gq-tilt').innerHTML = ICONS.tilt;
  document.body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    sfx.click();
    if (act === 'explore' || act === 'guess') openLevel(act);
    else if (act === 'dex') openDex();
    else if (act === 'info') openInfo();
    else if (act === 'title') goTitle();
    else if (act === 'back-level') openLevel('explore');
  });
  $$('.level-card').forEach((b) => {
    b.onclick = () => {
      sfx.click();
      const l = +b.dataset.level;
      if (levelFor === 'explore') openMissionSelect(l);
      else { showScreen(null); G.camera.clearViewOffset(); G.guess.start(l); }
    };
    b.onmouseenter = () => sfx.hover();
  });
  $$('.btn').forEach((b) => b.addEventListener('mouseenter', () => sfx.hover()));
  $('#hx-pause').onclick = () => { sfx.click(); openPause(); };
  $('#gq-pause').onclick = () => { sfx.click(); openPause(); };
  $('#hx-dex').onclick = () => { sfx.click(); G.paused = true; openDex(() => { G.paused = false; }); };
  $('#gq-tilt').onclick = () => {
    sfx.click();
    const c = G.controls, cam = G.camera;
    const off = cam.position.clone().sub(c.target);
    const sph = new THREE.Spherical().setFromVector3(off);
    sph.phi = sph.phi < 0.6 ? 1.05 : 0.2;
    const np = new THREE.Vector3().setFromSpherical(sph).add(c.target);
    G.tweenCam(np, c.target.clone(), 0.6, 'orbit');
  };
}

function openPause() {
  if (anyModalOpen()) return;
  G.paused = true;
  const inExplore = G.state === 'explore';
  const md = openModal(`
    <div class="pause">
      <h2>일시정지</h2>
      <button class="btn primary big p-resume">계속하기</button>
      ${inExplore ? '<button class="btn p-dex">도감 보기</button>' : ''}
      ${inExplore ? `<button class="btn p-end">${G.explore.free ? '비행 마치고 결과 보기' : '미션 그만두기'}</button>` : ''}
      <button class="btn ghost p-title">처음 화면으로</button>
      <div class="pause-help">
        ${inExplore ? '<p><b>W/S, ↑/↓</b> 상승·하강 <b>A/D, ←/→</b> 선회 <b>Shift</b> 가속 <b>Esc</b> 일시정지</p>' : '<p>지도를 눌러 위치를 고르고 <b>깃발 꽂기</b>를 누릅니다. 드래그로 이동, 휠·두 손가락으로 확대, 오른쪽 드래그로 기울입니다.</p>'}
      </div>
    </div>`, 'pause-modal');
  $('.p-resume', md).onclick = () => { sfx.click(); closeModal(md); G.paused = false; };
  if (inExplore) {
    $('.p-dex', md).onclick = () => { sfx.click(); closeModal(md); openDex(() => openPause()); };
    $('.p-end', md).onclick = () => { sfx.click(); closeModal(md); G.explore.finish(); };
  }
  $('.p-title', md).onclick = () => { sfx.click(); closeModal(md); goTitle(); };
}

// ---------- 도감 ----------
const dexFilter = { era: '전체', type: 'all' };
function openDex(onClose) {
  const eras = ['전체', ...G.content.meta.eras];
  const vc = visitedCount();
  const sc = Object.keys(store.solved).length;
  const md = openModal(`
    <div class="dex">
      <div class="dex-head">
        <div><div class="dex-kicker">탐험 도감</div><h2>발견한 장소 <b>${vc}</b><small>/ ${G.sites.length}</small></h2></div>
        <button class="btn ghost dex-close">닫기</button>
      </div>
      <div class="dex-prog"><i style="width:${vc / G.sites.length * 100}%"></i></div>
      <div class="dex-sub">푼 문제 ${sc} / ${G.sites.length * 5} · 종합 문제 ${Object.keys(store.gen).length} / ${G.content.general.length}</div>
      <div class="dex-badges">${BADGES.map((b) => `<span class="badge ${store.badges[b.id] ? 'got' : ''}" style="--bc:${b.color}" title="${esc(b.desc)}">${ICONS.star}${esc(b.name)}</span>`).join('')}</div>
      <div class="dex-filters">
        <div class="chips era">${eras.map((e) => `<button class="chip ${dexFilter.era === e ? 'on' : ''}" data-era="${e}">${e}</button>`).join('')}</div>
        <div class="chips type">
          ${[['all', '모든 유형'], ['nature', '자연'], ['history', '역사'], ['chn', '지금은 중국 땅'], ['seen', '발견한 곳']].map(([k, n]) => `<button class="chip ${dexFilter.type === k ? 'on' : ''}" data-type="${k}">${n}</button>`).join('')}
        </div>
      </div>
      <div class="dex-grid"></div>
    </div>`, 'dex-modal');
  const grid = $('.dex-grid', md);
  const render = () => {
    const list = G.sites.filter((s) => (dexFilter.era === '전체' || eraMatch(s, dexFilter.era)) &&
      (dexFilter.type === 'all' || (dexFilter.type === 'chn' ? s.country === 'CHN' : dexFilter.type === 'seen' ? store.visited[s.id] : s.type === dexFilter.type)));
    grid.innerHTML = list.map((s) => {
      const seen = !!store.visited[s.id];
      const n = solvedCount(s.id);
      return `<button class="dcard ${seen ? 'seen' : ''} fame${s.fame} ${s.country === 'CHN' ? 'chn' : ''}" data-id="${s.id}" style="--era:${eraColor(s)}">
        <div class="dc-art ${s.type}">${ICONS[s.type]}${seen ? '' : '<span class="dc-q">?</span>'}</div>
        <div class="dc-name">${esc(s.name)}</div>
        <div class="dc-meta"><span>${esc(s.era)}</span><span class="dc-pips">${'●'.repeat(n)}<i>${'●'.repeat(5 - n)}</i></span></div>
        ${s.country === 'CHN' ? '<div class="dc-chn">중국 땅</div>' : ''}
      </button>`;
    }).join('') || '<p class="dex-empty">조건에 맞는 장소가 없습니다.</p>';
    $$('.dcard', grid).forEach((b) => { b.onclick = () => { sfx.click(); openDexCard(G.siteById[b.dataset.id], md, onClose); }; });
  };
  render();
  $$('.chip[data-era]', md).forEach((c) => { c.onclick = () => { sfx.click(); dexFilter.era = c.dataset.era; $$('.chip[data-era]', md).forEach((x) => x.classList.toggle('on', x === c)); render(); }; });
  $$('.chip[data-type]', md).forEach((c) => { c.onclick = () => { sfx.click(); dexFilter.type = c.dataset.type; $$('.chip[data-type]', md).forEach((x) => x.classList.toggle('on', x === c)); render(); }; });
  $('.dex-close', md).onclick = () => { sfx.click(); closeModal(md); if (onClose) onClose(); };
}
G.openDex = openDex;

function openDexCard(site, dexModal, onClose) {
  const md = openModal(`
    <div class="arrive">
      ${itemCardHTML(site, { flip: !store.visited[site.id] })}
      <div class="arrive-btns">
        <button class="btn primary dc-view">${ICONS.pin} 지도에서 보기</button>
        <button class="btn ghost dc-back">목록으로</button>
      </div>
    </div>`, 'card-modal');
  flipIn(md);
  $('.dc-back', md).onclick = () => { sfx.click(); closeModal(md); };
  $('.dc-view', md).onclick = () => { sfx.click(); closeModal(md); closeModal(dexModal); viewSite(site, () => openDex(onClose)); };
}

// 지도에서 장소 보기 (카메라 이동)
function viewSite(site, back) {
  const prev = { mode: G.camMode, hud: $$('.hud.show').map((h) => h.id), scr: $$('.screen.show').map((s) => s.id), state: G.state };
  showHud(null); showScreen(null);
  G.camera.clearViewOffset();
  const gy = G.world.floorAt(site.x, site.z);
  const look = new THREE.Vector3(site.x, gy, site.z);
  G.tweenCam(new THREE.Vector3(site.x + 14, gy + 30, site.z + 34), look, 1.6, 'orbit');
  const bc = makeBeacon(site.country === 'CHN' ? '#ff7a9a' : '#7cf0ff', site.cluster ? 0.9 : 1.5);
  bc.position.copy(look);
  G.scene.add(bc);
  const an = G.world.addAnim((dt, t) => bc.userData.update(t));
  const L = G.labels.add(`<b>${esc(site.name)}</b>${site.country === 'CHN' ? '<em>지금은 중국 땅</em>' : ''}`, look.clone().setY(gy + 5), { cls: 'lbl-answer', maxDist: 3000, group: 'view' });
  const bar = $('#viewbar');
  bar.innerHTML = `<div class="vb-name"><b>${esc(site.name)}</b><span>${esc(site.region)}</span></div><button class="btn primary vb-back">돌아가기</button>`;
  bar.classList.add('show');
  $('.vb-back', bar).onclick = () => {
    sfx.click();
    bar.classList.remove('show');
    G.scene.remove(bc); G.world.removeAnim(an); G.labels.remove(L);
    prev.hud.forEach((id) => showHud(id));
    if (prev.scr.length) showScreen(prev.scr[0]);
    G.state = prev.state;
    if (prev.mode === 'chase') G.tweenCam(() => G.plane.pos.clone().addScaledVector(G.plane.forward(new THREE.Vector3()), -11).add(new THREE.Vector3(0, 4, 0)), () => G.plane.pos.clone(), 1.0, 'chase');
    else if (prev.mode === 'attract') G.tweenCam(() => G.plane.pos.clone().add(new THREE.Vector3(10, 4, 10)), () => G.plane.pos.clone(), 1.2, 'attract');
    else G.camMode = prev.mode;
    applyTitleOffset();
    back && back();
  };
}

// ---------- 정보 ----------
function openInfo() {
  const meta = G.content.meta, geo = G.content.geo;
  const md = openModal(`
    <div class="info">
      <div class="dex-head"><div><div class="dex-kicker">정보</div><h2>지도와 출처</h2></div><button class="btn ghost info-close">닫기</button></div>
      <section><h3>남북 표기 차이</h3>
        <p>이 게임의 지명은 북한의 현행 행정구역과 표기를 사용합니다. 북한은 두음법칙을 적용하지 않아 남한과 표기가 다른 지명이 있습니다.</p>
        <div class="name-pairs"><span><b>량강도</b>양강도</span><span><b>라선</b>나선</span><span><b>력포</b>역포</span><span><b>로동</b>노동</span></div>
        <p class="small">굵은 글씨가 북한 표기, 옆이 남한 표기입니다.</p>
      </section>
      <section><h3>알아 두면 좋은 사실</h3><ul class="facts">${meta.general_facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></section>
      <section><h3>지도 보는 법</h3>
        <p>노란 선은 북한의 육상 국경(중국·러시아와의 경계, 군사분계선)입니다. 이웃 나라 땅은 흐리게 표시했습니다. 높이는 실제보다 8배 과장해서 보여 줍니다.</p>
        <p>분홍색 표시는 지금은 중국 땅에 있는 고구려 유적입니다.</p>
      </section>
      <section><h3>조작법</h3>
        <p><b>탐험 비행</b> W/S·↑/↓ 상승·하강, A/D·←/→ 선회, Shift 가속, Esc 일시정지. 휴대폰에서는 왼쪽 조이스틱과 가속 버튼을 사용합니다.</p>
        <p><b>위치 맞히기</b> 지도를 눌러 위치를 고른 뒤 깃발 꽂기 버튼을 누릅니다. 드래그로 이동, 휠이나 두 손가락으로 확대합니다.</p>
      </section>
      <section><h3>출처</h3><ul class="facts">${geo.sources.map((s) => `<li>${esc(s)}</li>`).join('')}<li>장소 설명·문제: 교사 검토용 초안</li><li>${esc(meta.credits)}</li></ul></section>
      <button class="btn ghost info-reset">저장된 기록 지우기</button>
    </div>`, 'info-modal');
  $('.info-close', md).onclick = () => { sfx.click(); closeModal(md); };
  $('.info-reset', md).onclick = (e) => {
    const b = e.currentTarget;
    if (!b.dataset.confirm) { b.dataset.confirm = '1'; b.textContent = '한 번 더 누르면 기록이 모두 지워집니다'; return; }
    try { localStorage.removeItem('northquest_v1_save'); } catch (er) { /* 무시 */ }
    for (const k of ['visited', 'solved', 'gen', 'best', 'badges']) store[k] = {};
    b.textContent = '기록을 지웠습니다';
    updateDexCount();
  };
}

// ---------- 결과 화면 ----------
G.showResult = (r) => {
  G.state = 'result';
  showHud(null);
  G.showTouch(false);
  G.camMode = 'attract';
  G.plane.mesh.visible = true;
  G.world.setFog(140, 650);
  G.world.clouds.visible = true;
  G.world.setMarkersVisible(false);
  G.setLabelMode({ sites: 'none', prov: false, provLines: false, geo: false });
  const c = G.attractCenter;
  G.plane.place(c.x + 48, c.z, 0, 8);
  G.tweenCam(() => G.plane.pos.clone().add(new THREE.Vector3(12, 4, 8)), () => G.plane.pos.clone(), 1.5, 'attract');
  const el = $('#scr-result');
  el.style.setProperty('--rc', r.color);
  el.innerHTML = `
    <div class="res-card">
      <div class="res-kicker">${esc(r.kicker)}</div>
      <h2 class="res-title">${esc(r.title)}</h2>
      <div class="res-stars">${[0, 1, 2].map((i) => `<span class="rs ${i < r.stars ? 'on' : ''}">${ICONS.star}</span>`).join('')}</div>
      <div class="res-scoreline">
        <div class="res-score"><b id="res-num">0</b><small>점</small></div>
        ${r.grade ? `<div class="res-grade g${r.grade}">${r.grade}</div>` : ''}
      </div>
      <div class="res-record ${r.record.isNew ? 'new' : ''}">${r.record.isNew ? (r.record.prev ? `최고 기록 갱신! 이전 ${fmt(r.record.prev)}점` : '첫 기록 등록!') : (r.record.prev ? `최고 기록 ${fmt(r.record.prev)}점` : '')}</div>
      <div class="res-stats">${r.stats.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>
      ${r.badges.length ? `<div class="res-badges"><div class="rb-title">새 배지</div>${r.badges.map((id) => { const b = BADGES.find((x) => x.id === id); return `<span class="badge got big" style="--bc:${b.color}">${ICONS.star}${esc(b.name)}</span>`; }).join('')}</div>` : ''}
      <div class="res-btns">
        <button class="btn primary big res-retry">다시 하기</button>
        <button class="btn res-other">${esc(r.otherLabel)}</button>
        <button class="btn ghost res-title-btn">처음으로</button>
      </div>
    </div>`;
  showScreen('scr-result');
  G.camera.clearViewOffset();
  const num = $('#res-num');
  setTimeout(async () => {
    const stars = $$('.rs', el);
    for (let i = 0; i < stars.length; i++) {
      await new Promise((res) => setTimeout(res, 260));
      if (i < r.stars) {
        stars[i].classList.add('popin');
        sfx.star(i);
        const rc = stars[i].getBoundingClientRect();
        sparkle(rc.left + rc.width / 2, rc.top + rc.height / 2, 22);
      }
    }
    let last = 0;
    await countUp(num, r.score, 1100, (k) => { if (k - last > 0.05) { last = k; sfx.countUp(); } });
    $('.res-grade', el)?.classList.add('popin');
    if (r.record.isNew) { sfx.record(); $('.res-record', el).classList.add('popin'); burst(innerWidth / 2, innerHeight * 0.35, 120); }
    if (r.badges.length) setTimeout(() => sfx.bonus(), 300);
  }, 350);
  $('.res-retry', el).onclick = () => { sfx.click(); showScreen(null); r.retry(); };
  $('.res-other', el).onclick = () => { sfx.click(); r.other(); };
  $('.res-title-btn', el).onclick = () => { sfx.click(); goTitle(); };
  updateDexCount();
};

// ---------- 매 프레임 ----------
let last = performance.now(), T = 0;
const SIM = Math.max(1, Math.min(60, +(params.get('sim') || 1)));
function step(dt) {
  T += dt;
  if (G.state === 'explore') G.explore.update(dt, T);
  else if (G.state === 'guess') G.guess.update(dt, T);
  else if (G.camMode === 'attract' || G.state === 'title' || G.state === 'level' || G.state === 'mission' || G.state === 'result') G.plane.autopilot(dt, T, G.attractCenter, 48);
  updateCamera(dt, T);
  G.world.update(dt, T, G.camera);
}
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (SIM > 1) for (let i = 0; i < SIM; i++) step(1 / 30);
  else step(dt);
  G.labels.update(G.camera, innerWidth, innerHeight);
  fxUpdate(dt);
  G.renderer.render(G.scene, G.camera);
  G.frames = (G.frames || 0) + 1;
  if (DEBUG) $('#dbg').textContent = `frames ${G.frames} · t ${T.toFixed(1)}s · ${G.state}/${G.camMode}`;
  requestAnimationFrame(frame);
}

function onResize() {
  G.renderer.setSize(innerWidth, innerHeight);
  G.camera.aspect = innerWidth / innerHeight;
  G.camera.updateProjectionMatrix();
  applyTitleOffset();
}

// ---------- 디버그 진입 경로 ----------
function routeDebug() {
  const mode = params.get('mode');
  const level = Math.min(3, Math.max(1, +(params.get('level') || 1)));
  const demo = params.get('demo');
  const screen = params.get('screen');
  if (mode === 'explore') {
    showScreen(null); G.camera.clearViewOffset();
    G.explore.start(params.get('mission') || 'm1', level);
    if (demo) {
      G.explore.debugSkipBrief();
      if (demo === 'card' || demo === 'quiz') setTimeout(() => G.explore.debugArrive(), 600);
      if (demo === 'quiz') setTimeout(() => { const b = document.querySelector('.arr-go'); if (b) b.click(); }, 2400);
      if (demo === 'gate') setTimeout(() => G.explore.debugGate(), 600);
      if (demo === 'result') setTimeout(() => G.explore.finish(), 1500);
    }
  } else if (mode === 'guess') {
    showScreen(null); G.camera.clearViewOffset();
    G.guess.start(level);
    if (demo === 'aim') setTimeout(() => G.guess.debugPlace(), 2200);
    if (demo === 'reveal') { setTimeout(() => G.guess.debugPlace(), 2000); setTimeout(() => G.guess.debugConfirm(), 2300); }
  } else if (screen === 'dex') openDex();
  else if (screen === 'info') openInfo();
  else if (screen === 'level') openLevel(params.get('for') || 'explore');
  else if (screen === 'mission') openMissionSelect(level);
}

boot().catch((e) => {
  console.error(e);
  $('#load-msg').textContent = '불러오기에 실패했습니다. 새로 고침해 주십시오. (' + e.message + ')';
});
