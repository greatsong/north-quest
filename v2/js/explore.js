// 탐험 모드: 목적지 카드 → 말 이동 → 랜드마크 등장 → 카드·문제
import * as THREE from 'three';
import { A, LEVEL_NAME, settle, refreshMarkers, openModal, closeModal, siteFront, cardShell, runQuiz, pickQuiz, pickGeneral, landmarkType, popAt, shuffle, screenPos } from './app.js';
import { $, h, esc, toast, flip, burst, floatText, shake, ICON, countUp } from './ui.js';
import { sfx } from './audio.js';
import { store } from './store.js';
import { lonLatToWorld, worldToLonLat, bearingDeg } from '../../shared/geo.js';
import { RARITY, eraColor } from './sitecfg.js';
import { thumb } from './thumbs.js';

const KM_PER_STEP = 5;
export const EXP = {
  1: { steps: 300, goal: 6, bonus: 25, hintCost: 0, compass: true, beacon: 'always', names: true, prov: true, region: true },
  2: { steps: 240, goal: 7, bonus: 20, hintCost: 5, compass: true, beacon: 'near', names: false, prov: true, region: true },
  3: { steps: 200, goal: 8, bonus: 18, hintCost: 8, compass: false, beacon: 'hint', names: false, prov: false, region: false },
};
const DIRS = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];

let G = null, preview = null, previewLbl = null;

export function startExplore(level, { onFinish, onExit }) {
  const W = A.world, cfg = EXP[level];
  let deck;
  if (level === 1) deck = shuffle(A.sites.filter((s) => s.fame >= 2));
  else if (level === 2) deck = shuffle([...A.sites.filter((s) => s.fame >= 2), ...shuffle(A.sites.filter((s) => s.fame === 1)).slice(0, 8)]);
  else deck = shuffle(A.sites.slice());
  G = A.G = {
    mode: 'explore', level, cfg, steps: cfg.steps, maxSteps: cfg.steps, score: 0, combo: 0, maxCombo: 0,
    done: 0, goal: cfg.goal, mission: null, deck, visited: new Set(), newCards: 0, correct: 0, answered: 0,
    usedQ: new Set(), usedG: new Set(), hint: false, tokens: [], busy: true, ended: false, onFinish, onExit, beaconOn: false,
  };
  W.removeLandmarks();
  for (const id of Object.keys(store.data.visited)) { const s = A.byId[id]; if (s) W.addLandmark(s, landmarkType(s), { scale: s.cluster ? 0.7 : 0.9 }); }
  const st = lonLatToWorld(126.45, 39.45);
  W.placePawn(st.x, st.z);
  W.setProvinceLines(cfg.prov);
  W.controls.autoRotate = false;
  W.follow = W.pawn.group;
  W.flyTo({ x: st.x, y: 10, z: st.z }, innerWidth < innerHeight ? 300 : 230, { polar: 0.82, azimuth: 0.15, dur: 1.6 });
  A.labelMode = {
    prov: cfg.prov, sites: true,
    names: (s) => cfg.names || G.visited.has(s.id) || (G.mission === s && G.beaconOn),
    cls: (s) => (G.visited.has(s.id) ? 'done' : G.mission === s && G.beaconOn ? 'tgt' : ''),
  };
  refreshMarkers();
  A.onMarker = (s) => { if (!G.busy && !G.ended) { sfx.click(); moveTo(s.x, s.z, s); } };
  A.onCluster = (c) => { sfx.click(); W.flyTo({ x: c.x, y: 5, z: c.z }, 70, { dur: 0.9 }); };
  A.onTap = onTap; A.onHover = onHover; A.frame = frame;
  buildHud();
  for (let i = 0; i < 4; i++) spawnToken();
  setTimeout(() => drawCards(), 1700);
}

export function stopExplore() {
  if (!G) return;
  G.ended = true;
  const W = A.world;
  for (const t of G.tokens) W.scene.remove(t.obj);
  W.updaters = W.updaters.filter((u) => !u.tok);
  W.setBeacon(0, 0, false);
  W.follow = null;
  W.hidePawn();
  if (preview) preview.visible = false;
  if (previewLbl) previewLbl.style.display = 'none';
  $('#hud').innerHTML = '';
  A.onTap = A.onHover = A.frame = null;
}

// ───────────────────────── HUD
function buildHud() {
  $('#hud').innerHTML = `
  <div class="hud hx">
    <div class="h-mission" id="hMission"><div class="hm-k">목적지 카드</div><div class="hm-n">카드를 뽑는 중</div><div class="hm-p"><span id="hDone">0</span> / ${G.goal}</div></div>
    <div class="h-steps"><span class="ic">${ICON.boot}</span><b id="hSteps">${G.steps}</b><small>걸음</small><div class="bar"><i id="hStepBar"></i></div></div>
    <div class="h-score"><small>점수</small><b id="hScore">0</b><div class="combo" id="hCombo"></div></div>
  </div>
  <div class="hud-btns">
    <button class="rb" id="bHint" title="힌트">${ICON.bulb}<span>힌트</span></button>
    <button class="rb" id="bExit" title="나가기">${ICON.exit}<span>나가기</span></button>
  </div>
  <div class="compass" id="compass"><div class="dial"><i class="n">N</i></div><div class="needle"></div><div class="cd" id="cDist"></div></div>
  <div class="tip" id="hTip">지도를 누르면 말이 그곳으로 이동합니다</div>`;
  $('#bHint').addEventListener('click', useHint);
  $('#bExit').addEventListener('click', confirmExit);
  updHud();
}
function updHud() {
  if (!G) return;
  const s = Math.max(0, Math.ceil(G.steps));
  $('#hSteps').textContent = s;
  const bar = $('#hStepBar');
  bar.style.width = Math.min(100, (G.steps / G.maxSteps) * 100) + '%';
  bar.parentElement.parentElement.classList.toggle('low', G.steps < 35);
  const m = G.mission;
  $('#hMission').innerHTML = m
    ? `<div class="hm-k">목적지</div><div class="hm-n" style="--ec:${eraColor(m)}">${esc(m.name)}</div><div class="hm-p"><span id="hDone">${G.done}</span> / ${G.goal}</div>`
    : `<div class="hm-k">목적지 카드</div><div class="hm-n">-</div><div class="hm-p"><span id="hDone">${G.done}</span> / ${G.goal}</div>`;
  const hb = $('#bHint');
  if (hb) {
    hb.disabled = !m || G.hint;
    hb.querySelector('span').textContent = G.cfg.hintCost ? `힌트 -${G.cfg.hintCost}` : '힌트';
  }
}
function addScore(n, at) {
  G.score += n;
  countUp($('#hScore'), G.score, 600);
  const el = $('#hScore'); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  if (at) popAt(at.x, at.y, at.z, `+${n}`, 'pts');
}
function addSteps(n, at) {
  G.steps = Math.min(G.steps + n, G.maxSteps + 60);
  G.maxSteps = Math.max(G.maxSteps, G.steps);
  updHud();
  const el = $('.h-steps'); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  if (at) setTimeout(() => popAt(at.x, at.y + 8, at.z, `+${n} 걸음`, 'steps'), 250);
}
function setCombo() {
  const c = $('#hCombo');
  if (!c) return;
  c.textContent = G.combo >= 2 ? `${G.combo} 연속 정답!` : '';
  c.classList.remove('pop'); void c.offsetWidth; if (G.combo >= 2) c.classList.add('pop');
}

// ───────────────────────── 목적지 카드 뽑기
function remaining() { return A.sites.filter((s) => !G.visited.has(s.id)); }
function drawCards() {
  if (G.ended) return;
  G.busy = true;
  let pool = G.deck.filter((s) => !G.visited.has(s.id));
  if (pool.length < 2) pool = pool.concat(shuffle(remaining().filter((s) => !pool.includes(s))));
  if (!pool.length) return finish(true);
  const pick = pool.slice(0, 2);
  G.deck = G.deck.filter((s) => !pick.includes(s)).concat(pick);
  const pp = A.world.pawn.group.position;
  const box = h(`<div class="draw"><div class="draw-h"><b>목적지 카드</b><span>${G.done + 1}번째 목적지 · 카드 한 장 선택</span></div><div class="draw-row"></div></div>`);
  const row = box.querySelector('.draw-row');
  sfx.draw();
  pick.forEach((s, i) => {
    const km = Math.hypot(s.x - pp.x, s.z - pp.z);
    const cost = Math.ceil(km / KM_PER_STEP);
    const dir = DIRS[Math.round(bearingDeg(...toLL(pp.x, pp.z), s.lat, s.lon) / 45) % 8];
    const r = RARITY[s.fame];
    const card = h(`<button class="mcard back" style="--rc:${r.color};--ec:${eraColor(s)}"><div class="mc-back"><span>?</span></div></button>`);
    row.appendChild(card);
    setTimeout(() => flip(card, () => {
      card.classList.remove('back');
      card.innerHTML = `
        <div class="gc-top"><span class="rar">${r.code}</span><span class="era">${esc(s.era)}</span></div>
        <div class="gc-art"><img alt="" src="${thumb(landmarkType(s))}">${s.country === 'CHN' ? '<div class="ribbon">지금은 중국 땅</div>' : ''}</div>
        <div class="gc-name">${esc(s.name)}</div>
        <div class="gc-region">${G.cfg.region ? esc(s.region) : '지역 비공개'}</div>
        <div class="mc-dist"><b>${dir}쪽 약 ${Math.round(km)}km</b><span>${cost}걸음</span></div>
        ${cost > G.steps ? '<div class="mc-warn">걸음이 부족할 수 있습니다</div>' : ''}`;
      sfx.flip();
    }), 350 + i * 260);
    card.addEventListener('click', () => {
      if (card.classList.contains('back')) return;
      sfx.click();
      card.classList.add('chosen');
      setTimeout(() => { closeModal(true); chooseMission(s); }, 280);
    });
  });
  openModal(box, { cls: 'dim' });
}
function toLL(x, z) { const o = worldToLonLat(x, z); return [o.lat, o.lon]; }

function chooseMission(s) {
  G.mission = s;
  G.hint = false;
  updBeacon(true);
  updHud();
  const W = A.world;
  toast(`목적지: <b>${esc(s.name)}</b>`, 'go');
  if (G.level === 1) {
    G.busy = true;
    W.follow = null;
    W.flyTo({ x: s.x, y: 5, z: s.z }, 200, { dur: 1.0, done: () => setTimeout(() => {
      W.flyTo(W.pawn.group.position, innerWidth < innerHeight ? 300 : 230, { dur: 0.9, done: () => { W.follow = W.pawn.group; G.busy = false; } });
    }, 600) });
  } else G.busy = false;
  $('#hTip').textContent = G.cfg.compass ? '나침반 바늘이 목적지 쪽을 가리킵니다' : '도전 난이도: 힌트를 쓰면 나침반이 켜집니다';
}

function updBeacon(force = false) {
  const m = G.mission;
  let on = false;
  if (m) {
    const p = A.world.pawn.group.position;
    const d = Math.hypot(m.x - p.x, m.z - p.z);
    on = G.cfg.beacon === 'always' || G.hint || (G.cfg.beacon === 'near' && d < 110);
  }
  if (on !== G.beaconOn || force) {
    G.beaconOn = on;
    A.world.setBeacon(m ? m.x : 0, m ? m.z : 0, on);
    refreshMarkers();
  }
}

function useHint() {
  if (!G.mission || G.hint || G.busy) return;
  const cost = G.cfg.hintCost;
  if (cost && G.steps <= cost + 1) { toast('걸음이 부족해 힌트를 사용할 수 없습니다'); return; }
  sfx.chance();
  G.steps -= cost;
  G.hint = true;
  updHud(); updBeacon(true);
  const m = G.mission;
  toast(`힌트: <b>${esc(m.name)}</b>은(는) <b>${esc(m.region)}</b>에 있습니다`, 'hint');
  const W = A.world;
  G.busy = true; W.follow = null;
  W.flyTo({ x: m.x, y: 5, z: m.z }, 220, { dur: 1.0, done: () => setTimeout(() => {
    W.flyTo(W.pawn.group.position, innerWidth < innerHeight ? 300 : 230, { dur: 0.9, done: () => { W.follow = W.pawn.group; G.busy = false; } });
  }, 800) });
}

// ───────────────────────── 이동
function onTap(x, y) {
  if (!G || G.busy || G.ended) return;
  const p = A.world.pick(x, y);
  if (!p) return;
  if (p.sea) { toast('바다는 건널 수 없습니다. 육지를 누르면 이동합니다'); sfx.wrong(); return; }
  sfx.click();
  moveTo(p.x, p.z, null);
}

function moveTo(tx, tz, direct) {
  const W = A.world;
  const p = W.pawn.group.position;
  const sx = p.x, sz = p.z, dx = tx - sx, dz = tz - sz, len = Math.hypot(dx, dz);
  if (len < 1.5) { if (direct) arrive(direct); return; }
  let best = { s: 1, kind: direct ? 'site' : 'end', obj: direct };
  const consider = (px, pz, r, kind, obj) => {
    const s = ((px - sx) * dx + (pz - sz) * dz) / (len * len);
    if (s <= 0.02 || s >= best.s) return;
    const cx = sx + dx * s, cz = sz + dz * s;
    if (Math.hypot(px - cx, pz - cz) <= r) best = { s, kind, obj };
  };
  for (const s of A.sites) if (!G.visited.has(s.id) && !s._cluster && s !== direct) consider(s.x, s.z, 4.5, 'site', s);
  for (const c of A.clusters) if (!(direct && direct._cluster === c) && c.list.some((s) => !G.visited.has(s.id))) consider(c.x, c.z, 6, 'cluster', c);
  for (const t of G.tokens) consider(t.x, t.z, 4.5, 'token', t);
  const ex = sx + dx * best.s, ez = sz + dz * best.s;
  G.busy = true;
  hidePreview();
  W.follow = W.pawn.group;
  $('#hTip').classList.add('hide');
  W.hopPawn(ex, ez, {
    onHop: (i, n, x, z, km) => {
      G.steps -= km / KM_PER_STEP;
      updHud();
      sfx.hop(i);
      if (W.isSea(x, z)) { sfx.splash(); const sp = screenPos(x, 1, z); burst(sp.x, sp.y, 6, { colors: ['#bdefff', '#ffffff'], shape: 'dot', speed: 3 }); }
      updBeacon();
      if (G.steps <= 0) { G.steps = 0; return false; }
      return true;
    },
    done: (dist, stopped) => {
      if (stopped || G.steps <= 0) { G.steps = 0; updHud(); outOfSteps(); return; }
      handleEvent(best);
    },
  });
}

function handleEvent(ev) {
  const W = A.world, p = W.pawn.group.position;
  if (ev.kind === 'site') return arrive(ev.obj);
  if (ev.kind === 'cluster') return openCluster(ev.obj);
  if (ev.kind === 'token') return hitToken(ev.obj);
  // 그냥 멈춘 곳: 가까운 장소가 있으면 연다
  let near = null, nd = 1e9;
  for (const s of A.sites) {
    if (G.visited.has(s.id) || s._cluster) continue;
    const d = Math.hypot(s.x - p.x, s.z - p.z);
    if (d < nd) { nd = d; near = s; }
  }
  if (near && nd < 7) return arrive(near);
  for (const c of A.clusters) {
    if (Math.hypot(c.x - p.x, c.z - p.z) < 11 && c.list.some((s) => !G.visited.has(s.id))) return openCluster(c);
  }
  for (const t of G.tokens) if (Math.hypot(t.x - p.x, t.z - p.z) < 5) return hitToken(t);
  G.busy = false;
  if (G.mission) {
    const d = Math.hypot(G.mission.x - p.x, G.mission.z - p.z);
    if (d < 25) toast(`목적지까지 약 ${Math.round(d)}km 남았습니다`);
  }
}

function openCluster(c) {
  G.busy = true;
  const W = A.world;
  W.flyTo({ x: c.x, y: 5, z: c.z }, 75, { dur: 0.9 });
  const box = h(`<div class="cluster-pop">
    <div class="cp-h"><b>${esc(c.name)}</b><span>가까운 곳에 장소 ${c.list.length}곳이 모여 있습니다. 갈 곳을 누르면 말이 이동합니다.</span></div>
    <div class="cp-list">${c.list.map((s) => `
      <button class="cp-item ${G.visited.has(s.id) ? 'done' : ''} ${G.mission === s ? 'tgt' : ''}" data-id="${s.id}" style="--ec:${eraColor(s)}">
        <img alt="" src="${thumb(landmarkType(s))}"><span class="cp-n">${esc(s.name)}</span><span class="cp-e">${esc(s.era)}</span>
        ${G.mission === s ? '<em>목적지</em>' : G.visited.has(s.id) ? '<em class="ok">방문</em>' : ''}
      </button>`).join('')}</div>
    <div class="gc-actions"><button class="btn ghost" id="cpClose">닫기</button></div></div>`);
  box.querySelectorAll('.cp-item').forEach((b) => b.addEventListener('click', () => {
    const s = A.byId[b.dataset.id];
    sfx.click();
    closeModal(true);
    G.busy = false;
    moveTo(s.x, s.z, s);
  }));
  box.querySelector('#cpClose').addEventListener('click', () => { sfx.click(); closeModal(); });
  openModal(box, { cls: 'dim', onClose: () => { G.busy = false; } });
}

// ───────────────────────── 도착
function arrive(s) {
  const W = A.world;
  G.busy = true;
  if (G.visited.has(s.id)) return showCard(s, { review: true });
  G.visited.add(s.id);
  const isNew = store.visit(s.id);
  if (isNew) G.newCards++;
  const isMission = G.mission === s;
  W.follow = null;
  W.flyTo({ x: s.x, y: W.peakY(s.x, s.z), z: s.z }, Math.min(Math.max(W.camDist(), 70), 120), { dur: 0.8 });
  const y = W.peakY(s.x, s.z);
  setTimeout(() => {
    W.addLandmark(s, landmarkType(s), { pop: true, scale: s.cluster ? 0.75 : 1 });
    sfx.pop();
    const sp = screenPos(s.x, y + 4, s.z);
    burst(sp.x, sp.y, 34);
    if (isMission) {
      G.done++;
      sfx.arrive();
      floatText(sp.x, sp.y - 50, '목적지 도착!', 'big');
      addScore(150, { x: s.x, y: y + 6, z: s.z });
    } else {
      floatText(sp.x, sp.y - 50, '새 장소 발견!', 'big alt');
      addScore(60, { x: s.x, y: y + 6, z: s.z });
    }
    refreshMarkers();
    updHud();
  }, 650);
  setTimeout(() => showCard(s, { isNew }), 1500);
}

function showCard(s, { review = false, isNew = false } = {}) {
  const card = cardShell(s, `<div class="mc-back big"><span>?</span></div>`, 'enter');
  const wrap = h(`<div class="card-wrap">${isNew ? '<div class="sticker">NEW 카드!</div>' : ''}</div>`);
  wrap.appendChild(card);
  openModal(wrap, { cls: 'dim' });
  const actions = review
    ? `<button class="btn primary" data-a="close">닫기</button>`
    : `<button class="btn primary" data-a="quiz">문제 풀기 <small>정답 +${G.cfg.bonus}걸음</small></button>`;
  setTimeout(() => flip(card, () => {
    card.innerHTML = siteFront(s, { actions });
    sfx.flip();
    card.querySelector('[data-a]').addEventListener('click', (e) => {
      sfx.click();
      if (e.currentTarget.dataset.a === 'close') { closeModal(true); afterCard(null); return; }
      const { q, i } = pickQuiz(s, G.level, G.usedQ);
      G.usedQ.add(s.id + ':' + i);
      runQuiz(card, q, {
        tag: s.name,
        onAnswer: (ok) => {
          G.answered++;
          if (ok) {
            G.correct++; G.combo++; G.maxCombo = Math.max(G.maxCombo, G.combo);
            store.markQuiz(s.id, i);
            const pts = Math.round((80 + 40 * G.level) * (1 + Math.min(G.combo - 1, 5) * 0.2));
            addScore(pts);
            addSteps(G.cfg.bonus);
            const sb = $('.h-steps').getBoundingClientRect();
            floatText(sb.left + sb.width / 2, sb.bottom + 10, `+${G.cfg.bonus} 걸음`, 'steps');
            if (G.combo >= 2) sfx.combo(G.combo);
          } else G.combo = 0;
          setCombo();
        },
        doneLabel: '탐험 계속',
        onDone: () => { closeModal(true); afterCard(s); },
      });
    });
  }), review ? 120 : 380);
}

function afterCard(s) {
  if (G.ended) return;
  const W = A.world;
  if (s && G.mission === s) { G.mission = null; G.hint = false; updBeacon(true); }
  updHud();
  W.follow = W.pawn.group;
  if (G.done >= G.goal) return setTimeout(() => finish(true), 400);
  if (G.steps < 1) return outOfSteps();
  if (!G.mission) return setTimeout(drawCards, 450);
  G.busy = false;
}

// ───────────────────────── 찬스 카드 (종합 문제)
function spawnToken() {
  const W = A.world;
  const p = W.pawn ? W.pawn.group.position : { x: 0, z: 0 };
  for (let tries = 0; tries < 400; tries++) {
    const x = (Math.random() - 0.5) * 560, z = (Math.random() - 0.5) * 560;
    const k = W.cell(x, z);
    if (k < 0 || W.sea[k] || !W.nk[k] || W.lvl[k] >= 6) continue;
    if (A.sites.some((s) => Math.hypot(s.x - x, s.z - z) < 16)) continue;
    if (Math.hypot(p.x - x, p.z - z) < 35) continue;
    if (G.tokens.some((t) => Math.hypot(t.x - x, t.z - z) < 70)) continue;
    const obj = W.makeStarToken(x, z);
    const t = { x, z, obj };
    const u = (dt, time) => { obj.userData.star.rotation.y = time * 2; obj.userData.star.position.y = 3.4 + Math.sin(time * 3 + x) * 0.5; };
    u.tok = true;
    W.updaters.push(u);
    t.u = u;
    G.tokens.push(t);
    return;
  }
}
function hitToken(t) {
  const W = A.world;
  G.busy = true;
  G.tokens = G.tokens.filter((q) => q !== t);
  W.updaters = W.updaters.filter((u) => u !== t.u);
  const sp = screenPos(t.x, W.peakY(t.x, t.z) + 4, t.z);
  burst(sp.x, sp.y, 30, { colors: ['#ffd166', '#fff3a6', '#ffb300'] });
  sfx.chance();
  W.tween(0.35, (k) => t.obj.scale.setScalar(Math.max(0.001, 1 - k)), () => W.scene.remove(t.obj));
  setTimeout(() => openChance(), 450);
}
function openChance() {
  const { g, i } = pickGeneral(G.level, G.usedG);
  G.usedG.add(i);
  const card = h(`<div class="gcard chance enter"><div class="ch-front">
    <div class="ch-star">★</div><div class="ch-t">찬스 카드</div><div class="ch-topic">${esc(g.topic)}</div>
    <p class="ch-d">종합 문제를 맞히면 <b>+25걸음</b>과 <b>보너스 점수</b>를 받습니다.</p>
    <div class="gc-actions"><button class="btn gold" id="chGo">도전하기</button></div></div></div>`);
  openModal(h('<div class="card-wrap"></div>'), { cls: 'dim' }).appendChild(settle(card));
  card.querySelector('#chGo').addEventListener('click', () => {
    sfx.click();
    runQuiz(card, g, {
      tag: '찬스 · ' + g.topic, related: g.related,
      onAnswer: (ok) => {
        G.answered++;
        if (ok) {
          G.correct++; G.combo++; G.maxCombo = Math.max(G.maxCombo, G.combo);
          store.markGeneral(i);
          addScore(200); addSteps(25);
          const sb = $('.h-steps').getBoundingClientRect();
          floatText(sb.left + sb.width / 2, sb.bottom + 10, '+25 걸음', 'steps');
        } else G.combo = 0;
        setCombo();
      },
      doneLabel: '탐험 계속',
      onDone: () => { closeModal(true); spawnToken(); afterCard(null); },
    });
  });
}

// ───────────────────────── 끝
function outOfSteps() {
  if (G.ended) return;
  G.busy = true;
  sfx.lose();
  shake(1);
  toast('걸음을 모두 사용했습니다', 'warn');
  setTimeout(() => finish(false), 1200);
}
function confirmExit() {
  if (G.ended) return;
  sfx.click();
  const wasBusy = G.busy;
  G.busy = true;
  const box = h(`<div class="confirm"><b>탐험을 마칠까요?</b><p>지금까지의 점수로 결과를 봅니다.</p>
    <div class="gc-actions"><button class="btn ghost" id="cNo">계속 탐험</button><button class="btn primary" id="cYes">결과 보기</button></div></div>`);
  box.querySelector('#cNo').addEventListener('click', () => { sfx.click(); closeModal(); });
  box.querySelector('#cYes').addEventListener('click', () => { sfx.click(); closeModal(true); finish(false, true); });
  openModal(box, { cls: 'dim', onClose: () => { G.busy = wasBusy; } });
}
function finish(success, quit = false) {
  if (G.ended) return;
  const res = {
    mode: 'explore', level: G.level, success, quit,
    base: G.score, bonus: success ? 500 + Math.round(G.steps) * 5 : 0,
    done: G.done, goal: G.goal, correct: G.correct, answered: G.answered, maxCombo: G.maxCombo,
    newCards: G.newCards, steps: Math.round(G.steps), visited: G.visited.size,
  };
  res.score = res.base + res.bonus;
  const acc = res.answered ? res.correct / res.answered : 0;
  res.stars = success ? (acc >= 0.8 ? 3 : 2) : (res.done >= res.goal / 2 ? 1 : 0);
  const cb = G.onFinish;
  stopExplore();
  cb && cb(res);
}

// ───────────────────────── 매 프레임: 나침반·미리보기
function frame() {
  if (!G || G.ended) return;
  const W = A.world, comp = $('#compass');
  const m = G.mission;
  const show = m && (G.cfg.compass || G.hint);
  if (comp) comp.classList.toggle('off', !show);
  if (show) {
    const p = W.pawn.group.position;
    const dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz);
    const cam = W.camera.position, t = W.controls.target;
    const yaw = Math.atan2(t.x - cam.x, -(t.z - cam.z));
    const ang = Math.atan2(dx, -dz) - yaw;
    comp.querySelector('.needle').style.transform = `rotate(${ang}rad)`;
    comp.querySelector('.dial').style.transform = `rotate(${-yaw}rad)`;
    $('#cDist').innerHTML = `<b>${Math.round(d)}km</b><span>${Math.ceil(d / KM_PER_STEP)}걸음</span>`;
  }
}

function hidePreview() { if (preview) preview.visible = false; if (previewLbl) previewLbl.style.display = 'none'; }
function onHover(x, y) {
  if (!G || G.busy || G.ended) { hidePreview(); return; }
  const W = A.world;
  const p = W.pick(x, y);
  if (!p) { hidePreview(); return; }
  if (!preview) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(64 * 3), 3));
    preview = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: '#ffffff', dashSize: 2.2, gapSize: 1.6, transparent: true, opacity: 0.95, depthTest: false }));
    preview.renderOrder = 10;
    W.scene.add(preview);
    previewLbl = h('<div class="pv"></div>');
    $('#fx').appendChild(previewLbl);
  }
  const s = W.pawn.group.position;
  const pos = preview.geometry.attributes.position;
  for (let i = 0; i < 64; i++) {
    const k = i / 63, xx = s.x + (p.x - s.x) * k, zz = s.z + (p.z - s.z) * k;
    pos.setXYZ(i, xx, W.surfaceY(xx, zz) + 0.8 + Math.sin(k * Math.PI) * 3, zz);
  }
  pos.needsUpdate = true;
  preview.geometry.computeBoundingSphere();
  preview.computeLineDistances();
  preview.visible = true;
  const km = Math.hypot(p.x - s.x, p.z - s.z), cost = Math.ceil(km / KM_PER_STEP);
  previewLbl.style.display = '';
  previewLbl.className = 'pv' + (p.sea ? ' bad' : cost > G.steps ? ' warn' : '');
  previewLbl.textContent = p.sea ? '바다' : `${cost}걸음`;
  previewLbl.style.left = x + 'px'; previewLbl.style.top = y + 'px';
  preview.material.color.set(p.sea ? '#ff8a8a' : cost > G.steps ? '#ffd166' : '#ffffff');
}

export { LEVEL_NAME };
