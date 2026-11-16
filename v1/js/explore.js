// 탐험 비행 모드
import * as THREE from 'three';
import { MISSIONS, FREE_FLIGHT, RIDDLES, LEVELS } from './data.js';
import { makeBeacon } from './world.js';
import { sfx, engineStart, engineStop, engineUpdate } from './audio.js';
import { store, markVisited, markSolved, markGen, addBadge, setBest, visitedCount } from './store.js';
import {
  $, $$, esc, fmt, showHud, openModal, closeModal, toast, banner, popScore, shake, burst, sparkle,
  itemCardHTML, flipIn, runQuiz,
} from './ui.js';
import { worldToLonLat, distanceKm, bearingDeg } from '../../shared/geo.js';

const LV = { 1: '기초', 2: '보통', 3: '도전' };
const DRAIN = { 1: 0.55, 2: 0.9, 3: 1.25 };
const ASSIST = { 1: 1, 2: 0.6, 3: 0.3 };
const HINT_AFTER = { 1: 12, 2: 22, 3: 35 };

export function createExplore(G) {
  const { world, plane, camera } = G;
  let S = null;
  const v3 = new THREE.Vector3();

  // 묶음(cluster) 정보
  const clusters = new Map();
  for (const s of G.sites) {
    if (!s.cluster) continue;
    if (!clusters.has(s.cluster)) clusters.set(s.cluster, { name: s.cluster, sites: [], x: 0, z: 0, r: 0 });
    clusters.get(s.cluster).sites.push(s);
  }
  for (const c of clusters.values()) {
    c.x = c.sites.reduce((a, s) => a + s.x, 0) / c.sites.length;
    c.z = c.sites.reduce((a, s) => a + s.z, 0) / c.sites.length;
    c.r = Math.max(...c.sites.map((s) => Math.hypot(s.x - c.x, s.z - c.z))) + 5;
  }

  const minimap = setupMinimap();

  function start(missionId, level) {
    stop();
    const mission = missionId === 'free' ? FREE_FLIGHT : MISSIONS.find((m) => m.id === missionId) || MISSIONS[0];
    S = {
      mission, level, free: mission.id === 'free', targets: mission.sites.map((id) => G.siteById[id]),
      idx: 0, score: 0, combo: 0, maxCombo: 0, correct: 0, answered: 0, bonusOk: 0, fuel: 100, empty: false,
      lowWarned: false, time: 0, legTime: 0, legDist: 1, visitedRun: new Set(), usedGen: new Set(),
      beacon: null, gate: null, busy: true, cluster: null, slowNote: false, started: false, newFound: 0,
    };
    G.state = 'explore';
    G.paused = false;
    world.setFog(80, 330);
    world.clouds.visible = true;
    world.setMarkersVisible(true);
    G.setLabelMode({ sites: level === 1 ? 'all' : level === 2 ? 'near' : 'visited', prov: level < 3, provLines: level === 1 });

    // 출발 위치: 첫 목적지에서 지도 가운데 쪽으로 40km
    let sx = 0, sz = 0, yaw = 0;
    if (S.free) {
      const p = G.siteById.pyongyang;
      sx = p.x - 30; sz = p.z + 10; yaw = Math.atan2(-(p.x - sx), -(p.z - sz)) + 0.6;
    } else {
      const t0 = S.targets[0];
      const dx = -t0.x, dz = -t0.z, L = Math.hypot(dx, dz) || 1;
      sx = t0.x + dx / L * 42; sz = t0.z + dz / L * 42;
      yaw = Math.atan2(-(t0.x - sx), -(t0.z - sz));
    }
    plane.place(sx, sz, yaw, 9);
    plane.speed = 0;
    plane.mesh.visible = true;
    G.setCamMode('chase', true);

    $('#hx-mname').textContent = mission.name;
    $('#hx-level').textContent = LV[level];
    $('#hx-level').className = 'lv-chip l' + level;
    buildProgress();
    updateScore(0);
    showHud('hud-explore');
    G.showTouch(true);
    briefing();
  }

  function briefing() {
    const m = S.mission;
    const html = `
      <div class="brief" style="--mc:${m.color}">
        <div class="brief-kicker">${S.free ? '자유 비행' : '미션 브리핑'} · ${LV[S.level]}</div>
        <h2 class="brief-title">${esc(m.name)}</h2>
        <p class="brief-desc">${esc(m.desc)}</p>
        ${S.free ? '' : `<div class="brief-route">${S.targets.map((s, i) => `<span class="br-dot">${i + 1}</span>`).join('<i></i>')}</div>`}
        <ul class="brief-tips">
          ${S.free ? '<li>보석 표시가 있는 곳으로 날아가면 장소 카드가 열립니다.</li>' : '<li>수수께끼 힌트와 화살표를 따라 빛 기둥으로 날아갑니다.</li><li>금색 고리는 보너스 관문입니다. 통과하면 종합 문제가 나옵니다.</li>'}
          <li>문제를 맞히면 연료가 채워집니다. 연료가 떨어지면 느려집니다.</li>
        </ul>
        <div class="brief-ctl">${G.touchUI ? '<div><b>왼쪽 조이스틱</b> 선회·상승·하강</div><div><b>가속 버튼</b> 빠르게 날기</div>' : '<div><b>W S</b><b>↑ ↓</b> 상승·하강</div><div><b>A D</b><b>← →</b> 선회</div><div><b>Shift</b> 가속</div>'}</div>
        <button class="btn primary big brief-go">출발!</button>
      </div>`;
    const md = openModal(html, 'brief-modal');
    $('.brief-go', md).onclick = () => {
      sfx.start();
      closeModal(md);
      go();
    };
  }

  function go() {
    S.busy = false;
    S.started = true;
    engineStart();
    banner('출발!', S.free ? '자유 비행' : S.mission.name, 'go');
    plane.speed = 6;
    if (S.free) setFreeHud();
    else setTarget(0);
  }

  function buildProgress() {
    const el = $('#hx-progress');
    if (S.free) { el.innerHTML = `<span class="free-count">발견 <b id="hx-found">${visitedCount()}</b>/43</span>`; return; }
    el.innerHTML = S.targets.map((s, i) => `<span class="pg-dot" data-i="${i}"></span>`).join('');
  }

  function refreshProgress() {
    if (S.free) { const f = $('#hx-found'); if (f) f.textContent = visitedCount(); return; }
    $$('#hx-progress .pg-dot').forEach((d, i) => {
      d.classList.toggle('done', i < S.idx);
      d.classList.toggle('cur', i === S.idx);
    });
  }

  function setTarget(i) {
    S.idx = i;
    if (S.beacon) { G.scene.remove(S.beacon); S.beacon = null; }
    refreshProgress();
    if (i >= S.targets.length) return;
    const t = S.targets[i];
    const small = !!t.cluster;
    S.beacon = makeBeacon(t.country === 'CHN' ? '#ff7a9a' : '#ffd34a', small ? 1.0 : 1.7);
    S.beacon.position.set(t.x, world.floorAt(t.x, t.z), t.z);
    G.scene.add(S.beacon);
    const m = world.markers.get(t.id); if (m) m.visible = false;
    S.legTime = 0;
    S.legDist = Math.hypot(plane.pos.x - t.x, plane.pos.z - t.z);
    S.hintShown = false; S.nameShown = false;
    $('#hx-rtext').textContent = RIDDLES[t.id] || t.summary;
    $('#hx-rhint').innerHTML = '';
    $('#hx-riddle').classList.remove('pulse'); void $('#hx-riddle').offsetWidth; $('#hx-riddle').classList.add('pulse');
    $('#hx-riddle .rd-kicker span').textContent = `목적지 ${i + 1} / ${S.targets.length}`;
  }

  function setFreeHud() {
    $('#hx-riddle .rd-kicker span').textContent = '자유 비행';
    $('#hx-rtext').textContent = '보석 표시가 있는 곳으로 날아가면 장소 카드가 열립니다. 화살표는 가장 가까운 미발견 장소를 가리킵니다.';
    $('#hx-rhint').innerHTML = '';
  }

  function currentTarget() { return S && !S.free && S.idx < S.targets.length ? S.targets[S.idx] : null; }

  function nearestUnvisited() {
    let best = null, bd = 1e9;
    for (const s of G.sites) {
      if (store.visited[s.id] || S.visitedRun.has(s.id)) continue;
      const d = Math.hypot(s.x - plane.pos.x, s.z - plane.pos.z);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  function updateScore(add, sx, sy, label) {
    S.score += add;
    const el = $('#hx-score');
    el.textContent = fmt(S.score);
    if (add > 0) {
      el.parentElement.classList.remove('bump'); void el.offsetWidth; el.parentElement.classList.add('bump');
      if (sx != null) popScore(`+${fmt(add)}${label ? ' ' + label : ''}`, sx, sy, 'gold');
    }
    const c = $('#hx-combo');
    c.textContent = S.combo >= 2 ? `콤보 x${S.combo}` : '';
    c.classList.toggle('on', S.combo >= 2);
  }

  function setFuel(f) {
    S.fuel = THREE.MathUtils.clamp(f, 0, 100);
    const bar = $('#hx-fuel');
    bar.style.width = S.fuel + '%';
    bar.parentElement.parentElement.classList.toggle('low', S.fuel < 25);
    if (S.fuel <= 0 && !S.empty) {
      S.empty = true;
      sfx.fuelLow();
      toast('연료가 바닥났습니다. 속도가 줄어듭니다. 문제를 맞히면 다시 채워집니다.', 'warn');
    } else if (S.fuel > 0 && S.empty) S.empty = false;
    if (S.fuel < 25 && !S.lowWarned && S.fuel > 0) { S.lowWarned = true; sfx.fuelLow(); toast('연료가 얼마 남지 않았습니다', 'warn'); }
    if (S.fuel > 40) S.lowWarned = false;
  }

  function addFuel(n, x, y) {
    setFuel(S.fuel + n);
    const bar = $('#hx-fuel').parentElement;
    bar.classList.remove('fill'); void bar.offsetWidth; bar.classList.add('fill');
    if (x != null) popScore(`연료 +${n}`, x, y, 'teal');
  }

  // ---------- 도착 처리 ----------
  async function arrive(site, isTarget) {
    if (S.busy) return;
    S.busy = true;
    G.paused = true;
    S.visitedRun.add(site.id);
    sfx.arrive();
    const cx = innerWidth / 2, cy = innerHeight * 0.42;
    burst(cx, cy, 90);
    shake(0.35);
    banner(isTarget ? '도착!' : '발견!', esc(site.name), 'arrive', 1200);
    let pts = isTarget ? 100 : 60;
    if (isTarget) {
      const expect = S.legDist / 11 * 1.8 + 6;
      pts += Math.max(0, Math.round(80 * (1 - S.legTime / expect)));
    }
    updateScore(pts, cx, cy + 50, '도착');
    addFuel(15);
    const isNew = markVisited(site.id);
    if (isNew) S.newFound++;
    G.refreshSiteLabel(site.id);
    refreshProgress();
    await wait(650);

    // 카드
    await new Promise((res) => {
      const html = `
        <div class="arrive">
          <div class="arrive-top ${isNew ? 'new' : ''}">${isNew ? '도감에 새 장소 등록' : '도감에 있는 장소'}</div>
          ${itemCardHTML(site, { flip: true })}
          <div class="arrive-btns"><button class="btn primary big arr-go">문제 풀기</button></div>
        </div>`;
      const md = openModal(html, 'card-modal');
      flipIn(md);
      if (isNew) setTimeout(() => sparkle(innerWidth / 2, innerHeight * 0.2, 30), 500);
      $('.arr-go', md).onclick = () => { sfx.click(); closeModal(md); res(); };
    });

    // 문제
    const pool = site.quizzes.map((q, i) => ({ q, i })).filter((o) => o.q.level === S.level);
    const fresh = pool.filter((o) => !store.solved[site.id + ':' + o.i]);
    const pick = (fresh.length ? fresh : pool)[Math.floor(Math.random() * (fresh.length ? fresh : pool).length)];
    const r = await runQuiz(pick.q, {
      title: site.name,
      onAnswer: (ok, rect) => onAnswer(ok, rect, 200),
    });
    if (r.correct) markSolved(site.id, pick.i);

    if (isTarget) {
      const nextIdx = S.idx + 1;
      if (nextIdx >= S.targets.length) { finish(); return; }
      setTarget(nextIdx);
      if (nextIdx % 2 === 0) spawnGate();
    }
    G.paused = false;
    S.busy = false;
    S.cooldown = 1.0;
  }

  function onAnswer(ok, rect, base) {
    S.answered++;
    const x = rect.left + rect.width / 2, y = rect.top;
    if (ok) {
      S.correct++;
      S.combo++;
      S.maxCombo = Math.max(S.maxCombo, S.combo);
      const mult = Math.min(2, 1 + 0.25 * (S.combo - 1));
      updateScore(Math.round(base * mult), x, y - 10, S.combo >= 2 ? `콤보 x${S.combo}` : '정답');
      addFuel(base > 200 ? 60 : 40, x, y + 30);
      if (S.combo === 5 && addBadge('b_combo')) toast('배지 획득: 연속 정답 5', 'badge');
    } else {
      S.combo = 0;
      updateScore(0);
    }
  }

  // ---------- 보너스 관문 ----------
  function spawnGate() {
    removeGate();
    const t = currentTarget(); if (!t) return;
    const p = plane.pos;
    const k = 0.5;
    const gx = p.x + (t.x - p.x) * k, gz = p.z + (t.z - p.z) * k;
    let gy = 0;
    for (let s = 0.3; s <= 0.7; s += 0.1) gy = Math.max(gy, world.floorAt(p.x + (t.x - p.x) * s, p.z + (t.z - p.z) * s));
    const g = new THREE.Group();
    const ringMat = new THREE.MeshStandardMaterial({ color: '#ffcf3a', emissive: '#ff9a1a', emissiveIntensity: 0.9, metalness: 0.4, roughness: 0.3, flatShading: true });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.42, 8, 32), ringMat);
    const glow = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.9, 8, 32), new THREE.MeshBasicMaterial({ color: '#ffd76a', transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false }));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(4.2, 32), new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    const studs = new THREE.Group();
    for (let a = 0; a < 8; a++) {
      const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.45), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      st.position.set(Math.cos(a / 8 * Math.PI * 2) * 4.6, Math.sin(a / 8 * Math.PI * 2) * 4.6, 0);
      studs.add(st);
    }
    g.add(ring, glow, disc, studs);
    g.position.set(gx, gy + 10, gz);
    g.rotation.y = Math.atan2(-(t.x - p.x), -(t.z - p.z));
    G.scene.add(g);
    const lbl = G.labels.add('<b>보너스 관문</b>', new THREE.Vector3(gx, gy + 16, gz), { cls: 'lbl-gate', maxDist: 400, group: 'gate' });
    const anim = world.addAnim((dt, t2) => {
      studs.rotation.z = t2 * 0.8;
      disc.material.opacity = 0.1 + Math.sin(t2 * 4) * 0.05;
      g.position.y = gy + 10 + Math.sin(t2 * 1.4) * 0.8;
      lbl.pos.y = g.position.y + 6;
    });
    S.gate = { g, lbl, anim };
    toast('<b>보너스 관문</b>이 나타났습니다. 금색 고리를 통과해 보십시오.', 'gold');
  }

  function removeGate() {
    if (!S || !S.gate) return;
    G.scene.remove(S.gate.g);
    G.labels.remove(S.gate.lbl);
    world.removeAnim(S.gate.anim);
    S.gate = null;
  }

  async function passGate() {
    if (S.busy) return;
    S.busy = true; G.paused = true;
    removeGate();
    sfx.bonus();
    burst(innerWidth / 2, innerHeight / 2, 120, { colors: ['#ffcf3a', '#fff3b0', '#ff9a1a', '#ffffff'] });
    shake(0.4);
    banner('보너스 관문 통과!', '종합 문제', 'gold', 1100);
    await wait(900);
    const ids = new Set(S.targets.map((s) => s.id));
    const cand = G.content.general.map((g, i) => ({ g, i })).filter((o) => !S.usedGen.has(o.i));
    let pool = cand.filter((o) => o.g.level === S.level && o.g.related.some((r) => ids.has(r)));
    if (!pool.length) pool = cand.filter((o) => o.g.level === S.level);
    if (!pool.length) pool = cand;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    S.usedGen.add(pick.i);
    const r = await runQuiz(pick.g, {
      bonus: true, title: pick.g.topic, okText: '정답! 보너스 획득',
      onAnswer: (ok, rect) => { onAnswer(ok, rect, 300); if (ok) S.bonusOk++; },
    });
    if (r.correct) markGen(pick.i);
    G.paused = false; S.busy = false; S.cooldown = 1;
  }

  // ---------- 묶음 목록 ----------
  function showCluster(c) {
    if (S.cluster === c) return;
    S.cluster = c;
    const el = $('#hx-cluster');
    if (!c) { el.classList.remove('show'); return; }
    el.innerHTML = `<div class="cl-head"><b>${esc(c.name)}</b><span>장소 ${c.sites.length}곳이 모여 있습니다</span></div>
      <div class="cl-list">${c.sites.map((s) => `<button class="cl-item ${store.visited[s.id] ? 'seen' : ''}" data-id="${s.id}"><span class="cl-dot ${s.type}"></span>${esc(s.name)}</button>`).join('')}</div>`;
    el.classList.add('show');
    $$('.cl-item', el).forEach((b) => {
      b.onclick = () => { sfx.click(); const s = G.siteById[b.dataset.id]; showCluster(null); S.clusterLock = c; arrive(s, false); };
    });
    sfx.coin();
  }

  // ---------- 매 프레임 ----------
  function update(dt, t) {
    if (!S) return;
    if (G.paused || S.busy) {
      plane.idle(dt, t);
      engineUpdate(0.2, false);
      return;
    }
    S.time += dt; S.legTime += dt;
    S.cooldown = Math.max(0, (S.cooldown || 0) - dt);
    const input = G.readInput();
    const tgt = currentTarget();
    let slow = S.empty ? 0.55 : 1;
    if (tgt && tgt.cluster) {
      const d = Math.hypot(tgt.x - plane.pos.x, tgt.z - plane.pos.z);
      if (d < 16) {
        slow *= 0.55;
        if (!S.slowNote) { S.slowNote = true; toast('장소가 가까이 모여 있어 속도를 줄입니다'); }
      }
    }
    const ev = plane.update(dt, input, { base: 11, boostMul: 2.3, slowMul: slow, canBoost: !S.empty, assist: ASSIST[S.level] });
    if (ev.bumped) { sfx.bump(); shake(0.45); }
    if (ev.edge) toast('탐사 구역의 끝입니다. 안쪽으로 돌아갑니다.');
    if (plane.boosting && !S.wasBoost) sfx.whoosh();
    S.wasBoost = plane.boosting;
    $('#speedlines').classList.toggle('on', plane.boosting);
    engineUpdate(Math.min(1, plane.speed / 25), plane.boosting);
    setFuel(S.fuel - DRAIN[S.level] * dt * (plane.boosting ? 2 : 1));

    // 목적지 도착
    if (tgt && S.cooldown <= 0) {
      const d = Math.hypot(tgt.x - plane.pos.x, tgt.z - plane.pos.z);
      const r = tgt.cluster ? 2.6 : 5.5;
      if (d < r) { arrive(tgt, true); return; }
      if (!S.hintShown && S.legTime > HINT_AFTER[S.level]) {
        S.hintShown = true;
        $('#hx-rhint').innerHTML = `<b>힌트</b> ${esc(tgt.region)}`;
        sfx.tick();
      }
      if (!S.nameShown && d < 28) {
        S.nameShown = true;
        $('#hx-rhint').innerHTML = `<b>가까워졌습니다</b> ${esc(tgt.name)}`;
        sfx.coin();
      }
    }

    // 보너스 관문
    if (S.gate && plane.pos.distanceTo(S.gate.g.position) < 5) { passGate(); return; }

    // 자유롭게 닿은 장소 / 묶음
    if (S.cooldown <= 0) {
      let inCluster = null;
      for (const c of clusters.values()) {
        if (Math.hypot(c.x - plane.pos.x, c.z - plane.pos.z) < c.r) { inCluster = c; break; }
      }
      if (inCluster && tgt && tgt.cluster === inCluster.name) inCluster = null;
      if (S.clusterLock && S.clusterLock !== inCluster) S.clusterLock = null;
      showCluster(inCluster && inCluster !== S.clusterLock ? inCluster : null);
      if (!inCluster) {
        for (const s of G.sites) {
          if (s.cluster || s === tgt || S.visitedRun.has(s.id)) continue;
          if (Math.hypot(s.x - plane.pos.x, s.z - plane.pos.z) < 4.5) { arrive(s, false); return; }
        }
      }
    }
    hud(tgt);
  }

  // ---------- HUD 갱신 ----------
  function hud(tgt) {
    const guide = tgt || (S.free ? nearestUnvisited() : null);
    const arrow = $('#hx-arrow');
    if (guide) {
      const dkm = Math.hypot(guide.x - plane.pos.x, guide.z - plane.pos.z);
      $('#hx-dist').textContent = `${dkm < 10 ? dkm.toFixed(1) : Math.round(dkm)}km`;
      placeIndicator(arrow, v3.set(guide.x, world.floorAt(guide.x, guide.z) + (guide.cluster ? 5 : 9), guide.z), dkm, tgt ? '' : guide.name);
    } else {
      arrow.style.display = 'none';
      $('#hx-dist').textContent = '';
    }
    const ga = $('#hx-gate-arrow');
    if (S.gate) placeIndicator(ga, S.gate.g.position, plane.pos.distanceTo(S.gate.g.position), '보너스');
    else ga.style.display = 'none';
    const heading = ((-plane.yaw * 180 / Math.PI) % 360 + 360) % 360;
    let tb = null;
    if (guide) {
      const a = worldToLonLat(plane.pos.x, plane.pos.z);
      tb = bearingDeg(a.lat, a.lon, guide.lat, guide.lon);
    }
    drawCompass(heading, tb);
    minimap.draw(plane, guide, S.gate ? S.gate.g.position : null);
    $('#hx-speed').textContent = Math.round(plane.speed * 18) + ' km/h';
  }

  function placeIndicator(el, wp, dkm, label) {
    el.style.display = 'block';
    v3.copy(wp).project(camera);
    let x = v3.x, y = v3.y;
    const behind = v3.z > 1;
    if (behind) { x = -x; y = -y; if (Math.abs(y) < 0.5) y = -0.9; }
    const mx = 0.88, my = 0.78;
    const on = !behind && Math.abs(x) < mx && Math.abs(y) < my;
    let rot;
    if (on) rot = 90;
    else {
      const a = Math.atan2(y, x);
      const s = Math.min(mx / Math.abs(Math.cos(a) || 1e-6), my / Math.abs(Math.sin(a) || 1e-6));
      x = Math.cos(a) * s; y = Math.sin(a) * s;
      rot = -a * 180 / Math.PI;
    }
    const px = (x * 0.5 + 0.5) * innerWidth, py = (-y * 0.5 + 0.5) * innerHeight;
    el.style.transform = `translate(${px.toFixed(1)}px,${py.toFixed(1)}px)`;
    el.classList.toggle('onscreen', on);
    el.querySelector('.ea-arrow').style.transform = `translate(-50%,-50%) rotate(${rot}deg)`;
    el.querySelector('.ea-dist').textContent = (label ? label + ' ' : '') + (dkm < 10 ? dkm.toFixed(1) : Math.round(dkm)) + 'km';
  }

  const cmp = $('#hx-cmp');
  const cctx = cmp.getContext('2d');
  const DIRS = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
  function drawCompass(heading, target) {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const W = cmp.clientWidth, H = cmp.clientHeight;
    if (cmp.width !== Math.round(W * dpr) || cmp.height !== Math.round(H * dpr)) { cmp.width = Math.round(W * dpr); cmp.height = Math.round(H * dpr); }
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cctx.clearRect(0, 0, W, H);
    const ppd = W / 150;
    cctx.textAlign = 'center';
    for (let d = Math.ceil((heading - 80) / 15) * 15; d <= heading + 80; d += 15) {
      const x = W / 2 + (d - heading) * ppd;
      const dd = ((d % 360) + 360) % 360;
      const major = dd % 45 === 0;
      cctx.fillStyle = 'rgba(255,255,255,0.7)';
      cctx.fillRect(x - 0.5, H - (major ? 10 : 6), 1, major ? 10 : 6);
      if (major) {
        cctx.font = `${dd === 0 ? 900 : 700} ${dd % 90 === 0 ? 14 : 11}px "Do Hyeon", sans-serif`;
        cctx.fillStyle = dd === 0 ? '#ff6b5a' : '#ffffff';
        cctx.fillText(DIRS[dd / 45], x, H - 13);
      }
    }
    if (target != null) {
      let diff = ((target - heading + 540) % 360) - 180;
      const x = W / 2 + THREE.MathUtils.clamp(diff, -72, 72) * ppd;
      cctx.fillStyle = '#ffd34a';
      cctx.beginPath(); cctx.moveTo(x - 6, 0); cctx.lineTo(x + 6, 0); cctx.lineTo(x, 8); cctx.closePath(); cctx.fill();
    }
  }

  function setupMinimap() {
    const cv = $('#hx-mini');
    const ctx = cv.getContext('2d');
    const img = new Image();
    img.src = G.base + '/colormap.jpg';
    const off = document.createElement('canvas');
    let ready = false;
    img.onload = () => { off.width = 300; off.height = 302; off.getContext('2d').drawImage(img, 0, 0, 300, 302); ready = true; };
    return {
      draw(pl, guide, gatePos) {
        const dpr = Math.min(2, devicePixelRatio || 1);
        const W = cv.clientWidth, H = cv.clientHeight;
        if (!W) return;
        if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        ctx.save();
        ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2 - 1, 0, Math.PI * 2); ctx.clip();
        if (ready) ctx.drawImage(off, 0, 0, W, H); else { ctx.fillStyle = '#244'; ctx.fillRect(0, 0, W, H); }
        const map = (x, z) => [(x / G.WORLD_W + 0.5) * W, (z / G.WORLD_H + 0.5) * H];
        for (const s of G.sites) {
          if (!store.visited[s.id]) continue;
          const [x, y] = map(s.x, s.z);
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
        }
        if (gatePos) {
          const [x, y] = map(gatePos.x, gatePos.z);
          ctx.strokeStyle = '#ffcf3a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.stroke();
        }
        if (guide) {
          const [x, y] = map(guide.x, guide.z);
          const k = (performance.now() / 600) % 1;
          ctx.strokeStyle = `rgba(255,211,74,${1 - k})`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(x, y, 3 + k * 9, 0, 7); ctx.stroke();
          ctx.fillStyle = '#ffd34a'; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fill();
        }
        const [px, py] = map(pl.pos.x, pl.pos.z);
        ctx.translate(px, py); ctx.rotate(-pl.yaw);
        ctx.fillStyle = '#ff5a4e'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2 - 1, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#ff6b5a'; ctx.font = '700 11px "Do Hyeon", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('북', W / 2, 12);
      },
    };
  }

  // ---------- 끝 ----------
  function finish(early = false) {
    if (!S) return;
    const s = S;
    G.paused = true;
    engineStop();
    G.showTouch(false);
    const acc = s.answered ? s.correct / s.answered : 0;
    const stars = s.free ? Math.min(3, 1 + Math.floor(s.newFound / 3)) : (acc >= 0.85 ? 3 : acc >= 0.6 ? 2 : 1);
    const grade = s.free || early ? '' : (acc >= 0.95 ? 'S' : acc >= 0.8 ? 'A' : acc >= 0.6 ? 'B' : 'C');
    const badges = [];
    if (!s.free && !early && acc >= 0.7 && addBadge(s.mission.badge)) badges.push(s.mission.badge);
    const vc = visitedCount();
    if (vc >= 22 && addBadge('b_dex50')) badges.push('b_dex50');
    if (vc >= 43 && addBadge('b_dexall')) badges.push('b_dexall');
    if (s.maxCombo >= 5 && store.badges.b_combo) { /* 이미 획득 처리됨 */ }
    const key = `explore:${s.mission.id}:${s.level}`;
    const rec = early ? { isNew: false, prev: store.best[key] || 0 } : setBest(key, s.score);
    const mm = Math.floor(s.time / 60), ss = Math.floor(s.time % 60);
    const mid = s.mission.id;
    const lvl = s.level;
    banner(early ? '비행 종료' : '미션 완료!', '', 'go', 1300);
    if (!early) { sfx.fanfare(); burst(innerWidth / 2, innerHeight / 2, 150); }
    setTimeout(() => {
      stop();
      G.showResult({
        kicker: s.free ? '자유 비행 결과' : early ? '비행 기록' : '미션 완료',
        title: s.mission.name, color: s.mission.color, level: lvl,
        score: s.score, stars, grade, record: rec, badges,
        stats: [
          ['맞힌 문제', `${s.correct} / ${s.answered}`],
          ['정답률', `${Math.round(acc * 100)}%`],
          ['최대 콤보', `${s.maxCombo}`],
          ['보너스 관문', `${s.bonusOk}`],
          ['새로 등록한 장소', `${s.newFound}`],
          ['비행 시간', `${mm}분 ${String(ss).padStart(2, '0')}초`],
        ],
        retry: () => start(mid, lvl),
        other: () => G.openMissionSelect(lvl),
        otherLabel: '다른 미션',
      });
    }, early ? 300 : 1500);
  }

  function stop() {
    if (!S) return;
    if (S.beacon) G.scene.remove(S.beacon);
    removeGate();
    showCluster(null);
    for (const g of world.markers.values()) g.visible = true;
    engineStop();
    $('#speedlines').classList.remove('on');
    S = null;
  }

  return {
    start, update, stop, finish: () => finish(true),
    get active() { return !!S; },
    get free() { return S && S.free; },
    debugArrive() { const t = currentTarget(); if (t) { S.busy = false; S.cooldown = 0; arrive(t, true); } },
    debugGate() { if (S) { S.busy = false; spawnGate(); } },
    debugNext() {
      if (!S || S.busy) return 'busy';
      if (S.gate) { const g = S.gate.g.position; plane.pos.set(g.x, g.y, g.z); return 'gate'; }
      const t = currentTarget(); if (!t) return 'none';
      plane.pos.set(t.x + 0.5, world.floorAt(t.x, t.z) + 5, t.z + 0.5); return t.id;
    },
    debugSkipBrief() { closeModal($('.brief-modal')); go(); },
  };
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
