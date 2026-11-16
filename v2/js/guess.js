// 위치 맞히기 모드: 디오라마를 돌려 보며 다트를 던져 꽂는다
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { A, LEVEL_NAME, settle, photosOf, photoUrl, credit, refreshMarkers, openModal, closeModal, runQuiz, pickGeneral, landmarkType, shuffle, screenPos } from './app.js';
import { $, h, esc, toast, burst, floatText, shake, ICON, countUp } from './ui.js';
import { sfx } from './audio.js';
import { store } from './store.js';
import { worldToLonLat, distanceKm } from '../../shared/geo.js';
import { eraColor, RARITY } from './sitecfg.js';
import { thumb } from './thumbs.js';

export const GCFG = {
  1: { time: 30, prov: true, region: true, rounds: 10 },
  2: { time: 22, prov: true, region: false, rounds: 10 },
  3: { time: 15, prov: false, region: false, rounds: 10 },
};
let G = null;

export function overview(dur = 1.2) {
  const W = A.world;
  const port = innerWidth < innerHeight;
  W.flyTo({ x: 0, y: 0, z: port ? 0 : -15 }, port ? 1050 : 820, { polar: port ? 0.5 : 0.58, dur });
}

export function startGuess(level, { onFinish }) {
  const W = A.world, cfg = GCFG[level];
  let q;
  const f3 = A.sites.filter((s) => s.fame === 3), f2 = A.sites.filter((s) => s.fame === 2), f1 = A.sites.filter((s) => s.fame === 1);
  if (level === 1) q = [...shuffle(f3.slice()), ...shuffle(f2.slice()).slice(0, 2)];
  else if (level === 2) q = [...shuffle([...f3, ...f2]).slice(0, 7), ...shuffle(f1.slice()).slice(0, 3)];
  else q = [...shuffle(f1.slice()).slice(0, 4), ...shuffle([...f3, ...f2, ...f1.filter(() => true)]).filter((s) => s.fame !== 1).slice(0, 6)];
  q = shuffle(q).slice(0, cfg.rounds);
  G = A.G = {
    mode: 'guess', level, cfg, queue: q, round: 0, score: 0, combo: 0, maxCombo: 0, hits: 0, kms: [], aim: null,
    phase: 'idle', timeLeft: cfg.time, chanceDone: false, usedG: new Set(), objs: [], roundObjs: [], ended: false, onFinish, lastTick: 0,
  };
  W.removeLandmarks();
  W.hidePawn();
  W.follow = null;
  W.controls.autoRotate = false;
  W.setProvinceLines(cfg.prov);
  A.labelMode = { prov: cfg.prov, sites: false, names: () => false, cls: () => 'off' };
  refreshMarkers();
  A.onTap = onTap; A.onHover = null; A.frame = frame; A.onMarker = null; A.onCluster = null;
  buildHud();
  overview(1.4);
  makeReticle();
  setTimeout(nextRound, 1300);
}

export function stopGuess() {
  if (!G) return;
  G.ended = true;
  const W = A.world;
  for (const o of [...G.objs, ...G.roundObjs]) W.scene.remove(o);
  if (G.reticle) W.scene.remove(G.reticle);
  W.removeLandmarks();
  $('#hud').innerHTML = '';
  A.onTap = A.frame = null;
  window.removeEventListener('keydown', onKey);
}

function buildHud() {
  $('#hud').innerHTML = `
  <div class="hud hg">
    <div class="g-round"><small>라운드</small><b id="gRound">0</b><span>/ ${G.queue.length}</span><div class="pips" id="gPips">${G.queue.map(() => '<i></i>').join('')}</div></div>
    <div class="g-prompt" id="gPrompt"></div>
    <div class="h-score"><small>점수</small><b id="hScore">0</b><div class="combo" id="hCombo"></div></div>
  </div>
  <div class="g-timer" id="gTimer"><span class="ic">${ICON.clock}</span><div class="bar"><i id="gBar"></i></div><b id="gSec"></b></div>
  <div class="hud-btns"><button class="rb" id="gExit">${ICON.exit}<span>나가기</span></button></div>
  <button class="throw" id="gThrow" disabled><span class="ic">${ICON.target}</span>던지기!</button>
  <div class="tip" id="gTip">지도를 눌러 조준하고 던지기 버튼을 누릅니다</div>
  <div class="g-dist" id="gDist"></div>`;
  $('#gThrow').addEventListener('click', () => throwDart());
  $('#gExit').addEventListener('click', confirmExit);
  window.addEventListener('keydown', onKey);
}
function onKey(e) { if ((e.code === 'Space' || e.code === 'Enter') && G && G.phase === 'aim' && G.aim) { e.preventDefault(); throwDart(); } }

function makeReticle() {
  const W = A.world;
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.2, 40), new THREE.MeshBasicMaterial({ color: '#ff6f61', transparent: true, opacity: 0.95, depthTest: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  const ring2 = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.9, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false, side: THREE.DoubleSide }));
  ring2.rotation.x = -Math.PI / 2;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 10, 6), new THREE.MeshBasicMaterial({ color: '#ff6f61', transparent: true, opacity: 0.6, depthTest: false }));
  pole.position.y = 5;
  g.add(ring, ring2, pole);
  g.renderOrder = 20;
  ring.renderOrder = ring2.renderOrder = pole.renderOrder = 20;
  g.visible = false;
  W.scene.add(g);
  G.reticle = g;
}

function setPrompt(s) {
  const r = RARITY[s.fame];
  $('#gPrompt').innerHTML = `
    <div class="gp-card" style="--rc:${r.color};--ec:${eraColor(s)}">
      <img alt="" src="${thumb(landmarkType(s))}">
      <div class="gp-t"><small>이곳은 어디일까요?</small><b>${esc(s.name)}</b>
      <div class="gp-tags"><span class="era">${esc(s.era)}</span><span>${s.type === 'nature' ? '자연' : '역사'}</span>${G.cfg.region ? `<span class="rg">${esc(s.region)}</span>` : ''}${s.country === 'CHN' ? '<span class="cn">지금은 중국 땅</span>' : ''}</div></div>
    </div>`;
  const pc = $('#gPrompt .gp-card');
  pc.classList.add('drop');
}

function nextRound() {
  if (G.ended) return;
  const W = A.world;
  if (G.round === 5 && !G.chanceDone) { G.chanceDone = true; return chance(); }
  if (G.round >= G.queue.length) return finish();
  for (const o of G.roundObjs) W.scene.remove(o);
  G.roundObjs = [];
  $('#gDist').style.display = 'none';
  const s = G.queue[G.round];
  G.round++;
  G.site = s;
  G.aim = null;
  G.reticle.visible = false;
  $('#gRound').textContent = G.round;
  const pips = $('#gPips').children;
  for (let i = 0; i < pips.length; i++) pips[i].classList.toggle('cur', i === G.round - 1);
  setPrompt(s);
  sfx.draw();
  $('#gThrow').disabled = true;
  $('#gThrow').classList.remove('ready');
  $('#gTip').classList.remove('hide');
  G.timeLeft = G.cfg.time;
  G.phase = 'aim';
  G.lastTick = Math.ceil(G.timeLeft);
}

function onTap(x, y) {
  if (!G || G.phase !== 'aim') return;
  const p = A.world.pick(x, y);
  if (!p) return;
  G.aim = p;
  const r = G.reticle;
  r.position.set(p.x, p.y + 0.3, p.z);
  r.visible = true;
  r.scale.setScalar(0.01);
  A.world.tween(0.25, (k) => r.scale.setScalar(Math.max(0.01, k) * Math.max(1, A.world.camDist() / 200)));
  sfx.click();
  const b = $('#gThrow');
  b.disabled = false; b.classList.add('ready');
  $('#gTip').classList.add('hide');
}

function throwDart() {
  if (G.phase !== 'aim' || !G.aim) return;
  G.phase = 'fly';
  const W = A.world;
  $('#gThrow').disabled = true; $('#gThrow').classList.remove('ready');
  const aim = new THREE.Vector3(G.aim.x, G.aim.y, G.aim.z);
  const start = W.camera.position.clone().lerp(aim, 0.3); start.y += 30;
  const dart = W.makeDart();
  const sc = Math.min(3.2, Math.max(1.3, W.camDist() / 220));
  dart.scale.setScalar(sc);
  G.roundObjs.push(dart);
  sfx.throw();
  const pos = (k) => {
    const p = start.clone().lerp(aim, k);
    p.y += Math.sin(k * Math.PI) * 40 * (1 - k * 0.3);
    return p;
  };
  dart.position.copy(start);
  W.tween(0.7, (k) => {
    const e = k * k * (3 - 2 * k) * 0.35 + k * 0.65;
    const p = pos(e), p2 = pos(Math.min(1, e + 0.02));
    dart.position.copy(p);
    if (e < 0.995) dart.lookAt(p2);
    dart.rotateZ(k * 12);
  }, () => {
    const dir = aim.clone().sub(pos(0.97)).normalize();
    dart.position.copy(aim).addScaledVector(dir, 1.6 * sc);
    sfx.hit();
    shake(0.6);
    const sp = screenPos(aim.x, aim.y, aim.z);
    burst(sp.x, sp.y, 14, { colors: ['#e8d6b8', '#ffffff', '#cdb48f'], shape: 'dot', speed: 4 });
    const q0 = dart.quaternion.clone();
    W.tween(0.6, (k) => {
      dart.quaternion.copy(q0);
      dart.rotateX(Math.sin(k * 30) * 0.12 * (1 - k));
    });
    G.reticle.visible = false;
    setTimeout(() => reveal(aim), 450);
  });
}

function scoreFor(d) { return d <= 8 ? 1000 : Math.round(1000 * Math.exp(-(d - 8) / 85)); }
function rating(d) {
  if (d == null) return ['시간 초과', 'miss'];
  if (d < 15) return ['명중!', 'bull'];
  if (d < 50) return ['아주 가까움', 'great'];
  if (d < 120) return ['가까움', 'good'];
  if (d < 220) return ['조금 멂', 'meh'];
  return ['많이 멂', 'miss'];
}

function reveal(aim) {
  if (G.ended) return;
  G.phase = 'reveal';
  const W = A.world, s = G.site;
  const ty = W.peakY(s.x, s.z);
  let d = null, pts = 0, tb = 0;
  if (aim) {
    const ll = worldToLonLat(aim.x, aim.z);
    d = distanceKm(ll.lat, ll.lon, s.lat, s.lon);
    pts = scoreFor(d);
    if (d < 40) tb = Math.round(200 * G.timeLeft / G.cfg.time);
  }
  if (d != null && d < 50) { G.combo++; G.maxCombo = Math.max(G.maxCombo, G.combo); } else G.combo = 0;
  if (d != null && d < 15) G.hits++;
  const mult = G.combo >= 2 ? 1 + Math.min(G.combo - 1, 5) * 0.1 : 1;
  const total = Math.round((pts + tb) * mult);
  G.score += total;
  G.kms.push(d ?? 400);
  const pip = $('#gPips').children[G.round - 1];
  const [rt, rc] = rating(d);
  pip.className = rc;

  // 정답 위치: 깃발 + 랜드마크 '뿅'
  // 연출 뒤 카메라 거리에 맞춰 크기를 정한다
  const endDist = aim ? Math.min(650, Math.max(110, d * 2.0 + 60)) : 200;
  const sc = Math.min(2.6, Math.max(1, endDist / 150));
  W.addLandmark(s, landmarkType(s), { pop: true, scale: sc });
  const flag = W.makeFlag(s.x, s.z, '#ffd166');
  flag.scale.setScalar(sc * 1.1);
  flag.position.x += 5 * sc; flag.position.z -= 3 * sc;
  W.popObject(flag, flag.scale.x, 0.15);
  G.objs.push(flag);
  sfx.pop();

  if (aim) {
    const mid = { x: (aim.x + s.x) / 2, z: (aim.z + s.z) / 2 };
    const hgt = Math.min(70, 6 + d * 0.28);
    const pts3 = [];
    for (let i = 0; i <= 48; i++) {
      const k = i / 48;
      pts3.push(aim.x + (s.x - aim.x) * k, aim.y + (ty - aim.y) * k + Math.sin(k * Math.PI) * hgt, aim.z + (s.z - aim.z) * k);
    }
    const geo = new LineGeometry(); geo.setPositions(pts3);
    const mat = new LineMaterial({ color: '#ff6f61', linewidth: 5, dashed: true, dashSize: 4, gapSize: 2.5, depthTest: false, transparent: true });
    mat.resolution.set(innerWidth, innerHeight);
    A.world.lineMats.push(mat);
    const line = new Line2(geo, mat); line.computeLineDistances(); line.renderOrder = 15;
    geo.instanceCount = 0;
    W.scene.add(line);
    G.roundObjs.push(line);
    W.tween(0.6, (k) => { geo.instanceCount = Math.ceil(48 * k); });
    G.midPt = { x: mid.x, y: Math.max(aim.y, ty) + hgt + 2, z: mid.z };
    const dl = $('#gDist');
    dl.style.display = '';
    dl.innerHTML = `<b>${d < 10 ? d.toFixed(1) : Math.round(d)}</b>km`;
    dl.className = 'g-dist ' + rc;
    W.flyTo({ x: mid.x, y: 5, z: mid.z }, endDist, { dur: 1.1 });
  } else {
    G.midPt = null;
    W.flyTo({ x: s.x, y: 5, z: s.z }, 200, { dur: 1.1 });
  }
  setTimeout(() => {
    const sp = screenPos(s.x, ty + 8, s.z);
    burst(sp.x, sp.y, d != null && d < 15 ? 44 : 20);
    if (d != null && d < 15) sfx.correct(); else if (d == null || d > 120) sfx.wrong(); else sfx.coin();
    if (G.combo >= 2) sfx.combo(G.combo);
    floatText(sp.x, sp.y - 30, total ? `+${total}` : '0점', 'pts big');
    countUp($('#hScore'), G.score, 700);
    const c = $('#hCombo');
    c.textContent = G.combo >= 2 ? `${G.combo} 연속 근접!` : '';
    sheet(s, d, rt, rc, pts, tb, mult, total);
  }, 1150);
}

function sheet(s, d, rt, rc, pts, tb, mult, total) {
  const last = G.round >= G.queue.length && G.chanceDone;
  const lastAll = G.round >= G.queue.length;
  const box = h(`<div class="g-sheet ${rc}">
    <div class="gs-rate"><span class="badge">${rt}</span><b>${d == null ? '-' : (d < 10 ? d.toFixed(1) : Math.round(d)) + 'km'}</b><em>+${total.toLocaleString('ko-KR')}점</em></div>
    <div class="gs-break">${d == null ? '시간 안에 던지지 못했습니다' : `거리 점수 ${pts}${tb ? ` · 시간 보너스 ${tb}` : ''}${mult > 1 ? ` · 연속 근접 x${mult.toFixed(1)}` : ''}`}</div>
    <div class="gs-site" style="--ec:${eraColor(s)}">
      ${photosOf(s)[0] ? `<figure class="gs-ph"><img alt="${esc(photosOf(s)[0].caption)}" loading="lazy" decoding="async" data-fb="${landmarkType(s)}" src="${photoUrl(photosOf(s)[0])}">${credit(photosOf(s)[0])}</figure>` : `<img alt="" src="${thumb(landmarkType(s))}">`}
      <div><b>${esc(s.name)}</b><small>${esc(s.region)} · ${esc(s.era)}${s.approx ? ' · 대략적 위치' : ''}</small><p>${esc(s.summary)}</p>${s.country === 'CHN' ? '<span class="cn">지금은 중국 땅</span>' : ''}</div>
    </div>
    <div class="gc-actions"><button class="btn primary" id="gsNext">${lastAll && last ? '결과 보기' : '다음 문제'}</button></div>
  </div>`);
  $('#hud').appendChild(box);
  box.querySelector('#gsNext').addEventListener('click', () => {
    sfx.click();
    box.classList.add('out');
    setTimeout(() => box.remove(), 250);
    overview(0.9);
    setTimeout(nextRound, 500);
  });
}

function chance() {
  G.phase = 'chance';
  const { g, i } = pickGeneral(G.level, G.usedG);
  G.usedG.add(i);
  sfx.chance();
  const card = h(`<div class="gcard chance enter"><div class="ch-front">
    <div class="ch-star">★</div><div class="ch-t">찬스 카드</div><div class="ch-topic">${esc(g.topic)}</div>
    <p class="ch-d">절반을 지났습니다. 종합 문제를 맞히면 <b>+300점</b>을 받습니다.</p>
    <div class="gc-actions"><button class="btn gold" id="chGo">도전하기</button></div></div></div>`);
  openModal(h('<div class="card-wrap"></div>'), { cls: 'dim' }).appendChild(settle(card));
  card.querySelector('#chGo').addEventListener('click', () => {
    sfx.click();
    runQuiz(card, g, {
      tag: '찬스 · ' + g.topic, related: g.related,
      onAnswer: (ok) => {
        if (ok) { G.score += 300; store.markGeneral(i); countUp($('#hScore'), G.score, 700); G.chanceOk = true; }
      },
      doneLabel: '다음 라운드',
      onDone: () => { closeModal(true); nextRound(); },
    });
  });
}

function confirmExit() {
  sfx.click();
  const prev = G.phase;
  G.phase = 'paused';
  const box = h(`<div class="confirm"><b>위치 맞히기를 마칠까요?</b><p>지금까지의 점수로 결과를 봅니다.</p>
    <div class="gc-actions"><button class="btn ghost" id="cNo">계속하기</button><button class="btn primary" id="cYes">결과 보기</button></div></div>`);
  box.querySelector('#cNo').addEventListener('click', () => { sfx.click(); closeModal(); });
  box.querySelector('#cYes').addEventListener('click', () => { sfx.click(); closeModal(true); finish(true); });
  openModal(box, { cls: 'dim', onClose: () => { G.phase = prev; } });
}

function finish(quit = false) {
  if (G.ended) return;
  const n = G.kms.length;
  const avg = n ? G.kms.reduce((a, b) => a + b, 0) / n : 0;
  const res = { mode: 'guess', level: G.level, quit, score: G.score, rounds: n, total: G.queue.length, hits: G.hits, avg, maxCombo: G.maxCombo, chanceOk: !!G.chanceOk };
  res.stars = G.score >= 7000 ? 3 : G.score >= 4500 ? 2 : G.score >= 2000 ? 1 : 0;
  const cb = G.onFinish;
  stopGuess();
  cb && cb(res);
}

function frame(dt) {
  if (!G || G.ended) return;
  const W = A.world;
  if (G.phase === 'aim') {
    G.timeLeft -= dt;
    const k = Math.max(0, G.timeLeft / G.cfg.time);
    const bar = $('#gBar');
    if (bar) {
      bar.style.width = k * 100 + '%';
      $('#gTimer').classList.toggle('low', G.timeLeft < 5.5);
      $('#gSec').textContent = Math.max(0, Math.ceil(G.timeLeft));
    }
    const sec = Math.ceil(G.timeLeft);
    if (sec < G.lastTick) { G.lastTick = sec; if (sec <= 5 && sec > 0) sfx.tick(); }
    if (G.timeLeft <= 0) {
      if (G.aim) throwDart();
      else { G.phase = 'reveal'; toast('시간 초과', 'warn'); sfx.wrong(); reveal(null); }
    }
    if (G.reticle.visible) {
      const s = Math.max(1, W.camDist() / 200) * (1 + Math.sin(W.time * 6) * 0.06);
      G.reticle.scale.setScalar(s);
    }
  }
  const dl = $('#gDist');
  if (G.midPt && dl && dl.style.display !== 'none') {
    const p = screenPos(G.midPt.x, G.midPt.y, G.midPt.z);
    dl.style.transform = `translate3d(${p.x}px,${p.y}px,0)`;
  }
}

export { LEVEL_NAME };
