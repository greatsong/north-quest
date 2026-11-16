// 위치 맞히기 모드
import * as THREE from 'three';
import { makeBeacon } from './world.js';
import { sfx } from './audio.js';
import { store, markVisited, addBadge, setBest, visitedCount } from './store.js';
import { $, esc, fmt, showHud, toast, banner, popScore, shake, burst, sparkle, countUp, ICONS } from './ui.js';
import { worldToLonLat, distanceKm } from '../../shared/geo.js';
import { josa, eraList } from './data.js';

const LV = { 1: '기초', 2: '보통', 3: '도전' };
const TIME = { 1: 30, 2: 20, 3: 15 };
const K = { 1: 90, 2: 70, 3: 55 };
const ROUNDS = 10;

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

export function createGuess(G) {
  const { world, camera, scene } = G;
  let S = null;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  // 고른 위치 표시(조준 고리)
  const aim = new THREE.Group();
  {
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.2, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthTest: false }));
    const ring2 = new THREE.Mesh(new THREE.RingGeometry(3.4, 3.8, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff5a4e', transparent: true, opacity: 0.8, depthTest: false }));
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.6, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff5a4e', depthTest: false }));
    ring.renderOrder = ring2.renderOrder = dot.renderOrder = 10;
    aim.add(ring, ring2, dot);
    aim.userData = { ring2 };
    aim.visible = false;
    scene.add(aim);
  }

  function makeFlag() {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 9, 6), new THREE.MeshStandardMaterial({ color: '#f4efe6', flatShading: true }));
    pole.position.y = 4.5;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(4.2, -1.2); shape.lineTo(0, -2.6); shape.lineTo(0, 0);
    const cloth = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: '#ff5a4e', side: THREE.DoubleSide, flatShading: true, emissive: '#661a14' }));
    cloth.position.set(0.1, 9, 0);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), new THREE.MeshStandardMaterial({ color: '#ffcf3a', metalness: 0.5, roughness: 0.3 }));
    knob.position.y = 9.1;
    g.add(pole, cloth, knob);
    g.userData.cloth = cloth;
    return g;
  }

  function pickSites(level) {
    const all = shuffle([...G.sites]);
    let pool;
    if (level === 1) pool = [...all.filter((s) => s.fame === 3), ...all.filter((s) => s.fame === 2)];
    else if (level === 2) pool = shuffle(all.filter((s) => s.fame >= 2));
    else pool = [...all.filter((s) => s.fame === 1).slice(0, 5), ...all];
    const out = [], cl = {};
    for (const s of pool) {
      if (out.includes(s)) continue;
      if (s.cluster) { cl[s.cluster] = (cl[s.cluster] || 0) + 1; if (cl[s.cluster] > 2) continue; }
      out.push(s);
      if (out.length >= ROUNDS) break;
    }
    return shuffle(out);
  }

  function overview(dur = 1.4) {
    const fovV = camera.fov * Math.PI / 180;
    const fovH = 2 * Math.atan(Math.tan(fovV / 2) * camera.aspect);
    const need = Math.max(340 / Math.tan(fovV / 2), 330 / Math.tan(fovH / 2)) * 0.95;
    const tilt = 0.42;
    const tgt = new THREE.Vector3(0, 0, 18);
    const pos = new THREE.Vector3(0, Math.cos(tilt) * need, 18 + Math.sin(tilt) * need);
    G.tweenCam(pos, tgt, dur, 'orbit');
  }

  function start(level) {
    stop();
    S = {
      level, rounds: pickSites(level), i: -1, score: 0, phase: 'idle', pending: null, timeLeft: 0,
      results: [], objs: [], lastTick: 0,
    };
    G.state = 'guess';
    G.paused = false;
    G.plane.mesh.visible = false;
    world.setFog(3000, 6000);
    world.clouds.visible = false;
    world.setMarkersVisible(false);
    G.setLabelMode({ sites: 'none', prov: level < 3, provLines: level === 1 });
    showHud('hud-guess');
    G.showTouch(false);
    $('#gq-level').textContent = LV[level];
    $('#gq-level').className = 'lv-chip l' + level;
    $('#gq-score').textContent = '0';
    overview(1.6);
    setTimeout(() => next(), 900);
  }

  function next() {
    if (!S) return;
    clearRound();
    S.i++;
    if (S.i >= S.rounds.length) { finish(); return; }
    const site = S.rounds[S.i];
    S.site = site;
    S.pending = null;
    S.phase = 'aim';
    S.timeLeft = TIME[S.level];
    S.lastTick = Math.ceil(S.timeLeft);
    aim.visible = false;
    $('#gq-round').textContent = `${S.i + 1} / ${S.rounds.length}`;
    $('#gq-q').innerHTML = `<b>${esc(site.name)}</b>${josa(site.name, '은', '는')} 어디에 있을까요?`;
    let hint = '';
    if (S.level === 1) hint = `<span class="hint-chip">${ICONS.pin}${esc(site.region)}</span>`;
    else if (S.level === 2) hint = `<span class="hint-chip">${eraList(site).join('·')}</span><span class="hint-chip">${site.type === 'nature' ? '자연' : '역사'}</span>${site.country === 'CHN' ? '<span class="hint-chip chn">지금은 중국 땅</span>' : ''}`;
    else hint = '<span class="hint-chip dim">힌트 없음</span>';
    $('#gq-hint').innerHTML = hint;
    $('#gq-box').classList.remove('enter'); void $('#gq-box').offsetWidth; $('#gq-box').classList.add('enter');
    $('#gq-confirm').disabled = true;
    $('#gq-confirm').classList.add('show');
    $('#gq-result').classList.remove('show');
    $('#gq-timer').classList.remove('urgent');
    if (S.i > 0) overview(1.0);
    sfx.whoosh();
  }

  function clearRound() {
    if (!S) return;
    for (const o of S.objs) { if (o.isObject3D) scene.remove(o); else if (o.el) G.labels.remove(o); else if (typeof o === 'function') world.removeAnim(o); }
    S.objs = [];
  }

  // 지도 누르기
  let down = null;
  const cv = G.renderer.domElement;
  cv.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  cv.addEventListener('pointerup', (e) => {
    if (!S || S.phase !== 'aim' || !down || G.paused) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    if (moved > 8 || performance.now() - down.t > 600) return;
    const r = cv.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const p = world.pick(ray.ray);
    if (!p) return;
    S.pending = p;
    aim.position.copy(p); aim.position.y += 0.3;
    aim.visible = true;
    aim.scale.setScalar(1.6);
    $('#gq-confirm').disabled = false;
    sfx.pin();
  });

  async function confirm() {
    if (!S || S.phase !== 'aim') return;
    S.phase = 'reveal';
    $('#gq-confirm').classList.remove('show');
    const site = S.site;
    const ans = new THREE.Vector3(site.x, world.floorAt(site.x, site.z), site.z);
    let d = null, pts = 0;
    const timeFrac = S.timeLeft / TIME[S.level];
    if (S.pending) {
      const g = S.pending.clone();
      aim.visible = false;
      // 깃발 떨어지기
      const flag = makeFlag();
      flag.position.copy(g); flag.position.y += 40;
      flag.scale.setScalar(THREE.MathUtils.clamp(camera.position.distanceTo(g) / 320, 1, 2.2));
      scene.add(flag); S.objs.push(flag);
      sfx.flagFall();
      await tween(450, (k) => { flag.position.y = g.y + 40 * (1 - k * k); });
      flag.position.y = g.y;
      sfx.thud(); shake(0.6);
      dust(g, flag.scale.x);
      const wave = world.addAnim((dt, t) => { flag.userData.cloth.rotation.y = Math.sin(t * 5) * 0.25; });
      S.objs.push(wave);
      await wait(350);
      const ll = worldToLonLat(g.x, g.z);
      d = distanceKm(ll.lat, ll.lon, site.lat, site.lon);
      pts = d <= 5 ? 1000 : Math.round(1000 * Math.exp(-(d - 5) / K[S.level]));
      if (pts > 0 && d < 100) pts += Math.round(100 * timeFrac);
      // 정답 빛 기둥
      const bc = makeBeacon(site.country === 'CHN' ? '#ff7a9a' : '#ffd34a', Math.max(1.6, flag.scale.x * 1.4));
      bc.position.copy(ans);
      scene.add(bc); S.objs.push(bc);
      const ba = world.addAnim((dt, t) => bc.userData.update(t)); S.objs.push(ba);
      sfx.beam();
      await tween(500, (k) => { bc.scale.set(1, Math.max(0.01, k), 1); });
      // 호
      const mid = g.clone().lerp(ans, 0.5);
      const span = g.distanceTo(ans);
      mid.y = Math.max(g.y, ans.y) + span * 0.45 + 4;
      const curve = new THREE.QuadraticBezierCurve3(g.clone().setY(g.y + 9 * flag.scale.x), mid, ans.clone().setY(ans.y + 2));
      const pts3 = curve.getPoints(80);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts3), 80, Math.max(0.3, span * 0.008), 6, false),
        new THREE.MeshBasicMaterial({ color: '#fff3b0', transparent: true, opacity: 0.95, depthTest: false }));
      tube.renderOrder = 9;
      tube.geometry.setDrawRange(0, 0);
      scene.add(tube); S.objs.push(tube);
      const total = tube.geometry.index.count;
      const lbl = G.labels.add(`<b class="dist-num">0</b><small>km</small>`, mid.clone().setY(mid.y + 2), { cls: 'lbl-dist', maxDist: 5000, group: 'guess' });
      S.objs.push(lbl);
      const dn = lbl.el.querySelector('.dist-num');
      // 카메라가 두 점을 함께 보이게
      const fr = Math.max(95, span * 1.9);
      G.tweenCam(new THREE.Vector3(mid.x, ans.y + fr * 0.85, mid.z + fr * 0.55), new THREE.Vector3(mid.x, ans.y, mid.z), 1.1, 'orbit');
      let lastC = 0;
      await tween(900, (k) => {
        tube.geometry.setDrawRange(0, Math.floor(total * k / 3) * 3);
        dn.textContent = (d * k).toFixed(d < 10 ? 1 : 0);
        if (k - lastC > 0.06) { lastC = k; sfx.countUp(); }
      });
      dn.textContent = d < 10 ? d.toFixed(1) : Math.round(d);
      const sc = G.toScreen(ans);
      if (d < 10) { sfx.correct(); burst(sc.x, sc.y, 110); } else if (d < 40) { sfx.coin(); sparkle(sc.x, sc.y, 30); } else sfx.wrong();
      popScore(`+${fmt(pts)}`, sc.x, sc.y - 40, 'gold big');
      if (d <= 5 && addBadge('b_sharp')) toast('배지 획득: 위치 명사수', 'badge');
      if (d < 25 && markVisited(site.id)) toast(`도감에 등록: ${esc(site.name)}`, 'gold');
      G.refreshSiteLabel(site.id);
    } else {
      // 시간 초과
      const bc = makeBeacon('#8fb8ff', 2);
      bc.position.copy(ans); scene.add(bc); S.objs.push(bc);
      const ba = world.addAnim((dt, t) => bc.userData.update(t)); S.objs.push(ba);
      sfx.wrong();
      G.tweenCam(new THREE.Vector3(ans.x, ans.y + 120, ans.z + 80), ans.clone(), 1.1, 'orbit');
      await wait(800);
    }
    const lbl2 = G.labels.add(`<b>${esc(site.name)}</b>${site.country === 'CHN' ? '<em>지금은 중국 땅</em>' : ''}`, ans.clone().setY(ans.y + 3), { cls: 'lbl-answer', maxDist: 5000, group: 'guess' });
    S.objs.push(lbl2);
    S.score += pts;
    S.results.push({ site, d, pts });
    const sEl = $('#gq-score');
    countUp(sEl, S.score, 600);
    sEl.parentElement.classList.remove('bump'); void sEl.offsetWidth; sEl.parentElement.classList.add('bump');
    showResult(site, d, pts);
  }

  function rating(d) {
    if (d == null) return ['시간 초과', 'no'];
    if (d < 10) return ['정확합니다!', 'great'];
    if (d < 30) return ['아주 가깝습니다', 'good'];
    if (d < 80) return ['가깝습니다', 'ok'];
    if (d < 150) return ['조금 멉니다', 'meh'];
    return ['많이 벗어났습니다', 'no'];
  }

  function showResult(site, d, pts) {
    const [rt, rc] = rating(d);
    const el = $('#gq-result');
    el.innerHTML = `
      <div class="gr-top ${rc}"><span class="gr-rate">${rt}</span><span class="gr-pts">+${fmt(pts)}</span></div>
      <div class="gr-row"><div class="gr-km"><b>${d == null ? '-' : d < 10 ? d.toFixed(1) : Math.round(d)}</b><small>km 오차</small></div>
        <div class="gr-info"><h3>${esc(site.name)}</h3><div class="gr-region">${ICONS.pin}${esc(site.region)}${site.country === 'CHN' ? ' <em class="chn-tag">지금은 중국 땅</em>' : ''}</div></div></div>
      <p class="gr-sum">${esc(site.summary)}</p>
      ${site.approx ? '<p class="gr-approx">넓은 지역이거나 위치가 추정이라 대략적인 위치입니다.</p>' : ''}
      <button class="btn primary gr-next">${S.i + 1 >= S.rounds.length ? '결과 보기' : '다음 문제'}</button>`;
    el.classList.add('show');
    const b = el.querySelector('.gr-next');
    b.onclick = () => { sfx.click(); el.classList.remove('show'); next(); };
    setTimeout(() => b.focus(), 30);
  }

  function dust(p, s) {
    const tex = G.softTex;
    const parts = [];
    for (let i = 0; i < 14; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: '#f3e3c8', transparent: true, depthWrite: false, opacity: 0.8 }));
      const a = i / 14 * Math.PI * 2;
      sp.position.copy(p); sp.position.y += 0.6;
      sp.userData.v = new THREE.Vector3(Math.cos(a), 0.3, Math.sin(a)).multiplyScalar(6 * s);
      sp.scale.setScalar(1.5 * s);
      scene.add(sp); parts.push(sp); S.objs.push(sp);
    }
    let life = 1;
    const fn = world.addAnim((dt) => {
      life -= dt * 1.5;
      for (const sp of parts) {
        sp.position.addScaledVector(sp.userData.v, dt);
        sp.userData.v.multiplyScalar(0.92);
        sp.material.opacity = Math.max(0, life * 0.8);
        sp.scale.setScalar((1.5 + (1 - life) * 3) * s);
      }
      if (life <= 0) world.removeAnim(fn);
    });
    S.objs.push(fn);
  }

  function update(dt, t) {
    if (!S) return;
    if (aim.visible) {
      const k = (t * 1.5) % 1;
      aim.userData.ring2.scale.setScalar(1 + k * 0.6);
      aim.userData.ring2.material.opacity = 0.8 * (1 - k);
      const s = THREE.MathUtils.clamp(camera.position.distanceTo(aim.position) / 200, 0.8, 3);
      aim.scale.setScalar(aim.scale.x + (s - aim.scale.x) * 0.2);
    }
    if (S.phase === 'aim' && !G.paused) {
      S.timeLeft -= dt;
      const frac = Math.max(0, S.timeLeft / TIME[S.level]);
      $('#gq-time').style.width = (frac * 100) + '%';
      $('#gq-tnum').textContent = Math.max(0, Math.ceil(S.timeLeft));
      const c = Math.ceil(S.timeLeft);
      if (c !== S.lastTick) {
        S.lastTick = c;
        if (c <= 5 && c > 0) { sfx.tickUrgent(); $('#gq-timer').classList.add('urgent'); }
      }
      if (S.timeLeft <= 0) { if (!S.pending) toast('시간이 끝났습니다'); confirm(); }
    }
  }

  function finish() {
    const s = S;
    const total = s.score;
    const stars = total >= 8000 ? 3 : total >= 5500 ? 2 : 1;
    const grade = total >= 9500 ? 'S' : total >= 8000 ? 'A' : total >= 5500 ? 'B' : 'C';
    const ds = s.results.filter((r) => r.d != null).map((r) => r.d);
    const avg = ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : null;
    const best = s.results.filter((r) => r.d != null).sort((a, b) => a.d - b.d)[0];
    const near = ds.filter((d) => d < 25).length;
    const badges = [];
    if (total >= 8000 && addBadge('b_map')) badges.push('b_map');
    const vc = visitedCount();
    if (vc >= 22 && addBadge('b_dex50')) badges.push('b_dex50');
    if (vc >= 43 && addBadge('b_dexall')) badges.push('b_dexall');
    const rec = setBest(`guess:${s.level}`, total);
    const lvl = s.level;
    sfx.fanfare();
    stop();
    G.showResult({
      kicker: '위치 맞히기 결과', title: `위치 맞히기 · ${LV[lvl]}`, color: '#2ed3b7', level: lvl,
      score: total, stars, grade, record: rec, badges,
      stats: [
        ['평균 오차', avg == null ? '-' : `${Math.round(avg)}km`],
        ['가장 가까운 문제', best ? `${best.site.name} ${best.d.toFixed(1)}km` : '-'],
        ['25km 안에 꽂은 깃발', `${near} / ${s.rounds.length}`],
        ['최고 기록', `${fmt(Math.max(total, rec.prev))}점`],
      ],
      retry: () => start(lvl),
      other: () => G.openLevel('guess'),
      otherLabel: '난이도 바꾸기',
    });
  }

  function stop() {
    if (!S) return;
    clearRound();
    aim.visible = false;
    G.labels.clearGroup('guess');
    $('#gq-confirm').classList.remove('show');
    $('#gq-result').classList.remove('show');
    G.plane.mesh.visible = true;
    S = null;
  }

  $('#gq-confirm').onclick = () => { sfx.click(); confirm(); };

  return {
    start, update, stop,
    get active() { return !!S; },
    debugPlace(off = 18) {
      if (!S) return;
      const s = S.site;
      const p = new THREE.Vector3(s.x + off, 0, s.z - off * 0.6);
      p.y = world.floorAt(p.x, p.z);
      S.pending = p; aim.position.copy(p); aim.visible = true;
      $('#gq-confirm').disabled = false;
    },
    debugConfirm() { confirm(); },
  };
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
function tween(ms, fn) {
  return new Promise((res) => {
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      fn(k);
      if (k < 1) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });
}
